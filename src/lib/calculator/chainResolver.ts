import type { ProductionResult, ProductionRecipe, ResourceProduction } from '@/data/types';
import type { CalculationConfig, InputType, MineVehicleConfig } from '@/lib/productionCalculator';
import { productions, getResourceName } from '@/data/productions';
import { clamp, getSourceQuality, getDefaultBuilding, getYear, getEffectiveChargeRatio } from './helpers';
import { getMineVehicleConfig, computeVehicleCapacity } from './vehicleUtils';
import { calculateBuildingsAndWorkers, calculateRequirementsForBuildings } from './buildingCalculator';

// ─── Standalone helper functions ─────────────────────────────────────────────

function getProduction(resourceId: string): ResourceProduction | undefined {
  return productions.get(resourceId);
}

function getRecipe(resourceId: string, buildingName: string): ProductionRecipe | undefined {
  return productions.get(resourceId)?.recipes.find((r) => r.name === buildingName);
}

function isMine(recipe: ProductionRecipe): boolean { return recipe.isMine === true; }
function requiresVehicles(recipe: ProductionRecipe): boolean { return recipe.requiresVehicles === true; }

function findRecipesProducing(resourceId: string): ProductionRecipe[] {
  const production = getProduction(resourceId);
  return production ? production.recipes : [];
}

function convertToPerDay(inputType: InputType, value: number): number {
  switch (inputType) {
    case 'buildings':
      return 0;
    case 'output_per_second':
      return value * 24 * 60 * 60;
    case 'output_per_day':
      return value;
    case 'output_per_year':
      return value / 365;
    default:
      return 0;
  }
}

// ─── Extracted functions from ProductionCalculator class ─────────────────────

function pushCoProductResults(
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

function isBaseResource(resourceId: string): boolean {
  const production = getProduction(resourceId);
  if (!production || production.recipes.length === 0) return false;

  return production.recipes.some(
    (recipe) => Object.keys(recipe.consumption).length === 0
  );
}

function calculateProductionChain(
  config: CalculationConfig,
  maxDepth: number = 20,
  visited: Set<string> = new Set()
): ProductionResult[] {
  if (maxDepth <= 0 || visited.has(config.resourceId)) {
    return [];
  }

  visited.add(config.resourceId);
  const results: ProductionResult[] = [];

  const production = getProduction(config.resourceId);
  if (!production) return results;

  if (config.disabledResources.has(config.resourceId)) {
    return results;
  }

  const buildingName = config.buildingName ?? getDefaultBuilding(config, config.resourceId, production.recipes);
  const recipe: ProductionRecipe | undefined = production.recipes.find((r) => r.name === buildingName);

  if (!recipe) return results;

  let targetOutputPerDay: number;
  if (config.inputType === 'buildings') {
    const sourceQuality = getSourceQuality(config, config.resourceId);
    const defaultVehicleId = config.defaultVehicleId ?? 'e-10011d';

    if (requiresVehicles(recipe)) {
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

        const result = calculateRequirementsForBuildings(
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
        pushCoProductResults(results, result, recipe, config.resourceId);

        if (!config.disabledResources.has(config.resourceId)) {
          result.inputsPerSecond.forEach((amountPerSecond, inputResourceId) => {
            const producingRecipes = findRecipesProducing(inputResourceId);
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
              const subChain = calculateProductionChain(subConfig, maxDepth - 1, new Set(visited));
              results.push(...subChain);
            }
          });
        }

        return results;
      }
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
    if (isMine(recipe)) {
      const buildingCount = Math.ceil(config.value);
      const sourceQualityFactor = sourceQuality / 100;
      const noPersonnel = recipe.workers === 0 || requiresVehicles(recipe);
      const chargeRatio = config.value / buildingCount;
      const effectiveChargeRatio = getEffectiveChargeRatio(config, config.resourceId, noPersonnel ? 0 : chargeRatio);
      const workersPerBuilding = noPersonnel ? 0 : Math.ceil(recipe.workers * effectiveChargeRatio);
      const totalWorkers = noPersonnel ? 0 : workersPerBuilding * buildingCount;
      result = calculateRequirementsForBuildings(
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
      result = calculateRequirementsForBuildings(
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
    pushCoProductResults(results, result, recipe, config.resourceId);

    if (config.disabledResources.has(config.resourceId)) {
      return results;
    }

    result.inputsPerSecond.forEach((amountPerSecond, inputResourceId) => {
      const producingRecipes = findRecipesProducing(inputResourceId);
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
        const subChain = calculateProductionChain(subConfig, maxDepth - 1, new Set(visited));
        results.push(...subChain);
      } else {
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
    targetOutputPerDay = convertToPerDay(config.inputType, config.value);
  }

  const sourceQuality = getSourceQuality(config, config.resourceId);
  const defaultVehicleId = config.defaultVehicleId ?? 'e-10011d';
  const year = getYear(config);
  const vehicleConfig = requiresVehicles(recipe)
    ? getMineVehicleConfig(config, config.resourceId, recipe)
    : undefined;
  const bw = calculateBuildingsAndWorkers(
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
  const effectiveTotalWorkers =
    vehicleProductionPerDay !== undefined && totalWorkers === 0
      ? 0
      : recipe.workers > 0
        ? Math.ceil(recipe.workers * effectiveChargeRatio * buildingCount)
        : totalWorkers;
  const effectiveWorkersPerBuilding = recipe.workers > 0 && buildingCount > 0 ? Math.ceil(effectiveTotalWorkers / buildingCount) : workersPerBuilding;

  const adjustedVehicleProductionPerDay =
    vehicleProductionPerDay !== undefined && maxPersonnelProductionPerDay !== undefined && allowPersonnel
      ? vehicleProductionPerDay + effectiveChargeRatio * maxPersonnelProductionPerDay
      : vehicleProductionPerDay;

  const sourceQualityFactor = isMine(recipe) ? sourceQuality / 100 : 1;

  const result = calculateRequirementsForBuildings(
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
  if (allowPersonnel && requiresVehicles(recipe)) {
    (result as ProductionResult).hasVehiclePersonnelEnabled = true;
    result.chargeRatio = effectiveChargeRatio;
  }
  if (vehicleProductionPerDay !== undefined && requiresVehicles(recipe)) {
    (result as ProductionResult).vehicleProductionPerDay = vehicleProductionPerDay;
  }
  results.push(result);
  pushCoProductResults(results, result, recipe, config.resourceId);

  if (config.disabledResources.has(config.resourceId)) {
    return results;
  }

  result.inputsPerSecond.forEach((amount, inputResourceId) => {
    const isDisabled = config.disabledResources.has(inputResourceId);

    if (isBaseResource(inputResourceId)) {
      const baseProduction = getProduction(inputResourceId);
      if (baseProduction && baseProduction.recipes.length > 0) {
        const baseBuildingName = getDefaultBuilding(config, inputResourceId, baseProduction.recipes);
        const baseRecipe = baseProduction.recipes.find((r) => r.name === baseBuildingName) ?? baseProduction.recipes[0];
        const baseOutputPerDay = amount * 24 * 60 * 60;
        const baseSourceQuality = getSourceQuality(config, inputResourceId);
        const defaultVehicleId = config.defaultVehicleId ?? 'e-10011d';
        const baseVehicleConfig = requiresVehicles(baseRecipe)
          ? getMineVehicleConfig(config, inputResourceId, baseRecipe)
          : undefined;
        const baseBw = calculateBuildingsAndWorkers(baseRecipe, baseOutputPerDay, inputResourceId, baseSourceQuality, defaultVehicleId, year, baseVehicleConfig);
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

        const baseResult = calculateRequirementsForBuildings(
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
        if (baseAllowPersonnel && requiresVehicles(baseRecipe)) {
          baseResult.hasVehiclePersonnelEnabled = true;
          baseResult.chargeRatio = baseEffectiveChargeRatio;
        }
        if (baseMaxProductionPerBuilding !== undefined) {
          baseResult.maxProductionPerDay = baseMaxProductionPerBuilding;
        }
        if (baseVehicleProductionPerDay !== undefined && requiresVehicles(baseRecipe)) {
          baseResult.vehicleProductionPerDay = baseVehicleProductionPerDay;
        }
        results.push(baseResult);
        pushCoProductResults(results, baseResult, baseRecipe, inputResourceId);
        baseResult.inputsPerSecond.forEach((inputAmount, inputResourceId) => {
          if (isBaseResource(inputResourceId)) return;
          const producingRecipes = findRecipesProducing(inputResourceId);
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
            const subChain = calculateProductionChain(subConfig, maxDepth - 1, new Set(visited));
            results.push(...subChain);
          }
        });
      }
      return;
    }

    const producingRecipes = findRecipesProducing(inputResourceId);
    if (producingRecipes.length > 0) {
      const defaultBuilding = getDefaultBuilding(config, inputResourceId, producingRecipes);
      if (isDisabled) {
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
        const subChain = calculateProductionChain(subConfig, maxDepth - 1, new Set(visited));
        results.push(...subChain);
      }
    } else {
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

export function aggregateResults(results: ProductionResult[]): ProductionResult[] {
  const aggregated = new Map<string, ProductionResult>();

  results.forEach((result) => {
    const key = `${result.resourceId}:${result.buildingName}:${result.isCoProduct ?? false}`;

    if (aggregated.has(key)) {
      const existing = aggregated.get(key)!;
      existing.buildingCount += result.buildingCount;
      existing.totalWorkers = Math.ceil(existing.totalWorkers + result.totalWorkers);
      existing.totalProfessors = Math.ceil(existing.totalProfessors + result.totalProfessors);
      if (result.vehicleProductionPerDay !== undefined) {
        existing.vehicleProductionPerDay = (existing.vehicleProductionPerDay ?? 0) + result.vehicleProductionPerDay!;
      }

      result.inputsPerSecond.forEach((amount, resourceId) => {
        const currentAmount = existing.inputsPerSecond.get(resourceId) || 0;
        existing.inputsPerSecond.set(resourceId, currentAmount + amount);
      });

      result.outputsPerSecond.forEach((amount, resourceId) => {
        const currentAmount = existing.outputsPerSecond.get(resourceId) || 0;
        existing.outputsPerSecond.set(resourceId, currentAmount + amount);
      });
    } else {
      const newResult: ProductionResult = {
        ...result,
        inputsPerSecond: new Map(result.inputsPerSecond),
        outputsPerSecond: new Map(result.outputsPerSecond),
      };
      aggregated.set(key, newResult);
    }
  });

  const aggregatedList = Array.from(aggregated.values());
  const totalDemandPerSecond = new Map<string, number>();
  results.forEach((r) => {
    r.inputsPerSecond.forEach((amount, resourceId) => {
      totalDemandPerSecond.set(resourceId, (totalDemandPerSecond.get(resourceId) ?? 0) + amount);
    });
  });
  aggregatedList.forEach((result) => {
    recalculateBuildingCountForVehicleQuarries(result, totalDemandPerSecond);
    recalculateBuildingCountForStandardFactories(result);
    recalculateChargeRatioFromAggregated(result);
  });
  return aggregatedList;
}

function recalculateBuildingCountForStandardFactories(result: ProductionResult): void {
  if (result.invalidConfig || result.isCoProduct) return;
  const recipe = getRecipe(result.resourceId, result.buildingName);
  if (!recipe || recipe.production === 0 || recipe.workers === 0) return;
  if (isMine(recipe) || requiresVehicles(recipe)) return;

  const totalOutputPerDay =
    (result.outputsPerSecond.get(result.resourceId) ?? 0) * 24 * 60 * 60;
  const maxProductionPerBuilding = recipe.production * recipe.workers;
  const correctBuildingCount = Math.max(1, Math.ceil(totalOutputPerDay / maxProductionPerBuilding));
  if (correctBuildingCount < result.buildingCount) {
    result.buildingCount = correctBuildingCount;
  }
}

function recalculateBuildingCountForVehicleQuarries(
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

function recalculateChargeRatioFromAggregated(result: ProductionResult): void {
  if (result.invalidConfig || result.isCoProduct || result.buildingCount === 0) return;

  const recipe = getRecipe(result.resourceId, result.buildingName);
  if (!recipe || recipe.production === 0) return;

  const totalOutputPerDay =
    (result.outputsPerSecond.get(result.resourceId) ?? 0) * 24 * 60 * 60;

  if (requiresVehicles(recipe)) return;

  if (isMine(recipe)) return;

  if (recipe.workers === 0) {
    result.chargeRatio = 0;
    return;
  }

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

export function findDependentResources(
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

// ─── Public entry point ────────────────────────────────────────────────────────

export interface ResolveChainOptions {
  disabledResources: Set<string>;
  sourceQuality: number;
  year: number;
  defaultVehicleId?: string;
  defaultBuildingByResource?: Record<string, string>;
  sourceQualityByResource?: Record<string, number>;
  vehicleConfigByResource?: Record<string, MineVehicleConfig>;
  chargeRatioByResource?: Record<string, number>;
}

export interface ProductionGoalInput {
  resourceId: string;
  buildingName?: string;
  inputType: InputType;
  value: number;
}

/** Resolves the full aggregated production chain for a list of goals. */
export function resolveChain(
  goals: ProductionGoalInput[],
  options: ResolveChainOptions
): ProductionResult[] {
  if (goals.length === 0) return [];
  const allChains: ProductionResult[] = [];
  for (const goal of goals) {
    const config: CalculationConfig = {
      resourceId: goal.resourceId,
      buildingName: goal.buildingName,
      inputType: goal.inputType,
      value: goal.value,
      disabledResources: options.disabledResources,
      sourceQuality: options.sourceQuality,
      year: options.year,
      defaultVehicleId: options.defaultVehicleId,
      defaultBuildingByResource: options.defaultBuildingByResource,
      sourceQualityByResource: options.sourceQualityByResource,
      vehicleConfigByResource: options.vehicleConfigByResource,
      chargeRatioByResource: options.chargeRatioByResource,
    };
    const chain = calculateProductionChain(config);
    allChains.push(...chain);
  }
  return aggregateResults(allChains);
}

/** Exposed for delegation from ProductionCalculator class */
export { calculateProductionChain };
