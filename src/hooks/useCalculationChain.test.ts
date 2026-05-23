import { renderHook } from '@testing-library/react';
import { useCalculationChain } from './useCalculationChain';
import type { ProductionGoal } from '@/data/types';
import type { ChainSettingsState } from './useChainSettings';

const DEFAULT_SETTINGS: ChainSettingsState = {
  disabledResources: new Set(),
  chainYear: 1960,
  sourceQualityFromPlan: null,
  sourceQualityByResource: {},
  buildingByResource: {},
  vehicleConfigByResource: {},
  chargeRatioByResource: {},
};

const STEEL_GOAL: ProductionGoal = {
  id: 'test-1',
  resourceId: 'steel',
  buildingName: 'steel_mill_v2',
  inputType: 'buildings',
  value: 1,
};

describe('useCalculationChain', () => {
  it('retourne des listes vides si aucun goal valide', () => {
    const { result } = renderHook(() =>
      useCalculationChain([], DEFAULT_SETTINGS, {
        sourceQuality: 50,
        defaultVehicleId: 'e-10011d',
        defaultBuildingByResource: {},
      })
    );
    expect(result.current.results).toHaveLength(0);
    expect(result.current.fullChainResults).toHaveLength(0);
  });

  it('calcule une chaîne acier complète (1 aciérie)', () => {
    const { result } = renderHook(() =>
      useCalculationChain([STEEL_GOAL], DEFAULT_SETTINGS, {
        sourceQuality: 50,
        defaultVehicleId: 'e-10011d',
        defaultBuildingByResource: {},
      })
    );
    const steelResult = result.current.results.find(
      (r) => r.resourceId === 'steel' && r.buildingName === 'steel_mill_v2'
    );
    expect(steelResult).toBeDefined();
    expect(steelResult!.buildingCount).toBe(1);
  });

  it('totalWorkers est calculé sur les ressources actives', () => {
    const { result } = renderHook(() =>
      useCalculationChain([STEEL_GOAL], DEFAULT_SETTINGS, {
        sourceQuality: 50,
        defaultVehicleId: 'e-10011d',
        defaultBuildingByResource: {},
      })
    );
    expect(result.current.totalWorkers).toBeGreaterThan(0);
    expect(result.current.totalProfessors).toBeGreaterThanOrEqual(0);
  });

  it('respecte les ressources désactivées', () => {
    const settings: ChainSettingsState = {
      ...DEFAULT_SETTINGS,
      disabledResources: new Set(['coal']),
    };
    const { result } = renderHook(() =>
      useCalculationChain([STEEL_GOAL], settings, {
        sourceQuality: 50,
        defaultVehicleId: 'e-10011d',
        defaultBuildingByResource: {},
      })
    );
    const coalResult = result.current.results.find((r) => r.resourceId === 'coal');
    // La ressource coal doit apparaître comme importée (disabled = true)
    expect(coalResult?.disabled).toBe(true);
  });
});
