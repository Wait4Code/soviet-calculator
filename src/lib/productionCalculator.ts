import { ProductionResult, ProductionRecipe, ResourceProduction } from '@/data/types';
import { productions, getResourceName } from '@/data/productions';
import { formatNumber } from '@/lib/format';
import { clamp, getProductionFactor, getConsumptionFactor, getSourceQuality, getDefaultBuilding, getYear, getEffectiveChargeRatio } from '@/lib/calculator/helpers';
import { getDefaultMineVehicleConfig, migrateVehicleConfig as _migrateVehicleConfig, computeVehicleCapacity, getMineVehicleConfig } from '@/lib/calculator/vehicleUtils';
import { calculateBuildingsAndWorkers as _calcBW, calculateRequirementsForBuildings as _calcReq, type BuildingCalcResult } from '@/lib/calculator/buildingCalculator';

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
   * Ajoute les résultats de production connexe (co-produits) pour une recette donnée.
   */
  private pushCoProductResults(
    results: ProductionResult[],
    result: ProductionResult,
    recipe: ProductionRecipe,
    mainResourceId: string
  ): void {
    const production_co = recipe.production_co;
    if (!production_co || Object.keys(production_co).length === 0) return;
    const mainOutputPerSecond = result.outputsPerSecond.get(mainResourceId) ?? 0;
    for (const [coResourceId, coRate] of Object.entries(production_co)) {
      const coOutputPerSecond = mainOutputPerSecond * (coRate / recipe.production);
      results.push({
        resourceId: coResourceId,
        resourceName: getResourceName(coResourceId),
        buildingName: recipe.name,
        buildingCount: result.buildingCount,
        inputsPerSecond: new Map(),
        outputsPerSecond: new Map([[coResourceId, coOutputPerSecond]]),
        totalWorkers: 0,
        totalProfessors: 0,
        isCoProduct: true,
      });
    }
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
    const buildingName = config.buildingName ?? getDefaultBuilding(config, config.resourceId, production.recipes);
    const recipe: ProductionRecipe | undefined = production.recipes.find((r) => r.name === buildingName);

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
          this.pushCoProductResults(results, result, recipe, config.resourceId);

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
          totalProfessors: 0,
          workersPerBuilding: 0,
          maxWorkersPerBuilding: recipe.workers,
          professorsPerBuilding: 0,
          maxProfessorsPerBuilding: recipe.professors ?? 0,
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
      this.pushCoProductResults(results, result, recipe, config.resourceId);

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
            totalProfessors: 0,
            workersPerBuilding: 0,
            maxWorkersPerBuilding: 0,
            professorsPerBuilding: 0,
            maxProfessorsPerBuilding: 0,
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
        totalProfessors: 0,
        workersPerBuilding: 0,
        maxWorkersPerBuilding: recipe.workers,
        professorsPerBuilding: 0,
        maxProfessorsPerBuilding: recipe.professors ?? 0,
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
    this.pushCoProductResults(results, result, recipe, config.resourceId);

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
              totalProfessors: 0,
              workersPerBuilding: 0,
              maxWorkersPerBuilding: baseRecipe.workers,
              professorsPerBuilding: 0,
              maxProfessorsPerBuilding: baseRecipe.professors ?? 0,
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
          this.pushCoProductResults(results, baseResult, baseRecipe, inputResourceId);
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
                totalProfessors: 0,
                workersPerBuilding: 0,
                maxWorkersPerBuilding: 0,
                professorsPerBuilding: 0,
                maxProfessorsPerBuilding: 0,
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
            totalProfessors: 0,
            workersPerBuilding: 0,
            maxWorkersPerBuilding: disabledRecipe.workers,
            professorsPerBuilding: 0,
            maxProfessorsPerBuilding: disabledRecipe.professors,
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
          totalProfessors: 0,
          workersPerBuilding: 0,
          maxWorkersPerBuilding: 0,
          professorsPerBuilding: 0,
          maxProfessorsPerBuilding: 0,
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
      // Clé unique : resourceId + buildingName + isCoProduct (ne pas fusionner co-produit avec production principale)
      const key = `${result.resourceId}:${result.buildingName}:${result.isCoProduct ?? false}`;

      if (aggregated.has(key)) {
        const existing = aggregated.get(key)!;
        existing.buildingCount += result.buildingCount;
        existing.totalWorkers = Math.ceil(existing.totalWorkers + result.totalWorkers);
        existing.totalProfessors = Math.ceil(existing.totalProfessors + result.totalProfessors);
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
      this.recalculateBuildingCountForStandardFactories(result);
      this.recalculateChargeRatioFromAggregated(result);
    });
    return aggregatedList;
  }

  /**
   * Recalcule buildingCount pour les usines standard à partir de la production agrégée.
   * Quand une ressource (ex: chemicals) est demandée par plusieurs maillons (aluminium + alumine),
   * on agrège les sorties puis on recalcule le nombre de bâtiments nécessaires (1 usine à 70% au lieu de 2 à 35%).
   */
  private recalculateBuildingCountForStandardFactories(result: ProductionResult): void {
    if (result.invalidConfig || result.isCoProduct) return;
    const recipe = this.getRecipe(result.resourceId, result.buildingName);
    if (!recipe || recipe.production === 0 || recipe.workers === 0) return;
    if (this.isMineRecipe(recipe) || this.requiresVehiclesRecipe(recipe)) return;

    const totalOutputPerDay =
      (result.outputsPerSecond.get(result.resourceId) ?? 0) * 24 * 60 * 60;
    const maxProductionPerBuilding = recipe.production * recipe.workers;
    const correctBuildingCount = Math.max(1, Math.ceil(totalOutputPerDay / maxProductionPerBuilding));
    // Only reduce building count (e.g. 2 → 1 when same resource was requested by multiple steps).
    // Never increase: a single goal "1 building" must stay 1 even if totalOutputPerDay is rounded up.
    if (correctBuildingCount < result.buildingCount) {
      result.buildingCount = correctBuildingCount;
    }
  }

  /**
   * Recalcule buildingCount pour les carrières véhicules à partir de la demande totale.
   * Sans cela : 2 sous-chaînes × 1 carrière = 2 carrières affichées, alors qu'1 suffit.
   */
  private recalculateBuildingCountForVehicleQuarries(
    result: ProductionResult,
    totalDemandPerSecond: Map<string, number>
  ): void {
    if (result.invalidConfig || result.isCoProduct || result.maxProductionPerDay === undefined) return;

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
    if (result.invalidConfig || result.isCoProduct || result.buildingCount === 0) return;

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
