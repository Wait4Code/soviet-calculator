import { useMemo } from 'react';
import { productionCalculator } from '@/lib/productionCalculator';
import { sortProductionChain } from '@/lib/chainSort';
import { getResourceName } from '@/data/productions';
import { POLLUTION_T_PER_YEAR, getSafetyDistance, type PollutionDistanceMode } from '@/data/pollutionByBuilding';
import type { ProductionResult } from '@/data/types';
import type { ProductionGoal } from '@/data/types';
import type { CalculationConfig } from '@/lib/productionCalculator';
import type { ChainSettingsState } from './useChainSettings';

export interface WasteTableRow {
  sourceResourceId: string;
  buildingName: string;
  sewagePerDay: number;
  mixedPerDay: number;
  hazardousPerDay: number;
  mixedComposition: Record<string, number>;
  hazardousComposition: Record<string, number>;
  pollutionTPerYear: number | undefined;
  safetyDistance: {
    q80_min: number; q80_med: number; q80_max: number;
    q95_min: number; q95_med: number; q95_max: number;
  } | undefined;
}

export interface WasteTableData {
  rows: WasteTableRow[];
  totals: {
    sewagePerDay: number;
    mixedPerDay: number;
    hazardousPerDay: number;
    mixedComposition: Record<string, number>;
    hazardousComposition: Record<string, number>;
  };
  pollutionMin: number | undefined;
  pollutionMax: number | undefined;
  distanceMin: number | undefined;
  distanceMax: number | undefined;
}

export interface UseCalculationChainReturn {
  fullChainResults: ProductionResult[];
  results: ProductionResult[];
  surplusByResource: Map<string, number>;
  hasAnySurplus: boolean;
  sewageResult: ProductionResult | null;
  wasteMixedResult: ProductionResult | null;
  wasteToxicResult: ProductionResult | null;
  personnelBreakdown: Array<{ sourceResourceId: string; buildingName: string; workers: number; profesors: number }>;
  wasteTableData: WasteTableData;
  totalWorkers: number;
  totalProfesors: number;
}

export interface ChainStoreSnapshot {
  sourceQuality: number;
  defaultVehicleId: string;
  defaultBuildingByResource: Record<string, string>;
}

const WORKER_WASTE_060: Record<string, number> = { bio: 0.10 / 0.60, burnable: 0.20 / 0.60, other: 0.30 / 0.60 };
const WORKER_WASTE_043: Record<string, number> = { bio: 0.10 / 0.43, burnable: 0.12 / 0.43, other: 0.10 / 0.43, construction: 0.11 / 0.43 };

// Default pollution distance mode (used for wasteTableData)
const DEFAULT_POLLUTION_DISTANCE_MODE: PollutionDistanceMode = 'q80_med';

export function useCalculationChain(
  goals: ProductionGoal[],
  settings: ChainSettingsState,
  store: ChainStoreSnapshot
): UseCalculationChainReturn {
  const {
    disabledResources,
    chainYear,
    sourceQualityFromPlan,
    sourceQualityByResource,
    buildingByResource,
    vehicleConfigByResource,
    chargeRatioByResource,
  } = settings;

  const effectiveSourceQuality = sourceQualityFromPlan ?? store.sourceQuality;
  const effectiveBuildingByResource = useMemo(
    () => ({ ...store.defaultBuildingByResource, ...buildingByResource }),
    [store.defaultBuildingByResource, buildingByResource]
  );

  // Full chain results (without disabled resources) for all goals combined
  const fullChainResults = useMemo(() => {
    const validGoals = goals.filter((g) => g.resourceId && g.buildingName && g.value > 0);
    if (validGoals.length === 0) return [];

    const allChains: ProductionResult[] = [];
    for (const goal of validGoals) {
      const config: CalculationConfig = {
        resourceId: goal.resourceId,
        buildingName: effectiveBuildingByResource[goal.resourceId] ?? goal.buildingName,
        inputType: goal.inputType,
        value: goal.value,
        disabledResources: new Set(),
        sourceQuality: effectiveSourceQuality,
        sourceQualityByResource,
        defaultVehicleId: store.defaultVehicleId,
        defaultBuildingByResource: effectiveBuildingByResource,
        year: chainYear,
        vehicleConfigByResource: Object.keys(vehicleConfigByResource).length > 0 ? vehicleConfigByResource : undefined,
        chargeRatioByResource: Object.keys(chargeRatioByResource).length > 0 ? chargeRatioByResource : undefined,
      };
      const chain = productionCalculator.calculateProductionChain(config);
      allChains.push(...chain);
    }
    return productionCalculator.aggregateResults(allChains);
  }, [goals, effectiveSourceQuality, sourceQualityByResource, chainYear, store.defaultVehicleId, effectiveBuildingByResource, vehicleConfigByResource, chargeRatioByResource]);

  // Results with meta (handling disabled resources, surplus, sewage, etc.)
  const resultsWithMeta = useMemo(() => {
    const validGoals = goals.filter((g) => g.resourceId && g.buildingName && g.value > 0);
    const primaryIds = new Set(validGoals.map((g) => g.resourceId));
    if (validGoals.length === 0) return { results: [] as ProductionResult[], surplusByResource: new Map<string, number>(), hasAnySurplus: false, sewageResult: null, wasteMixedResult: null, wasteToxicResult: null, personnelBreakdown: [] as Array<{ sourceResourceId: string; buildingName: string; workers: number; profesors: number }> };

    const allChains: ProductionResult[] = [];
    for (const goal of validGoals) {
      const config: CalculationConfig = {
        resourceId: goal.resourceId,
        buildingName: effectiveBuildingByResource[goal.resourceId] ?? goal.buildingName,
        inputType: goal.inputType,
        value: goal.value,
        disabledResources,
        sourceQuality: effectiveSourceQuality,
        sourceQualityByResource,
        defaultVehicleId: store.defaultVehicleId,
        defaultBuildingByResource: effectiveBuildingByResource,
        year: chainYear,
        vehicleConfigByResource: Object.keys(vehicleConfigByResource).length > 0 ? vehicleConfigByResource : undefined,
        chargeRatioByResource: Object.keys(chargeRatioByResource).length > 0 ? chargeRatioByResource : undefined,
      };
      const chain = productionCalculator.calculateProductionChain(config);
      allChains.push(...chain);
    }
    const aggregated = productionCalculator.aggregateResults(allChains);

    // Create map for quick access
    const aggregatedMap = new Map<string, ProductionResult>();
    aggregated.forEach((result) => {
      aggregatedMap.set(result.resourceId, result);
    });

    // Find dependencies to remove (exclusive dependencies of disabled resources)
    const resourcesToRemove = new Set<string>();

    // Create map of resources that use each resource
    const usedByMap = new Map<string, Set<string>>();
    fullChainResults.forEach((fullResult) => {
      fullResult.inputsPerSecond.forEach((_, inputResourceId) => {
        if (!usedByMap.has(inputResourceId)) {
          usedByMap.set(inputResourceId, new Set());
        }
        usedByMap.get(inputResourceId)!.add(fullResult.resourceId);
      });
    });

    // Resources to remove: only used by disabled resources
    const toRemove = productionCalculator.findDependentResources(disabledResources, fullChainResults);
    toRemove.forEach((depId) => resourcesToRemove.add(depId));

    // Total consumption per resource: only from active buildings (neither removed nor disabled)
    const totalConsumptionPerResource = new Map<string, number>();
    fullChainResults.forEach((result) => {
      if (
        !resourcesToRemove.has(result.resourceId) &&
        !disabledResources.has(result.resourceId)
      ) {
        result.inputsPerSecond.forEach((amount, inputResourceId) => {
          if (!resourcesToRemove.has(inputResourceId)) {
            const current = totalConsumptionPerResource.get(inputResourceId) || 0;
            totalConsumptionPerResource.set(inputResourceId, current + amount);
          }
        });
      }
    });

    // Build final results keeping the order of the full chain
    const finalResults: ProductionResult[] = [];
    const addedResources = new Set<string>();

    // Collect all non-producible resources from calculated results
    const nonProducibleResults = new Map<string, ProductionResult>();
    aggregated.forEach((result) => {
      if (result.disabled && result.buildingName === 'Import') {
        nonProducibleResults.set(result.resourceId, result);
      }
    });

    // Walk full chain to maintain order
    fullChainResults.forEach((fullResult) => {
      const resourceId = fullResult.resourceId;

      // If it's a dependency to remove, skip it
      if (resourcesToRemove.has(resourceId)) {
        return;
      }

      // If the resource is disabled, add it from the full chain (mark as disabled)
      if (disabledResources.has(resourceId)) {
        if (!addedResources.has(resourceId)) {
          const totalConsumption = totalConsumptionPerResource.get(resourceId);
          if (totalConsumption !== undefined && totalConsumption > 0) {
            const resultWithConsumption: ProductionResult = {
              ...fullResult,
              disabled: true,
              outputsPerSecond: new Map([[resourceId, totalConsumption]]),
            };
            finalResults.push(resultWithConsumption);
          } else {
            finalResults.push({ ...fullResult, disabled: true });
          }
          addedResources.add(resourceId);
        }
        return;
      }

      // Otherwise, take the calculated result (or the full chain result if not calculated)
      const calculatedResult = aggregatedMap.get(resourceId);
      if (calculatedResult && !addedResources.has(resourceId)) {
        const totalConsumption = totalConsumptionPerResource.get(resourceId);
        const production = calculatedResult.outputsPerSecond.get(resourceId) ?? 0;
        const hasSurplus = production > (totalConsumption ?? 0);
        if (totalConsumption !== undefined && totalConsumption > 0 && !hasSurplus) {
          const outputs = new Map(calculatedResult.outputsPerSecond);
          outputs.set(resourceId, totalConsumption);
          const resultWithConsumption: ProductionResult = {
            ...calculatedResult,
            outputsPerSecond: outputs,
          };
          finalResults.push(resultWithConsumption);
        } else {
          finalResults.push(calculatedResult);
        }
        addedResources.add(resourceId);
      } else if (!addedResources.has(resourceId)) {
        // Check if it's a non-producible resource (water, electricity, etc.)
        const producingRecipes = productionCalculator.findRecipesProducing(resourceId);
        const isNonProducible = producingRecipes.length === 0;

        if (isNonProducible) {
          // For non-producible resources, verify they are consumed by at least one active resource
          const users = usedByMap.get(resourceId);
          const hasActiveUser = users && Array.from(users).some(userId =>
            !disabledResources.has(userId) && !resourcesToRemove.has(userId)
          );

          // Only add if consumed by at least one active resource
          if (hasActiveUser) {
            const totalConsumption = totalConsumptionPerResource.get(resourceId);
            if (totalConsumption !== undefined) {
              const resultWithConsumption: ProductionResult = {
                ...fullResult,
                outputsPerSecond: new Map([[resourceId, totalConsumption]]),
              };
              finalResults.push(resultWithConsumption);
            } else {
              finalResults.push(fullResult);
            }
            addedResources.add(resourceId);
          }
        } else {
          // For producible resources: use production if > consumption (surplus)
          const totalConsumption = totalConsumptionPerResource.get(resourceId);
          const production = fullResult.outputsPerSecond.get(resourceId) ?? 0;
          const hasSurplus = production > (totalConsumption ?? 0);
          if (totalConsumption !== undefined && totalConsumption > 0 && !hasSurplus) {
            const outputs = new Map(fullResult.outputsPerSecond);
            outputs.set(resourceId, totalConsumption);
            const resultWithConsumption: ProductionResult = {
              ...fullResult,
              outputsPerSecond: outputs,
            };
            finalResults.push(resultWithConsumption);
          } else {
            finalResults.push(fullResult);
          }
          addedResources.add(resourceId);
        }
      }
    });

    // Separate resources into groups: normal, water, electricity
    const normalResources: ProductionResult[] = [];
    let waterResource: ProductionResult | null = null;
    let electricityResource: ProductionResult | null = null;

    // Total sewage (coproduct: 1 m³ water consumed → 1 m³ sewage), displayed on a dedicated line
    let totalSewagePerSecond = 0;
    finalResults.forEach(result => {
      totalSewagePerSecond += result.outputsPerSecond.get('sewage') ?? 0;
    });

    // Separate resources already in finalResults
    finalResults.forEach(result => {
      if (productionCalculator.isElectricity(result.resourceId)) {
        electricityResource = result;
      } else if (productionCalculator.isWater(result.resourceId)) {
        waterResource = result;
      } else if (productionCalculator.isSewage(result.resourceId)) {
        // Don't add a sewage line from data: use the synthetic line below
      } else if (productionCalculator.isWasteOutput(result.resourceId)) {
        // Same for mixed/hazardous waste: synthetic lines below
      } else {
        normalResources.push(result);
      }
    });

    // Add non-producible resources (water, electricity, etc.) not yet added
    // Only if consumed by active resources
    nonProducibleResults.forEach((nonProducibleResult, resourceId) => {
      if (!addedResources.has(resourceId)) {
        const users = usedByMap.get(resourceId);
        const hasActiveUser = users && Array.from(users).some(userId =>
          !disabledResources.has(userId) && !resourcesToRemove.has(userId)
        );

        if (hasActiveUser) {
          const totalConsumption = totalConsumptionPerResource.get(resourceId);
          const resultToAdd = totalConsumption !== undefined
            ? { ...nonProducibleResult, outputsPerSecond: new Map([[resourceId, totalConsumption]]) }
            : nonProducibleResult;

          if (productionCalculator.isElectricity(resourceId)) {
            electricityResource = resultToAdd;
          } else if (productionCalculator.isWater(resourceId)) {
            waterResource = resultToAdd;
          } else {
            normalResources.push(resultToAdd);
          }
          addedResources.add(resourceId);
        }
      }
    });

    // Breakdown per building for sewage line (common coproduct) — exclude disabled resources
    const sewageBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number }> = [];
    let totalWasteMixedPerSecond = 0;
    let totalWasteToxicPerSecond = 0;
    const wasteMixedBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number; workerWasteTPerDay?: number }> = [];
    const wasteToxicBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number }> = [];
    finalResults.forEach(result => {
      if (disabledResources.has(result.resourceId)) return;
      const amt = result.outputsPerSecond.get('sewage') ?? 0;
      if (amt > 0) {
        sewageBreakdown.push({ sourceResourceId: result.resourceId, buildingName: result.buildingName, amountPerSecond: amt });
      }
      const wasteMixedAmt = result.outputsPerSecond.get('waste_mixed') ?? 0;
      if (wasteMixedAmt > 0) {
        totalWasteMixedPerSecond += wasteMixedAmt;
        const recipe = productionCalculator.getRecipe(result.resourceId, result.buildingName);
        const workerWasteTPerDay = recipe?.worker_waste_kg_per_day != null && result.totalWorkers > 0
          ? (result.totalWorkers * recipe.worker_waste_kg_per_day) / 1000
          : undefined;
        wasteMixedBreakdown.push({
          sourceResourceId: result.resourceId,
          buildingName: result.buildingName,
          amountPerSecond: wasteMixedAmt,
          ...(workerWasteTPerDay != null && workerWasteTPerDay > 0 ? { workerWasteTPerDay } : {}),
        });
      }
      const wasteToxicAmt = result.outputsPerSecond.get('waste_toxic') ?? 0;
      if (wasteToxicAmt > 0) {
        totalWasteToxicPerSecond += wasteToxicAmt;
        wasteToxicBreakdown.push({ sourceResourceId: result.resourceId, buildingName: result.buildingName, amountPerSecond: wasteToxicAmt });
      }
    });

    // Breakdown per building for water and electricity (consumption) — exclude disabled resources
    const waterConsumptionBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number }> = [];
    const electricityConsumptionBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number }> = [];
    finalResults.forEach(result => {
      if (disabledResources.has(result.resourceId)) return;
      const waterAmt = (result.inputsPerSecond.get('water') ?? 0) + (result.inputsPerSecond.get('usagewater') ?? 0);
      if (waterAmt > 0) {
        waterConsumptionBreakdown.push({ sourceResourceId: result.resourceId, buildingName: result.buildingName, amountPerSecond: waterAmt });
      }
      const elecAmt = result.inputsPerSecond.get('eletric') ?? 0;
      if (elecAmt > 0) {
        electricityConsumptionBreakdown.push({ sourceResourceId: result.resourceId, buildingName: result.buildingName, amountPerSecond: elecAmt });
      }
    });

    // Attach breakdowns to water and electricity lines
    if (waterResource && waterConsumptionBreakdown.length > 0) {
      waterResource = Object.assign({}, waterResource, { consumptionBreakdown: waterConsumptionBreakdown });
    }
    if (electricityResource && electricityConsumptionBreakdown.length > 0) {
      electricityResource = Object.assign({}, electricityResource, { consumptionBreakdown: electricityConsumptionBreakdown });
    }

    // Build final table: sort only normal resources, then add water and electricity at end of chain
    const sortedResults: ProductionResult[] = [];
    normalResources.forEach(result => {
      sortedResults.push(result);
    });
    const sortedNormals = sortProductionChain(sortedResults);
    const results = [
      ...sortedNormals,
      ...(waterResource ? [waterResource] : []),
      ...(electricityResource ? [electricityResource] : []),
    ];

    // Surplus and column visibility: computed from same data (aggregated) as the display
    const surplusByResource = productionCalculator.computeSurplusByResource(aggregated);
    const hasAnySurplus = results.some((r) => {
      const surplusPerSec = primaryIds.has(r.resourceId) ? 0 : (surplusByResource.get(r.resourceId) ?? 0);
      const surplusPerDay = surplusPerSec * (24 * 60 * 60);
      const amountPerDay = (r.outputsPerSecond.get(r.resourceId) ?? 0) * (24 * 60 * 60);
      const surplusToShow = r.isCoProduct ? amountPerDay : surplusPerDay;
      return surplusToShow > 0.01;
    });

    // Personnel breakdown per building — exclude disabled resources
    const personnelBreakdown = results
      .filter((r) => !disabledResources.has(r.resourceId) && (r.totalWorkers + r.totalProfesors) > 0)
      .map((r) => ({ sourceResourceId: r.resourceId, buildingName: r.buildingName, workers: r.totalWorkers, profesors: r.totalProfesors }));

    // Sewage line at end of chain (after personnel), never sorted with the others
    const sewageResult: ProductionResult | null = totalSewagePerSecond > 0 ? {
      resourceId: 'sewage',
      resourceName: getResourceName('sewage'),
      buildingName: 'Coproduct',
      buildingCount: 0,
      inputsPerSecond: new Map(),
      outputsPerSecond: new Map([['sewage', totalSewagePerSecond]]),
      totalWorkers: 0,
      totalProfesors: 0,
      isCoProduct: true,
      coproductBreakdown: sewageBreakdown,
    } : null;

    const wasteMixedResult: ProductionResult | null = totalWasteMixedPerSecond > 0 ? {
      resourceId: 'waste_mixed',
      resourceName: getResourceName('waste_mixed'),
      buildingName: 'Coproduct',
      buildingCount: 0,
      inputsPerSecond: new Map(),
      outputsPerSecond: new Map([['waste_mixed', totalWasteMixedPerSecond]]),
      totalWorkers: 0,
      totalProfesors: 0,
      isCoProduct: true,
      coproductBreakdown: wasteMixedBreakdown,
    } : null;

    const wasteToxicResult: ProductionResult | null = totalWasteToxicPerSecond > 0 ? {
      resourceId: 'waste_toxic',
      resourceName: getResourceName('waste_toxic'),
      buildingName: 'Coproduct',
      buildingCount: 0,
      inputsPerSecond: new Map(),
      outputsPerSecond: new Map([['waste_toxic', totalWasteToxicPerSecond]]),
      totalWorkers: 0,
      totalProfesors: 0,
      isCoProduct: true,
      coproductBreakdown: wasteToxicBreakdown,
    } : null;

    return { results, surplusByResource, hasAnySurplus, sewageResult, wasteMixedResult, wasteToxicResult, personnelBreakdown };
  }, [goals, disabledResources, fullChainResults, effectiveSourceQuality, sourceQualityByResource, chainYear, store.defaultVehicleId, effectiveBuildingByResource, vehicleConfigByResource, chargeRatioByResource]);

  const results = resultsWithMeta.results;
  const surplusByResource = resultsWithMeta.surplusByResource;
  const hasAnySurplus = resultsWithMeta.hasAnySurplus;
  const sewageResult = resultsWithMeta.sewageResult;
  const wasteMixedResult = resultsWithMeta.wasteMixedResult;
  const wasteToxicResult = resultsWithMeta.wasteToxicResult;
  const personnelBreakdown = resultsWithMeta.personnelBreakdown;

  const wasteTableData = useMemo((): WasteTableData => {
    const byBuilding = new Map<string, WasteTableRow>();
    const key = (a: string, b: string) => `${a}|${b}`;

    const addRow = (sourceResourceId: string, buildingName: string) => {
      const k = key(sourceResourceId, buildingName);
      if (!byBuilding.has(k)) {
        const recipe = productionCalculator.getRecipe(sourceResourceId, buildingName);
        byBuilding.set(k, {
          sourceResourceId,
          buildingName,
          sewagePerDay: 0,
          mixedPerDay: 0,
          hazardousPerDay: 0,
          mixedComposition: {},
          hazardousComposition: {},
          pollutionTPerYear: POLLUTION_T_PER_YEAR[buildingName],
          safetyDistance: recipe?.safetyDistance,
        });
      }
      return byBuilding.get(k)!;
    };

    sewageResult?.coproductBreakdown?.forEach((entry) => {
      const row = addRow(entry.sourceResourceId, entry.buildingName);
      row.sewagePerDay += entry.amountPerSecond * (24 * 60 * 60);
    });

    wasteMixedResult?.coproductBreakdown?.forEach((entry) => {
      const row = addRow(entry.sourceResourceId, entry.buildingName);
      const tPerDay = entry.amountPerSecond * (24 * 60 * 60);
      row.mixedPerDay += tPerDay;
      const recipe = productionCalculator.getRecipe(entry.sourceResourceId, entry.buildingName);
      const workerWasteTPerDay = (entry as { workerWasteTPerDay?: number }).workerWasteTPerDay ?? 0;
      const productionMixedTPerDay = tPerDay - workerWasteTPerDay;
      if (workerWasteTPerDay > 0 && recipe?.worker_waste_kg_per_day != null) {
        const comp = recipe.worker_waste_kg_per_day === 0.43 ? WORKER_WASTE_043 : WORKER_WASTE_060;
        Object.entries(comp).forEach(([typeKey, frac]) => {
          row.mixedComposition[typeKey] = (row.mixedComposition[typeKey] ?? 0) + workerWasteTPerDay * frac;
        });
      }
      if (productionMixedTPerDay > 0 && recipe?.production_waste_composition) {
        const comp = recipe.production_waste_composition;
        const entries = Object.entries(comp).filter(([k, f]) => k !== 'hazardous' && f > 0);
        const sumFrac = entries.reduce((s, [, f]) => s + f, 0);
        if (sumFrac > 0) {
          entries.forEach(([typeKey, frac]) => {
            row.mixedComposition[typeKey] = (row.mixedComposition[typeKey] ?? 0) + productionMixedTPerDay * (frac / sumFrac);
          });
        }
      }
    });

    wasteToxicResult?.coproductBreakdown?.forEach((entry) => {
      const row = addRow(entry.sourceResourceId, entry.buildingName);
      const entryTPerDay = entry.amountPerSecond * (24 * 60 * 60);
      row.hazardousPerDay += entryTPerDay;
      const recipe = productionCalculator.getRecipe(entry.sourceResourceId, entry.buildingName);
      const comp = recipe?.production_waste_composition;
      const hasHazardous = recipe?.has_hazardous_waste_output === true;
      if (!comp || !hasHazardous) return;
      const hFrac = comp.hazardous ?? 0;
      if (hFrac === 0 && Object.entries(comp).every(([, f]) => f === 0)) return;
      const coef = 0.3 * (1 - hFrac) + hFrac;
      if (coef <= 0) return;
      const prodWasteTPerDay = entryTPerDay / coef;
      Object.entries(comp).filter(([, f]) => f > 0).forEach(([typeKey, frac]) => {
        const amount = typeKey === 'hazardous' ? prodWasteTPerDay * frac : 0.3 * prodWasteTPerDay * frac;
        if (amount > 0) row.hazardousComposition[typeKey] = (row.hazardousComposition[typeKey] ?? 0) + amount;
      });
    });

    const pollutionDistanceMode = DEFAULT_POLLUTION_DISTANCE_MODE;
    const rows = Array.from(byBuilding.values()).filter((r) => r.sewagePerDay > 0 || r.mixedPerDay > 0 || r.hazardousPerDay > 0);
    const polValues = rows.map((r) => r.pollutionTPerYear).filter((v): v is number => v != null);
    const pollutionMin = polValues.length > 0 ? Math.min(...polValues) : undefined;
    const pollutionMax = polValues.length > 0 ? Math.max(...polValues) : undefined;
    const sdValues = rows.map((r) => r.safetyDistance != null ? getSafetyDistance(r.safetyDistance, pollutionDistanceMode) : null).filter((v): v is number => v != null);
    const distanceMin = sdValues.length > 0 ? Math.min(...sdValues) : undefined;
    const distanceMax = sdValues.length > 0 ? Math.max(...sdValues) : undefined;
    const totals = rows.reduce(
      (acc, r) => ({
        sewagePerDay: acc.sewagePerDay + r.sewagePerDay,
        mixedPerDay: acc.mixedPerDay + r.mixedPerDay,
        hazardousPerDay: acc.hazardousPerDay + r.hazardousPerDay,
        mixedComposition: {} as Record<string, number>,
        hazardousComposition: {} as Record<string, number>,
      }),
      { sewagePerDay: 0, mixedPerDay: 0, hazardousPerDay: 0, mixedComposition: {} as Record<string, number>, hazardousComposition: {} as Record<string, number> }
    );
    rows.forEach((r) => {
      Object.entries(r.mixedComposition).forEach(([k, v]) => { totals.mixedComposition[k] = (totals.mixedComposition[k] ?? 0) + v; });
      Object.entries(r.hazardousComposition).forEach(([k, v]) => { totals.hazardousComposition[k] = (totals.hazardousComposition[k] ?? 0) + v; });
    });
    return { rows, totals, pollutionMin, pollutionMax, distanceMin, distanceMax };
  }, [sewageResult, wasteMixedResult, wasteToxicResult]);

  const totalWorkers = useMemo(() => {
    const activeResults = results.filter(r => !disabledResources.has(r.resourceId));
    return Math.ceil(productionCalculator.calculateTotalWorkers(activeResults));
  }, [results, disabledResources]);

  const totalProfesors = useMemo(() => {
    const activeResults = results.filter(r => !disabledResources.has(r.resourceId));
    return Math.ceil(productionCalculator.calculateTotalProfesors(activeResults));
  }, [results, disabledResources]);

  return {
    fullChainResults,
    results,
    surplusByResource,
    hasAnySurplus,
    sewageResult,
    wasteMixedResult,
    wasteToxicResult,
    personnelBreakdown,
    wasteTableData,
    totalWorkers,
    totalProfesors,
  };
}
