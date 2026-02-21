import { ProductionResult, ProductionRecipe, ResourceProduction } from '@/data/types';
import { productions, getResourceName } from '@/data/productions';
import { getVehicle, getVehicleSkillLevel } from '@/data/vehicles';
import { formatNumber } from '@/lib/format';

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Facteur de production : clamp(1 - (year - p1) / p2, p3, 1) */
function getProductionFactor(year: number, params: { p1: number; p2: number; p3: number }): number {
  const raw = 1 - (year - params.p1) / params.p2;
  return clamp(raw, params.p3, 1);
}

/** Facteur de consommation : 1 + clamp((year - p1) / p2, 0, p3) */
function getConsumptionFactor(year: number, params: { p1: number; p2: number; p3: number }): number {
  const raw = (year - params.p1) / params.p2;
  return 1 + clamp(raw, 0, params.p3);
}

function getSourceQuality(config: CalculationConfig, resourceId: string): number {
  return config.sourceQualityByResource?.[resourceId] ?? config.sourceQuality ?? 50;
}

function getDefaultBuilding(
  config: CalculationConfig,
  resourceId: string,
  recipes: ProductionRecipe[]
): string {
  if (recipes.length === 0) return '';
  const def = config.defaultBuildingByResource?.[resourceId];
  if (def && recipes.some((r) => r.name === def)) return def;
  return recipes[0].name;
}

function getYear(config: CalculationConfig): number {
  return config.year ?? 1960;
}

/** Taux de charge effectif : surcharge uniquement à la hausse si configurée */
function getEffectiveChargeRatio(
  config: CalculationConfig,
  resourceId: string,
  calculated: number
): number {
  const override = config.chargeRatioByResource?.[resourceId];
  if (override === undefined) return calculated;
  const result = Math.max(calculated, Math.min(1, override));
  return result;
}

/** Construit la config véhicule par défaut (tous les emplacements avec defaultVehicleId, pas de personnel) */
function getDefaultMineVehicleConfig(
  recipe: ProductionRecipe,
  defaultVehicleId: string
): MineVehicleConfig {
  const maxVehicles = recipe.maxVehicles ?? 0;
  return {
    vehicleSlots: Array(maxVehicles).fill(defaultVehicleId),
    allowPersonnel: false,
  };
}

/** Migre l'ancien format (vehicles) vers le nouveau (vehicleSlots) - exporté pour l'UI */
export function migrateVehicleConfig(old: MineVehicleConfig, maxVehicles: number, defaultVehicleId: string): MineVehicleConfig {
  if ('vehicleSlots' in old && Array.isArray(old.vehicleSlots)) return old;
  if ('vehicles' in old && Array.isArray((old as { vehicles?: { vehicleId: string; count: number }[] }).vehicles)) {
    const vehicles = (old as { vehicles: { vehicleId: string; count: number }[] }).vehicles;
    const slots: (string | null)[] = [];
    for (const v of vehicles) {
      for (let i = 0; i < v.count && slots.length < maxVehicles; i++) {
        slots.push(v.vehicleId);
      }
    }
    while (slots.length < maxVehicles) slots.push(null);
    return { vehicleSlots: slots.slice(0, maxVehicles), allowPersonnel: old.allowPersonnel };
  }
  return getDefaultMineVehicleConfig({ maxVehicles } as ProductionRecipe, defaultVehicleId);
}

/** Récupère la config véhicule pour une ressource (override ou défaut) */
function getMineVehicleConfig(
  config: CalculationConfig,
  resourceId: string,
  recipe: ProductionRecipe
): MineVehicleConfig {
  const override = config.vehicleConfigByResource?.[resourceId];
  const defaultVehicleId = config.defaultVehicleId ?? 'e-10011d';
  const maxVehicles = recipe.maxVehicles ?? 0;
  if (override) return migrateVehicleConfig(override, maxVehicles, defaultVehicleId);
  return getDefaultMineVehicleConfig(recipe, defaultVehicleId);
}

/** Calcule la capacité véhicules (somme des skill_level par emplacement non vide) */
function computeVehicleCapacity(vehicleSlots: (string | null)[], skill: string): number {
  let total = 0;
  for (const vehicleId of vehicleSlots) {
    if (vehicleId) {
      const vehicle = getVehicle(vehicleId);
      if (vehicle) {
        total += getVehicleSkillLevel(vehicle, skill);
      }
    }
  }
  return total;
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
  ): { buildingCount: number; workersPerBuilding: number; totalWorkers: number; chargeRatio: number; vehicleProductionPerDay?: number; maxPersonnelProductionPerDay?: number; maxProductionPerBuilding?: number; invalidConfig?: boolean; allowPersonnel?: boolean } {
    if (recipe.production === 0) {
      return { buildingCount: 0, workersPerBuilding: 0, totalWorkers: 0, chargeRatio: 0, vehicleProductionPerDay: undefined };
    }

    // Appliquer la qualité de source pour les mines
    const sourceQualityFactor = this.isMineRecipe(recipe) ? sourceQuality / 100 : 1;
    let adjustedProduction = recipe.production * sourceQualityFactor;

    // Appliquer le facteur d'année pour les recettes électroniques
    if (recipe.production_decrease_parameters) {
      adjustedProduction *= getProductionFactor(year, recipe.production_decrease_parameters);
    }

    // Gérer les carrières avec véhicules
    if (this.requiresVehiclesRecipe(recipe)) {
      const effectiveConfig = vehicleConfig ?? getDefaultMineVehicleConfig(recipe, defaultVehicleId);
      const skill = recipe.vehicleSkill ?? 'excavator';

      const vehicleCapacity = computeVehicleCapacity(effectiveConfig.vehicleSlots, skill);
      const allowPersonnel = effectiveConfig.allowPersonnel;
      // Capacité max par bâtiment : véhicules + (personnel si autorisé, jusqu'à recipe.workers)
      // Pas de plafond total : (3*37 + 100) * 3.5 * qualité pour gravel avec 3 excav niveau 37 et 100 workers
      const maxCapacityPerBuilding = vehicleCapacity + (allowPersonnel ? recipe.workers : 0);

      if (maxCapacityPerBuilding > 0) {
        const maxProductionPerBuilding = adjustedProduction * maxCapacityPerBuilding;
        const buildingCount = Math.ceil(targetOutputPerDay / maxProductionPerBuilding);
        // Production véhicules = fixe (pelleteuses toujours à 100 % quand présentes)
        const vehicleProductionPerDay = adjustedProduction * vehicleCapacity * buildingCount;
        // Charge = utilisation du PERSONNEL uniquement. Si les pelleteuses suffisent, charge = 0 %
        const maxPersonnelProductionPerDay = allowPersonnel ? adjustedProduction * recipe.workers * buildingCount : 0;
        const chargeRatio = allowPersonnel && maxPersonnelProductionPerDay > 0
          ? clamp((targetOutputPerDay - vehicleProductionPerDay) / maxPersonnelProductionPerDay, 0, 1)
          : 0;

        // Personnel : charge × workers par bâtiment
        const personnelPerBuilding = allowPersonnel ? chargeRatio * recipe.workers : 0;
        const totalWorkersNeeded = allowPersonnel ? Math.ceil(personnelPerBuilding * buildingCount) : 0;
        const workersPerBuilding = allowPersonnel ? Math.ceil(personnelPerBuilding) : 0;

        return {
          buildingCount,
          workersPerBuilding,
          totalWorkers: totalWorkersNeeded,
          chargeRatio,
          vehicleProductionPerDay: allowPersonnel ? vehicleProductionPerDay : maxProductionPerBuilding * buildingCount,
          maxPersonnelProductionPerDay: allowPersonnel ? maxPersonnelProductionPerDay : undefined,
          maxProductionPerBuilding,
          allowPersonnel,
        };
      }
      // Sans véhicules ni personnel : carrière ne produit rien
      return {
        buildingCount: 0,
        workersPerBuilding: 0,
        totalWorkers: 0,
        chargeRatio: 0,
        vehicleProductionPerDay: 0,
        invalidConfig: true,
      };
    }

    // Calcul pour les mines avec personnel mais sans véhicules (coal, iron, uranium) : production = base × workers × qualité
    if (this.isMineRecipe(recipe) && recipe.workers > 0 && !this.requiresVehiclesRecipe(recipe)) {
      const maxProductionPerBuilding = adjustedProduction * recipe.workers;
      const buildingCount = Math.ceil(targetOutputPerDay / maxProductionPerBuilding);
      const chargeRatio = buildingCount > 0 ? targetOutputPerDay / (maxProductionPerBuilding * buildingCount) : 0;
      const totalWorkersNeeded = Math.ceil(recipe.workers * chargeRatio * buildingCount);
      const workersPerBuilding = buildingCount > 0 ? Math.ceil(totalWorkersNeeded / buildingCount) : totalWorkersNeeded;
      return {
        buildingCount,
        workersPerBuilding,
        totalWorkers: totalWorkersNeeded,
        chargeRatio,
        vehicleProductionPerDay: undefined,
      };
    }

    // Calcul pour les bâtiments sans personnel (mines workers=0 comme oil, éoliennes, etc.)
    if (recipe.workers === 0 || this.isMineRecipe(recipe)) {
      const productionPerBuilding = adjustedProduction;
      
      // Calculer le nombre de bâtiments nécessaires (arrondi au supérieur)
      const buildingCount = Math.ceil(targetOutputPerDay / productionPerBuilding);
      
      // Pas de personnel ni ratio de charge (production fixe)
      return {
        buildingCount,
        workersPerBuilding: 0,
        totalWorkers: 0,
        chargeRatio: 0,
        vehicleProductionPerDay: undefined,
      };
    }

    // Production maximale d'un bâtiment (en tonnes/jour)
    const maxProductionPerBuilding = adjustedProduction * recipe.workers;
    
    // Calculer le nombre de bâtiments nécessaires (arrondi au supérieur)
    const buildingCount = Math.ceil(targetOutputPerDay / maxProductionPerBuilding);
    
    // Calculer le ratio de charge réel basé sur l'output attendu
    const chargeRatio = buildingCount > 0 ? targetOutputPerDay / (maxProductionPerBuilding * buildingCount) : 0;
    
    // Calculer le nombre total de travailleurs nécessaires basé sur le ratio de charge
    const totalWorkersNeeded = Math.ceil(recipe.workers * chargeRatio * buildingCount);
    
    // Répartir les travailleurs équitablement sur les bâtiments
    const workersPerBuilding = buildingCount > 0 
      ? Math.ceil(totalWorkersNeeded / buildingCount)
      : totalWorkersNeeded;

    return {
      buildingCount,
      workersPerBuilding,
      totalWorkers: totalWorkersNeeded,
      chargeRatio,
      vehicleProductionPerDay: undefined,
    };
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
    const inputsPerDay = new Map<string, number>();
    const outputsPerDay = new Map<string, number>();

    // Pas de personnel : workers=0 (ex. oil_mine) ou mine avec véhicules sans personnel (allowPersonnel=false)
    const noPersonnel = recipe.workers === 0 || (this.isMineRecipe(recipe) && this.requiresVehiclesRecipe(recipe) && totalWorkers === 0);

    // Si chargeRatio n'est pas fourni, le calculer à partir des travailleurs
    const actualChargeRatio = noPersonnel ? 0 : (chargeRatio !== undefined 
      ? chargeRatio 
      : (recipe.workers > 0 && workersPerBuilding !== undefined 
          ? workersPerBuilding / recipe.workers 
          : 1));

    // Calculer les sorties : production * totalWorkers (en tonnes/jour)
    // Utiliser le ratio de charge pour avoir la production exacte
    // Appliquer le facteur de qualité de source pour les mines
    // Pour les mines avec véhicules, utiliser la production calculée avec les véhicules
    let outputPerDay: number;
    if (vehicleProductionPerDay !== undefined) {
      // Production déjà calculée avec les véhicules
      outputPerDay = vehicleProductionPerDay;
    } else {
      const baseProductionPerBuilding = recipe.production * sourceQualityFactor;
      // Si requiresVehicles, la production est déjà calculée avec les véhicules
      // Mines avec workers (coal, iron, uranium) : production × workers × qualité × bâtiments
      // Autres sans personnel (oil, éoliennes) : production × qualité × bâtiments
      if (noPersonnel) {
        if (this.isMineRecipe(recipe) && recipe.workers > 0 && !this.requiresVehiclesRecipe(recipe)) {
          outputPerDay = recipe.production * recipe.workers * sourceQualityFactor * buildingCount;
        } else {
          outputPerDay = baseProductionPerBuilding * buildingCount;
        }
      } else {
        const maxProductionPerBuilding = this.requiresVehiclesRecipe(recipe)
          ? baseProductionPerBuilding  // Pour les véhicules, production est déjà en t/j/niveau, pas besoin de multiplier par workers
          : baseProductionPerBuilding * recipe.workers;
        outputPerDay = maxProductionPerBuilding * actualChargeRatio * buildingCount;
      }
    }
    // Appliquer le facteur d'année sur la production (composants/appareils électroniques)
    const productionFactor = recipe.production_decrease_parameters
      ? getProductionFactor(year, recipe.production_decrease_parameters)
      : 1;
    outputsPerDay.set(resourceId, outputPerDay * productionFactor);

    // Facteur de consommation : 1 + clamp((year - p1) / p2, 0, p3) via consumption_increase_parameters
    const consumptionFactor = recipe.consumption_increase_parameters
      ? getConsumptionFactor(year, recipe.consumption_increase_parameters)
      : 1;

    // Calculer les entrées : utiliser le ratio de charge pour avoir la consommation exacte
    // Exception : l'électricité ne se multiplie pas par le nombre de travailleurs
    Object.entries(recipe.consumption).forEach(([inputResourceId, consumptionPerWorkerPerDay]) => {
      let consumptionPerDay: number;
      if (noPersonnel) {
        // Pour les bâtiments sans personnel (mines, etc.), consommation directe par bâtiment
        consumptionPerDay = consumptionPerWorkerPerDay * buildingCount;
      } else if (this.isElectricity(inputResourceId)) {
        // L'électricité est déjà en MWh/jour par bâtiment, on multiplie par le nombre de bâtiments et le ratio de charge
        consumptionPerDay = consumptionPerWorkerPerDay * buildingCount * actualChargeRatio;
      } else {
        // Pour les autres ressources, utiliser le ratio de charge avec la capacité max
        const maxConsumptionPerBuilding = consumptionPerWorkerPerDay * recipe.workers;
        consumptionPerDay = maxConsumptionPerBuilding * actualChargeRatio * buildingCount;
      }
      inputsPerDay.set(inputResourceId, consumptionPerDay * consumptionFactor);
    });

    // Consommation fixe par bâtiment (indépendante de la charge) : consommation_fixed × buildingCount
    const consumptionFixed = recipe.consumption_fixed ?? {};
    Object.entries(consumptionFixed).forEach(([inputResourceId, perBuildingPerDay]) => {
      const consumptionPerDay = perBuildingPerDay * buildingCount;
      const current = inputsPerDay.get(inputResourceId) ?? 0;
      inputsPerDay.set(inputResourceId, current + consumptionPerDay);
    });

    // Convertir en par seconde pour l'affichage
    const inputsPerSecond = new Map<string, number>();
    const outputsPerSecond = new Map<string, number>();
    
    inputsPerDay.forEach((amount, resourceId) => {
      inputsPerSecond.set(resourceId, amount / (24 * 60 * 60));
    });
    
    outputsPerDay.forEach((amount, resourceId) => {
      outputsPerSecond.set(resourceId, amount / (24 * 60 * 60));
    });

    // Calculer les travailleurs par bâtiment (mines : 0 personnel, 0 charge)
    const actualWorkersPerBuilding = noPersonnel ? 0 : (workersPerBuilding !== undefined 
      ? workersPerBuilding 
      : (buildingCount > 0 ? Math.ceil(totalWorkers / buildingCount) : recipe.workers));
    const maxWorkersPerBuilding = noPersonnel ? 0 : recipe.workers;
    const maxProfesorsPerBuilding = noPersonnel ? 0 : recipe.profesors;
    
    // Appliquer le ratio de charge aux cols-blancs (proportionnel à la charge)
    const actualProfesorsPerBuilding = noPersonnel ? 0 : Math.ceil(maxProfesorsPerBuilding * actualChargeRatio);
    // Calculer le total en utilisant le ratio exact pour éviter les erreurs d'arrondi
    const totalProfesorsResult = noPersonnel ? 0 : Math.ceil(maxProfesorsPerBuilding * actualChargeRatio * buildingCount);

    return {
      resourceId,
      resourceName: getResourceName(resourceId),
      buildingName: recipe.name,
      buildingCount,
      inputsPerSecond,
      outputsPerSecond,
      totalWorkers: noPersonnel ? 0 : totalWorkers,
      totalProfesors: totalProfesorsResult,
      workersPerBuilding: actualWorkersPerBuilding,
      maxWorkersPerBuilding,
      profesorsPerBuilding: actualProfesorsPerBuilding,
      maxProfesorsPerBuilding,
      chargeRatio: actualChargeRatio,
    };
  }

  /**
   * Vérifie si une ressource est une ressource de base (extraction, pas de consommation)
   */
  isBaseResource(resourceId: string): boolean {
    const production = this.getProduction(resourceId);
    if (!production || production.recipes.length === 0) return false;

    // Une ressource de base a au moins une recette sans consommation
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
    if (maxDepth <= 0 || visited.has(config.resourceId)) {
      return [];
    }

    visited.add(config.resourceId);
    const results: ProductionResult[] = [];

    const production = this.getProduction(config.resourceId);
    if (!production) return results;

    // Si la ressource est désactivée, on ne calcule pas en amont mais on la garde dans les résultats
    // (elle sera ajoutée depuis la chaîne complète dans le composant)
    if (config.disabledResources.has(config.resourceId)) {
      return results; // Ne pas calculer les dépendances
    }

    // Trouver la recette à utiliser (spécifiée, défaut configuré, ou première)
    let recipe: ProductionRecipe | undefined;
    const buildingName = config.buildingName ?? getDefaultBuilding(config, config.resourceId, production.recipes);
    recipe = production.recipes.find((r) => r.name === buildingName);

    if (!recipe) return results;

    // Convertir la valeur en production par jour
    let targetOutputPerDay: number;
    if (config.inputType === 'buildings') {
      const sourceQuality = getSourceQuality(config, config.resourceId);
      const defaultVehicleId = config.defaultVehicleId ?? 'e-10011d';
      
      // Pour les carrières avec véhicules, calculer différemment
      if (this.requiresVehiclesRecipe(recipe)) {
        const vehicleConfig = getMineVehicleConfig(config, config.resourceId, recipe);
        const sourceQualityFactor = sourceQuality / 100;
        const adjustedProduction = recipe.production * sourceQualityFactor;
        const skill = recipe.vehicleSkill ?? 'excavator';
        const vehicleCapacity = computeVehicleCapacity(vehicleConfig.vehicleSlots, skill);
        const allowPersonnel = vehicleConfig.allowPersonnel;
        const maxCapacityPerBuilding = vehicleCapacity + (allowPersonnel ? recipe.workers : 0);

        if (maxCapacityPerBuilding > 0) {
          const buildingCount = Math.ceil(config.value);
          const chargeRatio = config.value / buildingCount;
          // Surcharge charge : uniquement quand il y a du personnel. Pelleteuses seules = pleine capacité.
          const effectiveChargeRatio = allowPersonnel ? getEffectiveChargeRatio(config, config.resourceId, chargeRatio) : chargeRatio;
          const maxProductionPerBuilding = adjustedProduction * maxCapacityPerBuilding;
          const totalProductionPerDay =
            allowPersonnel
              ? maxProductionPerBuilding * effectiveChargeRatio * buildingCount
              : maxProductionPerBuilding * buildingCount;

          const capacityUsedPerBuilding = maxCapacityPerBuilding * effectiveChargeRatio;
          const personnelPerBuilding = allowPersonnel
            ? Math.max(0, Math.min(recipe.workers, capacityUsedPerBuilding - vehicleCapacity))
            : 0;
          const totalWorkers = allowPersonnel ? Math.ceil(personnelPerBuilding * buildingCount) : 0;
          const workersPerBuilding = allowPersonnel ? Math.ceil(personnelPerBuilding) : 0;

          const result = this.calculateRequirementsForBuildings(
            config.resourceId,
            recipe,
            buildingCount,
            totalWorkers,
            workersPerBuilding,
            effectiveChargeRatio,
            sourceQualityFactor,
            totalProductionPerDay,
            getYear(config)
          );
          results.push(result);

          if (!config.disabledResources.has(config.resourceId)) {
            result.inputsPerSecond.forEach((amountPerSecond, inputResourceId) => {
              const producingRecipes = this.findRecipesProducing(inputResourceId);
              const isProducible = producingRecipes.length > 0;

              if (!config.disabledResources.has(inputResourceId) && isProducible) {
                const amountPerDay = amountPerSecond * 24 * 60 * 60;
                const subConfig: CalculationConfig = {
                  resourceId: inputResourceId,
                  buildingName: getDefaultBuilding(config, inputResourceId, producingRecipes),
                  inputType: 'output_per_day',
                  value: amountPerDay,
                  disabledResources: config.disabledResources,
                  sourceQuality: config.sourceQuality,
                  sourceQualityByResource: config.sourceQualityByResource,
                  defaultVehicleId,
                  defaultBuildingByResource: config.defaultBuildingByResource,
                  year: config.year,
                  vehicleConfigByResource: config.vehicleConfigByResource,
                  chargeRatioByResource: config.chargeRatioByResource,
                };
                const subChain = this.calculateProductionChain(subConfig, maxDepth - 1, new Set(visited));
                results.push(...subChain);
              }
            });
          }

          return results;
        }
        // Sans véhicules ni personnel : carrière ne produit rien
        const invalidResult: ProductionResult = {
          resourceId: config.resourceId,
          resourceName: getResourceName(config.resourceId),
          buildingName: recipe.name,
          buildingCount: 0,
          inputsPerSecond: new Map(),
          outputsPerSecond: new Map([[config.resourceId, 0]]),
          totalWorkers: 0,
          totalProfesors: 0,
          workersPerBuilding: 0,
          maxWorkersPerBuilding: recipe.workers,
          profesorsPerBuilding: 0,
          maxProfesorsPerBuilding: recipe.profesors ?? 0,
          chargeRatio: 0,
          invalidConfig: true,
        };
        results.push(invalidResult);
        return results;
      }
      
      let result: ProductionResult;
      if (this.isMineRecipe(recipe)) {
        const buildingCount = Math.ceil(config.value);
        const sourceQualityFactor = sourceQuality / 100;
        const noPersonnel = recipe.workers === 0 || this.requiresVehiclesRecipe(recipe);
        const chargeRatio = config.value / buildingCount;
        const effectiveChargeRatio = getEffectiveChargeRatio(config, config.resourceId, noPersonnel ? 0 : chargeRatio);
        const workersPerBuilding = noPersonnel ? 0 : Math.ceil(recipe.workers * effectiveChargeRatio);
        const totalWorkers = noPersonnel ? 0 : workersPerBuilding * buildingCount;
        result = this.calculateRequirementsForBuildings(
          config.resourceId,
          recipe,
          buildingCount,
          totalWorkers,
          workersPerBuilding,
          noPersonnel ? 0 : effectiveChargeRatio,
          sourceQualityFactor,
          undefined,
          getYear(config)
        );
      } else {
        const buildingCount = Math.ceil(config.value);
        const chargeRatio = config.value / buildingCount;
        const effectiveChargeRatio = getEffectiveChargeRatio(config, config.resourceId, chargeRatio);
        const sourceQualityFactor = 1;
        const workersPerBuilding = Math.ceil(recipe.workers * effectiveChargeRatio);
        const totalWorkers = workersPerBuilding * buildingCount;
        result = this.calculateRequirementsForBuildings(
          config.resourceId,
          recipe,
          buildingCount,
          totalWorkers,
          workersPerBuilding,
          effectiveChargeRatio,
          sourceQualityFactor,
          undefined,
          getYear(config)
        );
      }
      results.push(result);

      // Si la ressource actuelle est désactivée, ne pas calculer ses besoins en ressources d'entrée
      // (car on n'a plus besoin de bâtiments pour la produire)
      if (config.disabledResources.has(config.resourceId)) {
        return results;
      }

      // Calculer les besoins en amont pour chaque ressource d'entrée
      // Convertir de par seconde à par jour
      result.inputsPerSecond.forEach((amountPerSecond, inputResourceId) => {
        // Vérifier si la ressource est produisible
        const producingRecipes = this.findRecipesProducing(inputResourceId);
        const isProducible = producingRecipes.length > 0;
        
        if (!config.disabledResources.has(inputResourceId) && isProducible) {
          const amountPerDay = amountPerSecond * 24 * 60 * 60;
          const subConfig: CalculationConfig = {
            resourceId: inputResourceId,
            buildingName: getDefaultBuilding(config, inputResourceId, producingRecipes),
            inputType: 'output_per_day',
            value: amountPerDay,
            disabledResources: config.disabledResources,
            sourceQuality: config.sourceQuality,
            sourceQualityByResource: config.sourceQualityByResource,
            defaultVehicleId: config.defaultVehicleId,
            defaultBuildingByResource: config.defaultBuildingByResource,
            year: config.year,
            vehicleConfigByResource: config.vehicleConfigByResource,
            chargeRatioByResource: config.chargeRatioByResource,
          };
          const subChain = this.calculateProductionChain(subConfig, maxDepth - 1, new Set(visited));
          results.push(...subChain);
        } else {
          // Ressource non produisible ou désactivée : l'ajouter comme ressource importée
          const nonProducibleResult: ProductionResult = {
            resourceId: inputResourceId,
            resourceName: getResourceName(inputResourceId),
            buildingName: 'Import',
            buildingCount: 0,
            inputsPerSecond: new Map(),
            outputsPerSecond: new Map([[inputResourceId, amountPerSecond]]),
            totalWorkers: 0,
            totalProfesors: 0,
            workersPerBuilding: 0,
            maxWorkersPerBuilding: 0,
            profesorsPerBuilding: 0,
            maxProfesorsPerBuilding: 0,
            disabled: true,
          };
          results.push(nonProducibleResult);
        }
      });

      return results;
    } else {
      // Convertir en production par jour
      targetOutputPerDay = this.convertToPerDay(config.inputType, config.value);
    }

    // Calculer le nombre de bâtiments et la répartition des travailleurs
    const sourceQuality = getSourceQuality(config, config.resourceId);
    const defaultVehicleId = config.defaultVehicleId ?? 'e-10011d';
    const year = getYear(config);
    const vehicleConfig = this.requiresVehiclesRecipe(recipe)
      ? getMineVehicleConfig(config, config.resourceId, recipe)
      : undefined;
    const bw = this.calculateBuildingsAndWorkers(
      recipe,
      targetOutputPerDay,
      config.resourceId,
      sourceQuality,
      defaultVehicleId,
      year,
      vehicleConfig
    );
    const { buildingCount, totalWorkers, workersPerBuilding, chargeRatio, vehicleProductionPerDay, maxPersonnelProductionPerDay, invalidConfig, allowPersonnel } = bw;

    if (invalidConfig) {
      const invalidResult: ProductionResult = {
        resourceId: config.resourceId,
        resourceName: getResourceName(config.resourceId),
        buildingName: recipe.name,
        buildingCount: 0,
        inputsPerSecond: new Map(),
        outputsPerSecond: new Map([[config.resourceId, 0]]),
        totalWorkers: 0,
        totalProfesors: 0,
        workersPerBuilding: 0,
        maxWorkersPerBuilding: recipe.workers,
        profesorsPerBuilding: 0,
        maxProfesorsPerBuilding: recipe.profesors ?? 0,
        chargeRatio: 0,
        invalidConfig: true,
      };
      results.push(invalidResult);
      return results;
    }

    const effectiveChargeRatio = getEffectiveChargeRatio(config, config.resourceId, chargeRatio);
    // Carrières véhicules sans personnel : garder totalWorkers=0 (ne pas recalculer depuis recipe.workers)
    const effectiveTotalWorkers =
      vehicleProductionPerDay !== undefined && totalWorkers === 0
        ? 0
        : recipe.workers > 0
          ? Math.ceil(recipe.workers * effectiveChargeRatio * buildingCount)
          : totalWorkers;
    const effectiveWorkersPerBuilding = recipe.workers > 0 && buildingCount > 0 ? Math.ceil(effectiveTotalWorkers / buildingCount) : workersPerBuilding;

    // Production totale = véhicules (fixe) + charge × max personnel. Surcharge à 100 % = plus de personnel.
    const adjustedVehicleProductionPerDay =
      vehicleProductionPerDay !== undefined && maxPersonnelProductionPerDay !== undefined && allowPersonnel
        ? vehicleProductionPerDay + effectiveChargeRatio * maxPersonnelProductionPerDay
        : vehicleProductionPerDay;

    // Qualité de source : uniquement pour les mines (extraction). Usines de transformation = 1
    const sourceQualityFactor = this.isMineRecipe(recipe) ? sourceQuality / 100 : 1;

    // Obtenir les besoins pour ce niveau
    const result = this.calculateRequirementsForBuildings(
      config.resourceId,
      recipe,
      buildingCount,
      effectiveTotalWorkers,
      effectiveWorkersPerBuilding,
      effectiveChargeRatio,
      sourceQualityFactor,
      adjustedVehicleProductionPerDay,
      year
    );
    if (allowPersonnel && this.requiresVehiclesRecipe(recipe)) {
      (result as ProductionResult).hasVehiclePersonnelEnabled = true;
      result.chargeRatio = effectiveChargeRatio;
    }
    if (vehicleProductionPerDay !== undefined && this.requiresVehiclesRecipe(recipe)) {
      (result as ProductionResult).vehicleProductionPerDay = vehicleProductionPerDay;
    }
    results.push(result);

    // Si la ressource actuelle est désactivée, ne pas calculer ses besoins en ressources d'entrée
    // (car on n'a plus besoin de bâtiments pour la produire)
    if (config.disabledResources.has(config.resourceId)) {
      return results;
    }

    // Pour chaque ressource d'entrée, chercher comment la produire
    result.inputsPerSecond.forEach((amount, inputResourceId) => {
      // Ignorer les ressources désactivées (mais on les ajoutera quand même pour l'affichage)
      const isDisabled = config.disabledResources.has(inputResourceId);

      // Si c'est une ressource de base, on l'inclut quand même dans la chaîne
      // mais on ne calcule pas ses dépendances (elle n'en a pas)
      if (this.isBaseResource(inputResourceId)) {
        // Inclure la ressource de base dans les résultats
        const baseProduction = this.getProduction(inputResourceId);
        if (baseProduction && baseProduction.recipes.length > 0) {
          const baseBuildingName = getDefaultBuilding(config, inputResourceId, baseProduction.recipes);
          const baseRecipe = baseProduction.recipes.find((r) => r.name === baseBuildingName) ?? baseProduction.recipes[0];
          // Calculer le nombre de bâtiments nécessaires pour produire la quantité requise
          const baseOutputPerDay = amount * 24 * 60 * 60;
          const baseSourceQuality = getSourceQuality(config, inputResourceId);
          const defaultVehicleId = config.defaultVehicleId ?? 'e-10011d';
          const baseVehicleConfig = this.requiresVehiclesRecipe(baseRecipe)
            ? getMineVehicleConfig(config, inputResourceId, baseRecipe)
            : undefined;
          const baseBw = this.calculateBuildingsAndWorkers(baseRecipe, baseOutputPerDay, inputResourceId, baseSourceQuality, defaultVehicleId, year, baseVehicleConfig);
          const { buildingCount: baseBuildingCount, totalWorkers: baseTotalWorkers, workersPerBuilding: baseWorkersPerBuilding, chargeRatio: baseChargeRatio, vehicleProductionPerDay: baseVehicleProductionPerDay, maxPersonnelProductionPerDay: baseMaxPersonnelProductionPerDay, maxProductionPerBuilding: baseMaxProductionPerBuilding, invalidConfig: baseInvalidConfig, allowPersonnel: baseAllowPersonnel } = baseBw;

          if (baseInvalidConfig) {
            const invalidResult: ProductionResult = {
              resourceId: inputResourceId,
              resourceName: getResourceName(inputResourceId),
              buildingName: baseRecipe.name,
              buildingCount: 0,
              inputsPerSecond: new Map(),
              outputsPerSecond: new Map([[inputResourceId, 0]]),
              totalWorkers: 0,
              totalProfesors: 0,
              workersPerBuilding: 0,
              maxWorkersPerBuilding: baseRecipe.workers,
              profesorsPerBuilding: 0,
              maxProfesorsPerBuilding: baseRecipe.profesors ?? 0,
              chargeRatio: 0,
              invalidConfig: true,
            };
            results.push(invalidResult);
            return;
          }

          const baseEffectiveChargeRatio =
            baseVehicleProductionPerDay !== undefined && baseTotalWorkers === 0 && !baseAllowPersonnel
              ? baseChargeRatio
              : getEffectiveChargeRatio(config, inputResourceId, baseChargeRatio);
          const baseEffectiveTotalWorkers =
            baseVehicleProductionPerDay !== undefined && baseTotalWorkers === 0
              ? 0
              : baseRecipe.workers > 0
                ? Math.ceil(baseRecipe.workers * baseEffectiveChargeRatio * baseBuildingCount)
                : baseTotalWorkers;
          const baseEffectiveWorkersPerBuilding = baseRecipe.workers > 0 && baseBuildingCount > 0 ? Math.ceil(baseEffectiveTotalWorkers / baseBuildingCount) : baseWorkersPerBuilding;

          const baseAdjustedVehicleProductionPerDay =
            baseVehicleProductionPerDay !== undefined && baseMaxPersonnelProductionPerDay !== undefined && baseAllowPersonnel
              ? baseVehicleProductionPerDay + baseEffectiveChargeRatio * baseMaxPersonnelProductionPerDay
              : baseVehicleProductionPerDay;

          const baseResult = this.calculateRequirementsForBuildings(
            inputResourceId,
            baseRecipe,
            baseBuildingCount,
            baseEffectiveTotalWorkers,
            baseEffectiveWorkersPerBuilding,
            baseEffectiveChargeRatio,
            baseSourceQuality / 100,
            baseAdjustedVehicleProductionPerDay,
            year
          );
          if (baseAllowPersonnel && this.requiresVehiclesRecipe(baseRecipe)) {
            baseResult.hasVehiclePersonnelEnabled = true;
            baseResult.chargeRatio = baseEffectiveChargeRatio;
          }
          if (baseMaxProductionPerBuilding !== undefined) {
            baseResult.maxProductionPerDay = baseMaxProductionPerBuilding;
          }
          if (baseVehicleProductionPerDay !== undefined && this.requiresVehiclesRecipe(baseRecipe)) {
            baseResult.vehicleProductionPerDay = baseVehicleProductionPerDay;
          }
          results.push(baseResult);
          // Inclure les entrées de la ressource de base (eau, électricité, etc.) dans la chaîne
          baseResult.inputsPerSecond.forEach((inputAmount, inputResourceId) => {
            if (this.isBaseResource(inputResourceId)) return;
            const producingRecipes = this.findRecipesProducing(inputResourceId);
            if (producingRecipes.length === 0) {
              const nonProducibleResult: ProductionResult = {
                resourceId: inputResourceId,
                resourceName: getResourceName(inputResourceId),
                buildingName: 'Import',
                buildingCount: 0,
                inputsPerSecond: new Map(),
                outputsPerSecond: new Map([[inputResourceId, inputAmount]]),
                totalWorkers: 0,
                totalProfesors: 0,
                workersPerBuilding: 0,
                maxWorkersPerBuilding: 0,
                profesorsPerBuilding: 0,
                maxProfesorsPerBuilding: 0,
                disabled: true,
              };
              results.push(nonProducibleResult);
            } else {
              const amountPerDay = inputAmount * 24 * 60 * 60;
              const subConfig: CalculationConfig = {
                resourceId: inputResourceId,
                buildingName: getDefaultBuilding(config, inputResourceId, producingRecipes),
                inputType: 'output_per_day',
                value: amountPerDay,
                disabledResources: config.disabledResources,
                sourceQuality: config.sourceQuality,
                sourceQualityByResource: config.sourceQualityByResource,
                defaultVehicleId: config.defaultVehicleId,
                defaultBuildingByResource: config.defaultBuildingByResource,
                year: config.year,
                vehicleConfigByResource: config.vehicleConfigByResource,
                chargeRatioByResource: config.chargeRatioByResource,
              };
              const subChain = this.calculateProductionChain(subConfig, maxDepth - 1, new Set(visited));
              results.push(...subChain);
            }
          });
        }
        return;
      }

      // Trouver les recettes qui produisent cette ressource
      const producingRecipes = this.findRecipesProducing(inputResourceId);
      if (producingRecipes.length > 0) {
        const defaultBuilding = getDefaultBuilding(config, inputResourceId, producingRecipes);
        if (isDisabled) {
          // Ressource désactivée mais produisible : on l'ajoute quand même pour l'affichage
          const disabledRecipe = producingRecipes.find((r) => r.name === defaultBuilding) ?? producingRecipes[0];
          const disabledResult: ProductionResult = {
            resourceId: inputResourceId,
            resourceName: getResourceName(inputResourceId),
            buildingName: defaultBuilding,
            buildingCount: 0,
            inputsPerSecond: new Map(),
            outputsPerSecond: new Map([[inputResourceId, amount]]),
            totalWorkers: 0,
            totalProfesors: 0,
            workersPerBuilding: 0,
            maxWorkersPerBuilding: disabledRecipe.workers,
            profesorsPerBuilding: 0,
            maxProfesorsPerBuilding: disabledRecipe.profesors,
            disabled: true,
          };
          results.push(disabledResult);
        } else {
          // Convertir de par seconde à par jour
          const amountPerDay = amount * 24 * 60 * 60;
          const subConfig: CalculationConfig = {
            resourceId: inputResourceId,
            buildingName: defaultBuilding,
            inputType: 'output_per_day',
            value: amountPerDay,
            disabledResources: config.disabledResources,
            sourceQuality: config.sourceQuality,
            sourceQualityByResource: config.sourceQualityByResource,
            defaultVehicleId: config.defaultVehicleId,
            defaultBuildingByResource: config.defaultBuildingByResource,
            year: config.year,
            vehicleConfigByResource: config.vehicleConfigByResource,
            chargeRatioByResource: config.chargeRatioByResource,
          };
          const subChain = this.calculateProductionChain(subConfig, maxDepth - 1, new Set(visited));
          results.push(...subChain);
        }
      } else {
        // Ressource non produisible (eau, électricité, etc.) : l'ajouter comme ressource importée
        const nonProducibleResult: ProductionResult = {
          resourceId: inputResourceId,
          resourceName: getResourceName(inputResourceId),
          buildingName: 'Import',
          buildingCount: 0,
          inputsPerSecond: new Map(),
          outputsPerSecond: new Map([[inputResourceId, amount]]),
          totalWorkers: 0,
          totalProfesors: 0,
          workersPerBuilding: 0,
          maxWorkersPerBuilding: 0,
          profesorsPerBuilding: 0,
          maxProfesorsPerBuilding: 0,
          disabled: true,
        };
        results.push(nonProducibleResult);
      }
    });

    return results;
  }

  /**
   * Agrège les résultats de production pour éviter les doublons.
   * Recalcule le chargeRatio à partir des totaux agrégés (production totale / capacité totale)
   * au lieu de garder celui du premier résultat.
   */
  aggregateResults(results: ProductionResult[]): ProductionResult[] {
    const aggregated = new Map<string, ProductionResult>();

    results.forEach((result) => {
      // Clé unique : resourceId + buildingName
      const key = `${result.resourceId}:${result.buildingName}`;

      if (aggregated.has(key)) {
        const existing = aggregated.get(key)!;
        existing.buildingCount += result.buildingCount;
        existing.totalWorkers = Math.ceil(existing.totalWorkers + result.totalWorkers);
        existing.totalProfesors = Math.ceil(existing.totalProfesors + result.totalProfesors);
        if (result.vehicleProductionPerDay !== undefined) {
          existing.vehicleProductionPerDay = (existing.vehicleProductionPerDay ?? 0) + result.vehicleProductionPerDay!;
        }

        // Agréger les inputs
        result.inputsPerSecond.forEach((amount, resourceId) => {
          const currentAmount = existing.inputsPerSecond.get(resourceId) || 0;
          existing.inputsPerSecond.set(resourceId, currentAmount + amount);
        });

        // Agréger les outputs
        result.outputsPerSecond.forEach((amount, resourceId) => {
          const currentAmount = existing.outputsPerSecond.get(resourceId) || 0;
          existing.outputsPerSecond.set(resourceId, currentAmount + amount);
        });
      } else {
        // Créer une copie profonde
        const newResult: ProductionResult = {
          ...result,
          inputsPerSecond: new Map(result.inputsPerSecond),
          outputsPerSecond: new Map(result.outputsPerSecond),
        };
        aggregated.set(key, newResult);
      }
    });

    const aggregatedList = Array.from(aggregated.values());
    // Demande totale par ressource (consommation par aval) pour recalculer les carrières véhicules
    const totalDemandPerSecond = new Map<string, number>();
    results.forEach((r) => {
      r.inputsPerSecond.forEach((amount, resourceId) => {
        totalDemandPerSecond.set(resourceId, (totalDemandPerSecond.get(resourceId) ?? 0) + amount);
      });
    });
    aggregatedList.forEach((result) => {
      this.recalculateBuildingCountForVehicleQuarries(result, totalDemandPerSecond);
      this.recalculateChargeRatioFromAggregated(result);
    });
    return aggregatedList;
  }

  /**
   * Recalcule buildingCount pour les carrières véhicules à partir de la demande totale.
   * Sans cela : 2 sous-chaînes × 1 carrière = 2 carrières affichées, alors qu'1 suffit.
   */
  private recalculateBuildingCountForVehicleQuarries(
    result: ProductionResult,
    totalDemandPerSecond: Map<string, number>
  ): void {
    if (result.invalidConfig || result.maxProductionPerDay === undefined) return;

    const totalDemandPerDay = (totalDemandPerSecond.get(result.resourceId) ?? 0) * 24 * 60 * 60;
    const correctBuildingCount = Math.max(
      1,
      Math.ceil(totalDemandPerDay / result.maxProductionPerDay)
    );

    if (correctBuildingCount === result.buildingCount) return;

    const oldBuildingCount = result.buildingCount;
    result.buildingCount = correctBuildingCount;

    // Préserver le chargeRatio existant (surcharge 100% utilisateur) pour calculer la production
    const chargeRatio = result.chargeRatio ?? 0;
    const vehicleProductionPerBuilding = result.vehicleProductionPerDay !== undefined && oldBuildingCount > 0
      ? result.vehicleProductionPerDay / oldBuildingCount
      : totalDemandPerDay / correctBuildingCount;
    const maxPersonnelProductionPerBuilding = result.maxProductionPerDay - vehicleProductionPerBuilding;
    const productionPerDay =
      vehicleProductionPerBuilding * correctBuildingCount +
      chargeRatio * maxPersonnelProductionPerBuilding * correctBuildingCount;

    result.totalWorkers = chargeRatio > 0 ? Math.ceil((result.maxWorkersPerBuilding ?? 0) * chargeRatio * correctBuildingCount) : 0;
    result.workersPerBuilding = chargeRatio > 0 && correctBuildingCount > 0 ? Math.ceil(result.totalWorkers / correctBuildingCount) : 0;
    result.chargeRatio = chargeRatio;
    result.vehicleProductionPerDay = vehicleProductionPerBuilding * correctBuildingCount;
    result.outputsPerSecond.set(result.resourceId, productionPerDay / (24 * 60 * 60));
  }

  /**
   * Recalcule le chargeRatio et totalWorkers à partir de la production agrégée.
   * Utilisé après agrégation pour corriger le taux affiché (ex: 2 bâtiments à 52% au lieu de 26%).
   */
  private recalculateChargeRatioFromAggregated(result: ProductionResult): void {
    if (result.invalidConfig || result.buildingCount === 0) return;

    const recipe = this.getRecipe(result.resourceId, result.buildingName);
    if (!recipe || recipe.production === 0) return;

    const totalOutputPerDay =
      (result.outputsPerSecond.get(result.resourceId) ?? 0) * 24 * 60 * 60;

    // Carrières avec véhicules : garder le chargeRatio existant (dépend de la config véhicules)
    if (this.requiresVehiclesRecipe(recipe)) return;

    // Mines (charbon, fer, etc.) : qualité de source non disponible dans le résultat → pas de recalcul
    if (this.isMineRecipe(recipe)) return;

    // Bâtiments sans personnel : charge = 0
    if (recipe.workers === 0) {
      result.chargeRatio = 0;
      return;
    }

    // Bâtiment standard (ex: gravel_processing, cement_plant)
    const maxProductionPerBuilding = recipe.production * recipe.workers;
    const totalCapacity = maxProductionPerBuilding * result.buildingCount;
    if (totalCapacity <= 0) return;

    const chargeRatio = clamp(totalOutputPerDay / totalCapacity, 0, 1);
    result.chargeRatio = chargeRatio;
    result.totalWorkers = Math.ceil(recipe.workers * chargeRatio * result.buildingCount);
    if (result.maxWorkersPerBuilding !== undefined) {
      result.workersPerBuilding = result.buildingCount > 0
        ? Math.ceil(result.totalWorkers / result.buildingCount)
        : 0;
    }
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
  calculateTotalProfesors(results: ProductionResult[]): number {
    return results.reduce((total, result) => total + result.totalProfesors, 0);
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
    const resourcesToRemove = new Set<string>();

    const usedBy = new Map<string, Set<string>>();
    results.forEach((result) => {
      result.inputsPerSecond.forEach((_, inputResourceId) => {
        if (!usedBy.has(inputResourceId)) usedBy.set(inputResourceId, new Set());
        usedBy.get(inputResourceId)!.add(result.resourceId);
      });
    });

    const isCovered = (userId: string) =>
      disabledResources.has(userId) || resourcesToRemove.has(userId);

    const findDeps = (resourceId: string, visited: Set<string>): void => {
      if (visited.has(resourceId)) return;
      visited.add(resourceId);

      const users = usedBy.get(resourceId);
      if (!users || users.size === 0) return;

      const allUsersCovered = Array.from(users).every(isCovered);
      if (allUsersCovered) {
        resourcesToRemove.add(resourceId);
        const result = results.find((r) => r.resourceId === resourceId);
        if (result) {
          result.inputsPerSecond.forEach((_, inputResourceId) => {
            findDeps(inputResourceId, visited);
          });
        }
      }
    };

    disabledResources.forEach((disabledResourceId) => {
      const disabledResult = results.find((r) => r.resourceId === disabledResourceId);
      if (disabledResult) {
        disabledResult.inputsPerSecond.forEach((_, inputResourceId) => {
          findDeps(inputResourceId, new Set());
        });
      }
    });

    return resourcesToRemove;
  }

  /**
   * Vérifie si une ressource est de l'eau (pour l'affichage en m3)
   */
  isWater(resourceId: string): boolean {
    return resourceId === 'water';
  }

  /**
   * Formate une valeur pour l'affichage (t/jour ou m3/jour)
   */
  formatProductionValue(value: number, resourceId: string): string {
    const unit = this.isWater(resourceId) ? 'm³' : 't';
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
    return !this.isWater(resourceId) && !this.isElectricity(resourceId);
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
