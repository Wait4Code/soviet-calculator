import { renderHook, act } from '@testing-library/react';
import { useChainSettings, settingsFromPlan } from './useChainSettings';
import type { ProductionResult } from '@/data/types';

const EMPTY_CHAIN: ProductionResult[] = [];

describe('settingsFromPlan', () => {
  it('extrait les settings depuis un plan sérialisé', () => {
    const settings = settingsFromPlan({
      g: [],
      y: 1975,
      sq: 60,
      sqr: { rawcoal: 70 },
      br: { steel: 'steel_mill_v2' },
      cr: { steel: 0.8 },
      d: ['coal'],
    });
    expect(settings.chainYear).toBe(1975);
    expect(settings.sourceQualityFromPlan).toBe(60);
    expect(settings.sourceQualityByResource).toEqual({ rawcoal: 70 });
    expect(settings.buildingByResource).toEqual({ steel: 'steel_mill_v2' });
    expect(settings.chargeRatioByResource).toEqual({ steel: 0.8 });
    expect(settings.disabledResources).toEqual(new Set(['coal']));
  });

  it('retourne des valeurs par défaut si le plan est minimal', () => {
    const settings = settingsFromPlan({ g: [], y: 1960 });
    expect(settings.chainYear).toBe(1960);
    expect(settings.sourceQualityFromPlan).toBeNull();
    expect(settings.disabledResources.size).toBe(0);
  });
});

describe('useChainSettings', () => {
  it('initialise avec les valeurs par défaut', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    expect(result.current.chainYear).toBe(1960);
    expect(result.current.disabledResources.size).toBe(0);
    expect(result.current.sourceQualityFromPlan).toBeNull();
    expect(result.current.sourceQualityByResource).toEqual({});
    expect(result.current.buildingByResource).toEqual({});
    expect(result.current.vehicleConfigByResource).toEqual({});
    expect(result.current.chargeRatioByResource).toEqual({});
  });

  it('setChainYear met à jour l\'année', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.setChainYear(1980); });
    expect(result.current.chainYear).toBe(1980);
  });

  it('setSourceQuality met à jour la qualité d\'une ressource', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.setSourceQuality('rawcoal', 75); });
    expect(result.current.sourceQualityByResource.rawcoal).toBe(75);
  });

  it('setSourceQuality clamp entre 0 et 100', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.setSourceQuality('rawcoal', 150); });
    expect(result.current.sourceQualityByResource.rawcoal).toBe(100);
    act(() => { result.current.setSourceQuality('rawcoal', -10); });
    expect(result.current.sourceQualityByResource.rawcoal).toBe(0);
  });

  it('setBuilding met à jour le bâtiment d\'une ressource', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.setBuilding('steel', 'steel_mill_v2'); });
    expect(result.current.buildingByResource.steel).toBe('steel_mill_v2');
  });

  it('setChargeRatio met à jour le ratio', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.setChargeRatio('steel', 0.75); });
    expect(result.current.chargeRatioByResource.steel).toBe(0.75);
  });

  it('toggleResource désactive une ressource', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.toggleResource('coal', EMPTY_CHAIN); });
    expect(result.current.disabledResources.has('coal')).toBe(true);
  });

  it('toggleResource réactive une ressource désactivée', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.toggleResource('coal', EMPTY_CHAIN); });
    act(() => { result.current.toggleResource('coal', EMPTY_CHAIN); });
    expect(result.current.disabledResources.has('coal')).toBe(false);
  });

  it('loadSettings remplace l\'état courant', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => {
      result.current.loadSettings({
        chainYear: 1985,
        sourceQualityFromPlan: 80,
        sourceQualityByResource: { rawcoal: 65 },
        buildingByResource: {},
        vehicleConfigByResource: {},
        chargeRatioByResource: {},
        disabledResources: new Set(['coal']),
      });
    });
    expect(result.current.chainYear).toBe(1985);
    expect(result.current.sourceQualityFromPlan).toBe(80);
    expect(result.current.disabledResources.has('coal')).toBe(true);
  });

  it('resetSettings remet à zéro', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.setChainYear(1985); });
    act(() => { result.current.resetSettings(1960); });
    expect(result.current.chainYear).toBe(1960);
    expect(result.current.disabledResources.size).toBe(0);
  });
});
