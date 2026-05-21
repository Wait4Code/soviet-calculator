import { useState } from 'react';
import { productionCalculator } from '@/lib/productionCalculator';
import type { ProductionResult } from '@/data/types';
import type { MineVehicleConfig } from '@/lib/productionCalculator';
import type { PlanStateSerialized } from '@/lib/planUrl';

export interface ChainSettingsState {
  disabledResources: Set<string>;
  chainYear: number;
  sourceQualityFromPlan: number | null;
  sourceQualityByResource: Record<string, number>;
  buildingByResource: Record<string, string>;
  vehicleConfigByResource: Record<string, MineVehicleConfig>;
  chargeRatioByResource: Record<string, number>;
}

export interface UseChainSettingsReturn extends ChainSettingsState {
  toggleResource: (id: string, fullChainResults: ProductionResult[]) => void;
  setSourceQuality: (id: string, q: number) => void;
  setBuilding: (id: string, buildingName: string) => void;
  setVehicleConfig: (id: string, cfg: MineVehicleConfig) => void;
  setChargeRatio: (id: string, ratio: number) => void;
  /** Remove the charge ratio override for a resource (falls back to recipe default). */
  resetChargeRatio: (id: string) => void;
  setChainYear: (year: number) => void;
  loadSettings: (state: ChainSettingsState) => void;
  resetSettings: (defaultYear?: number) => void;
}

export function settingsFromPlan(plan: PlanStateSerialized): ChainSettingsState {
  const vc: Record<string, MineVehicleConfig> = {};
  if (plan.vc && typeof plan.vc === 'object') {
    for (const [rid, v] of Object.entries(plan.vc)) {
      if (v && Array.isArray(v.vehicleSlots) && typeof v.allowPersonnel === 'boolean') {
        vc[rid] = { vehicleSlots: v.vehicleSlots, allowPersonnel: v.allowPersonnel };
      }
    }
  }
  return {
    disabledResources: new Set(plan.d ?? []),
    chainYear: plan.y ?? 1960,
    sourceQualityFromPlan: plan.sq ?? null,
    sourceQualityByResource: plan.sqr ?? {},
    buildingByResource: plan.br ?? {},
    vehicleConfigByResource: vc,
    chargeRatioByResource: plan.cr ?? {},
  };
}

export function useChainSettings(defaultYear: number): UseChainSettingsReturn {
  const [disabledResources, setDisabledResources] = useState<Set<string>>(new Set());
  const [manuallyDisabledResources, setManuallyDisabledResources] = useState<Set<string>>(new Set());
  const [initialDisabledResources] = useState<Set<string>>(new Set());
  const [chainYear, setChainYear] = useState<number>(defaultYear);
  const [sourceQualityFromPlan, setSourceQualityFromPlan] = useState<number | null>(null);
  const [sourceQualityByResource, setSourceQualityByResource] = useState<Record<string, number>>({});
  const [buildingByResource, setBuildingByResource] = useState<Record<string, string>>({});
  const [vehicleConfigByResource, setVehicleConfigByResource] = useState<Record<string, MineVehicleConfig>>({});
  const [chargeRatioByResource, setChargeRatioByResource] = useState<Record<string, number>>({});

  const toggleResource = (resourceId: string, fullChainResults: ProductionResult[]) => {
    if (productionCalculator.canDisableResource && !productionCalculator.canDisableResource(resourceId)) return;

    const newDisabled = new Set(disabledResources);
    const newManuallyDisabled = new Set(manuallyDisabledResources);
    const wasDisabled = newDisabled.has(resourceId);

    if (wasDisabled) {
      newDisabled.delete(resourceId);
      newManuallyDisabled.delete(resourceId);
      if (productionCalculator.findDependentResources) {
        const dependentResources = productionCalculator.findDependentResources(
          new Set([resourceId]),
          fullChainResults
        );
        newDisabled.forEach((disabledResourceId) => {
          if (dependentResources.has(disabledResourceId)) {
            const wasManuallyDisabled = newManuallyDisabled.has(disabledResourceId);
            const wasInitiallyDisabled = initialDisabledResources.has(disabledResourceId);
            if (!wasManuallyDisabled && !wasInitiallyDisabled) {
              newDisabled.delete(disabledResourceId);
              newManuallyDisabled.delete(disabledResourceId);
            }
          }
        });
      }
    } else {
      newDisabled.add(resourceId);
      newManuallyDisabled.add(resourceId);
      if (productionCalculator.findDependentResources) {
        const dependentResources = productionCalculator.findDependentResources(
          new Set([resourceId]),
          fullChainResults
        );
        dependentResources.forEach((depId) => {
          if (!productionCalculator.canDisableResource || productionCalculator.canDisableResource(depId)) {
            newDisabled.add(depId);
          }
        });
      }
    }

    setDisabledResources(newDisabled);
    setManuallyDisabledResources(newManuallyDisabled);
  };

  const setSourceQuality = (id: string, q: number) => {
    setSourceQualityByResource((prev) => ({
      ...prev,
      [id]: Math.max(0, Math.min(100, q)),
    }));
  };

  const setBuilding = (id: string, buildingName: string) => {
    setBuildingByResource((prev) => ({ ...prev, [id]: buildingName }));
  };

  const setVehicleConfig = (id: string, cfg: MineVehicleConfig) => {
    setVehicleConfigByResource((prev) => ({ ...prev, [id]: cfg }));
  };

  const setChargeRatio = (id: string, ratio: number) => {
    setChargeRatioByResource((prev) => ({ ...prev, [id]: ratio }));
  };

  const resetChargeRatio = (id: string) => {
    setChargeRatioByResource((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const loadSettings = (state: ChainSettingsState) => {
    setDisabledResources(new Set(state.disabledResources));
    setManuallyDisabledResources(new Set());
    setChainYear(state.chainYear);
    setSourceQualityFromPlan(state.sourceQualityFromPlan);
    setSourceQualityByResource({ ...state.sourceQualityByResource });
    setBuildingByResource({ ...state.buildingByResource });
    setVehicleConfigByResource({ ...state.vehicleConfigByResource });
    setChargeRatioByResource({ ...state.chargeRatioByResource });
  };

  const resetSettings = (year?: number) => {
    setDisabledResources(new Set());
    setManuallyDisabledResources(new Set());
    setChainYear(year ?? defaultYear);
    setSourceQualityFromPlan(null);
    setSourceQualityByResource({});
    setBuildingByResource({});
    setVehicleConfigByResource({});
    setChargeRatioByResource({});
  };

  return {
    disabledResources,
    chainYear,
    sourceQualityFromPlan,
    sourceQualityByResource,
    buildingByResource,
    vehicleConfigByResource,
    chargeRatioByResource,
    toggleResource,
    setSourceQuality,
    setBuilding,
    setVehicleConfig,
    setChargeRatio,
    resetChargeRatio,
    setChainYear,
    loadSettings,
    resetSettings,
  };
}
