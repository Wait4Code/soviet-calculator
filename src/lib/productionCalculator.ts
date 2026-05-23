import { ProductionResult, ProductionRecipe, ResourceProduction } from '@/data/types';
import { productions } from '@/data/productions';
import { formatNumber } from '@/lib/format';
import { migrateVehicleConfig as _migrateVehicleConfig } from '@/lib/calculator/vehicleUtils';
import { calculateBuildingsAndWorkers as _calcBW, calculateRequirementsForBuildings as _calcReq, type BuildingCalcResult } from '@/lib/calculator/buildingCalculator';
import { calculateProductionChain as _calculateProductionChain, aggregateResults as _aggregateResults, findDependentResources as _findDependentResources } from '@/lib/calculator/chainResolver';

/**
 * Type d'input pour le calcul
 */
export type InputType = 'buildings' | 'output_per_second' | 'output_per_day' | 'output_per_year';

/** Config véhicules + personnel pour une mine (carrières avec véhicules) */
export interface MineVehicleConfig {
  /** Emplacements véhicules : vehicleId ou null (vide). Longueur = maxVehicles de la recette. */
  vehicleSlots: (string | null)[];
  /** Autoriser du personnel en plus des véhicules (capacité = véhicules + workers, pas de plafond total) */
  allowPersonnel: boolean;
}

/**
 * Configuration pour le calcul de production
 */
export interface CalculationConfig {
  /** ID de la ressource cible */
  resourceId: string;
  /** Nom de l'usine à utiliser (si plusieurs options) */
  buildingName?: string;
  /** Type d'input */
  inputType: InputType;
  /** Valeur de l'input */
  value: number;
  /** Ressources désactivées (importées, pas de calcul en amont) */
  disabledResources: Set<string>;
  /** Qualité de source par défaut pour les mines (0-100%, défaut 50%) */
  sourceQuality?: number;
  /** Surcharges locales de qualité de source par ressource (chaîne en cours uniquement) */
  sourceQualityByResource?: Record<string, number>;
  /** ID du véhicule par défaut pour les carrières */
  defaultVehicleId?: string;
  /** Bâtiment par défaut par ressource (resourceId -> buildingName) pour les ressources à plusieurs recettes */
  defaultBuildingByResource?: Record<string, string>;
  /** Année (affecte composants et appareils électroniques, défaut 1960) */
  year?: number;
  /** Config véhicules + personnel par ressource (mines avec véhicules uniquement) */
  vehicleConfigByResource?: Record<string, MineVehicleConfig>;
  /** Surcharge du taux de charge par ressource (0-1, uniquement à la hausse) */
  chargeRatioByResource?: Record<string, number>;
}

/** @deprecated use @/lib/calculator/vehicleUtils directly */
export function migrateVehicleConfig(old: MineVehicleConfig, maxVehicles: number, defaultVehicleId: string): MineVehicleConfig {
  return _migrateVehicleConfig(old, maxVehicles, defaultVehicleId);
}

/**
 * Calcule la production nécessaire pour atteindre un objectif donné
 * Utilise la nouvelle structure de productions.json
 */
export class ProductionCalculator {
  private productions: Map<string, ResourceProduction>;

  constructor() {
    this.productions = productions;
  }

  /**
   * Obtient toutes les productions disponibles
   */
  getAllProductions(): ResourceProduction[] {
    return Array.from(this.productions.values());
  }

  /**
   * Obtient une production par ID de ressource
   */
  getProduction(resourceId: string): ResourceProduction | undefined {
    return this.productions.get(resourceId);
  }

  /**
   * Trouve toutes les recettes qui produisent une ressource donnée
   */
  findRecipesProducing(resourceId: string): ProductionRecipe[] {
    const production = this.getProduction(resourceId);
    return production ? production.recipes : [];
  }

  /**
   * Convertit une valeur selon le type d'input en production par jour
   * Les valeurs dans productions.json sont en tonnes/jour par travailleur
   */
  convertToPerDay(
    inputType: InputType,
    value: number
  ): number {
    switch (inputType) {
      case 'buildings':
        // Si on a le nombre de bâtiments, on ne peut pas convertir sans connaître la production
        // Cette fonction sera appelée différemment dans ce cas
        return 0;
      case 'output_per_second':
        // Convertir de par seconde à par jour
        return value * 24 * 60 * 60;
      case 'output_per_day':
        return value;
      case 'output_per_year':
        // Convertir de par an à par jour
        return value / 365;
      default:
        return 0;
    }
  }

  /**
   * Calcule le nombre de bâtiments nécessaires pour une production donnée par jour
   * production est en tonnes/jour par travailleur
   * Si le nombre de travailleurs dépasse la capacité d'un bâtiment, on divise sur plusieurs bâtiments
   */
  calculateBuildingsNeeded(
    recipe: ProductionRecipe,
    targetOutputPerDay: number
  ): number {
    if (recipe.production === 0 || recipe.workers === 0) return 0;
    // Production totale d'un bâtiment = production * workers (en tonnes/jour)
    const productionPerBuildingPerDay = recipe.production * recipe.workers;
    return targetOutputPerDay / productionPerBuildingPerDay;
  }

  /**
   * Vérifie si une recette est une mine (nécessite qualité de source)
   */
  isMineRecipe(recipe: ProductionRecipe): boolean {
    return recipe.isMine === true;
  }

  /**
   * Vérifie si un résultat (resourceId + buildingName) correspond à une mine
   */
  isMineResult(resourceId: string, buildingName: string): boolean {
    const production = this.getProduction(resourceId);
    const recipe = production?.recipes.find((r) => r.name === buildingName);
    return recipe ? this.isMineRecipe(recipe) : false;
  }

  /**
   * Vérifie si une recette nécessite des véhicules
   */
  requiresVehiclesRecipe(recipe: ProductionRecipe): boolean {
    return recipe.requiresVehicles === true;
  }

  /** Vérifie si un résultat correspond à une mine avec véhicules */
  isVehicleMineResult(resourceId: string, buildingName: string): boolean {
    const production = this.getProduction(resourceId);
    const recipe = production?.recipes.find((r) => r.name === buildingName);
    return !!recipe && this.requiresVehiclesRecipe(recipe);
  }

  /** Obtient la recette pour un resourceId + buildingName */
  getRecipe(resourceId: string, buildingName: string): ProductionRecipe | undefined {
    const production = this.getProduction(resourceId);
    return production?.recipes.find((r) => r.name === buildingName);
  }

  /**
   * Obtient le nombre maximum de véhicules pour une recette
   */
  getMaxVehicles(recipe: ProductionRecipe): number {
    return recipe.maxVehicles ?? 0;
  }

  /**
   * Calcule le nombre de bâtiments et la répartition des travailleurs
   * Si les travailleurs dépassent la capacité, on divise sur plusieurs bâtiments
   * Pour les mines avec véhicules : vehicleConfig permet de choisir types/quantités et personnel
   */
  calculateBuildingsAndWorkers(
    recipe: ProductionRecipe,
    targetOutputPerDay: number,
    _resourceId: string,
    sourceQuality: number = 50,
    defaultVehicleId: string = 'e-10011d',
    year: number = 1960,
    vehicleConfig?: MineVehicleConfig
  ): BuildingCalcResult {
    return _calcBW(recipe, targetOutputPerDay, _resourceId, sourceQuality, defaultVehicleId, year, vehicleConfig);
  }

  /**
   * Calcule les besoins pour un nombre de bâtiments donné
   * Les valeurs dans productions.json sont en tonnes/jour par travailleur
   */
  calculateRequirementsForBuildings(
    resourceId: string,
    recipe: ProductionRecipe,
    buildingCount: number,
    totalWorkers: number,
    workersPerBuilding?: number,
    chargeRatio?: number,
    sourceQualityFactor: number = 1,
    vehicleProductionPerDay?: number,
    year: number = 1960
  ): ProductionResult {
    return _calcReq(resourceId, recipe, buildingCount, totalWorkers, workersPerBuilding, chargeRatio, sourceQualityFactor, vehicleProductionPerDay, year);
  }

  /**
   * Vérifie si une ressource est une ressource de base (extraction, pas de consommation)
   */
  isBaseResource(resourceId: string): boolean {
    const production = this.getProduction(resourceId);
    if (!production || production.recipes.length === 0) return false;

    return production.recipes.some(
      (recipe) => Object.keys(recipe.consumption).length === 0
    );
  }

  /**
   * Calcule récursivement toute la chaîne de production nécessaire
   */
  calculateProductionChain(
    config: CalculationConfig,
    maxDepth: number = 20,
    visited: Set<string> = new Set()
  ): ProductionResult[] {
    return _calculateProductionChain(config, maxDepth, visited);
  }

  /**
   * Agrège les résultats de production pour éviter les doublons.
   * Recalcule le chargeRatio à partir des totaux agrégés (production totale / capacité totale)
   * au lieu de garder celui du premier résultat.
   */
  aggregateResults(results: ProductionResult[]): ProductionResult[] {
    return _aggregateResults(results);
  }

  /**
   * Calcule le surplus de production par ressource (production - consommation par aval)
   * Map<resourceId, surplusPerSecond>
   */
  computeSurplusByResource(results: ProductionResult[]): Map<string, number> {
    const production = new Map<string, number>();
    const consumption = new Map<string, number>();
    results.forEach((result) => {
      result.outputsPerSecond.forEach((amount, resourceId) => {
        production.set(resourceId, (production.get(resourceId) ?? 0) + amount);
      });
      result.inputsPerSecond.forEach((amount, resourceId) => {
        consumption.set(resourceId, (consumption.get(resourceId) ?? 0) + amount);
      });
    });
    const surplus = new Map<string, number>();
    production.forEach((prod, resourceId) => {
      const cons = consumption.get(resourceId) ?? 0;
      const s = prod - cons;
      surplus.set(resourceId, s);
    });
    return surplus;
  }

  /**
   * Calcule le nombre total de travailleurs nécessaires pour une chaîne de production
   */
  calculateTotalWorkers(results: ProductionResult[]): number {
    return results.reduce((total, result) => total + result.totalWorkers, 0);
  }

  /**
   * Calcule le nombre total de professeurs nécessaires pour une chaîne de production
   */
  calculateTotalProfessors(results: ProductionResult[]): number {
    return results.reduce((total, result) => total + result.totalProfessors, 0);
  }

  /**
   * Trouve toutes les ressources à retirer car elles ne sont utilisées que par des ressources désactivées
   * @param disabledResources - Ensemble des ressources désactivées (importées)
   * @param results - Résultats de la chaîne complète
   */
  findDependentResources(
    disabledResources: Set<string>,
    results: ProductionResult[]
  ): Set<string> {
    return _findDependentResources(disabledResources, results);
  }

  /**
   * Vérifie si une ressource est de l'eau (pour l'affichage en m3)
   */
  isWater(resourceId: string): boolean {
    return resourceId === 'water';
  }

  /**
   * Vérifie si une ressource est des eaux usées (sewage, m³)
   */
  isSewage(resourceId: string): boolean {
    return resourceId === 'sewage';
  }

  /**
   * Vérifie si une ressource est une sortie déchets (mixte ou dangereux, t/j)
   */
  isWasteOutput(resourceId: string): boolean {
    return resourceId === 'waste_mixed' || resourceId === 'waste_toxic';
  }

  /**
   * Formate une valeur pour l'affichage (t/jour ou m3/jour)
   */
  formatProductionValue(value: number, resourceId: string): string {
    const unit = (this.isWater(resourceId) || this.isSewage(resourceId)) ? 'm³' : 't';
    return `${formatNumber(value)} ${unit}/jour`;
  }

  /**
   * Vérifie si une ressource est de l'électricité
   */
  isElectricity(resourceId: string): boolean {
    return resourceId === 'eletric';
  }

  /**
   * Vérifie si une ressource peut être désactivée (pas l'eau ni l'électricité)
   */
  canDisableResource(resourceId: string): boolean {
    return !this.isWater(resourceId) && !this.isElectricity(resourceId) && !this.isSewage(resourceId) && !this.isWasteOutput(resourceId);
  }

  /**
   * Formate une valeur d'électricité en MWh
   */
  formatElectricityValue(valuePerDay: number): string {
    return `${formatNumber(valuePerDay * 60)} MWh/jour`;
  }

  /**
   * Formate une valeur numérique (Intl, useGrouping, maximumSignificantDigits: 3)
   */
  formatValue(value: number): string {
    return formatNumber(value);
  }

  /**
   * Formate un nombre entier (bâtiments, pourcentages, etc.)
   */
  formatInteger(value: number): string {
    return formatNumber(value);
  }

  /**
   * Arrondit à l'unité inférieure
   */
  floor(value: number): number {
    return Math.floor(value);
  }
}

// Instance singleton
export const productionCalculator = new ProductionCalculator();
