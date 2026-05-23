import { describe, it, expect } from 'vitest';
import type { ProductionRecipe } from '@/data/types';
import {
  clamp,
  getProductionFactor,
  getConsumptionFactor,
  getSourceQuality,
  getDefaultBuilding,
  getYear,
  getEffectiveChargeRatio,
} from '../helpers';

describe('clamp', () => {
  it('returns min when value is below', () => expect(clamp(-5, 0, 10)).toBe(0));
  it('returns max when value is above', () => expect(clamp(15, 0, 10)).toBe(10));
  it('returns value when within range', () => expect(clamp(5, 0, 10)).toBe(5));
});

describe('getProductionFactor', () => {
  // formula: clamp(1 - (year - p1) / p2, p3, 1)
  it('returns 1 in base year', () => {
    expect(getProductionFactor(1960, { p1: 1960, p2: 10, p3: 0.5 })).toBe(1);
  });
  it('decreases after base year', () => {
    const f = getProductionFactor(1970, { p1: 1960, p2: 10, p3: 0.5 });
    expect(f).toBe(0.5); // 1 - (1970-1960)/10 = 0, clamped to p3=0.5
  });
  it('never drops below p3', () => {
    const f = getProductionFactor(2000, { p1: 1960, p2: 10, p3: 0.3 });
    expect(f).toBe(0.3);
  });
});

describe('getConsumptionFactor', () => {
  // formula: 1 + clamp((year - p1) / p2, 0, p3)
  it('returns 1 in base year', () => {
    expect(getConsumptionFactor(1960, { p1: 1960, p2: 10, p3: 0.5 })).toBe(1);
  });
  it('increases after base year', () => {
    const f = getConsumptionFactor(1970, { p1: 1960, p2: 10, p3: 0.5 });
    expect(f).toBe(1.5); // 1 + clamp(1, 0, 0.5) = 1.5
  });
  it('never exceeds 1 + p3', () => {
    const f = getConsumptionFactor(2000, { p1: 1960, p2: 10, p3: 0.5 });
    expect(f).toBe(1.5);
  });
});

describe('getSourceQuality', () => {
  it('returns resource-specific quality when available', () => {
    const config = { sourceQualityByResource: { coal: 80 }, sourceQuality: 50 } as unknown as import('@/lib/productionCalculator').CalculationConfig;
    expect(getSourceQuality(config, 'coal')).toBe(80);
  });
  it('falls back to global sourceQuality', () => {
    const config = { sourceQuality: 60 } as unknown as import('@/lib/productionCalculator').CalculationConfig;
    expect(getSourceQuality(config, 'iron')).toBe(60);
  });
  it('defaults to 50 when no quality configured', () => {
    const config = {} as unknown as import('@/lib/productionCalculator').CalculationConfig;
    expect(getSourceQuality(config, 'coal')).toBe(50);
  });
});

describe('getDefaultBuilding', () => {
  it('returns empty string when recipes array is empty', () => {
    const config = {} as unknown as import('@/lib/productionCalculator').CalculationConfig;
    expect(getDefaultBuilding(config, 'coal', [])).toBe('');
  });
  it('returns override when it matches a recipe', () => {
    const config = {
      defaultBuildingByResource: { coal: 'Coal Mine' },
    } as unknown as import('@/lib/productionCalculator').CalculationConfig;
    const recipes: ProductionRecipe[] = [
      { name: 'Wooden Mine', production: 1, workers: 10, professors: 0, consumption: {} },
      { name: 'Coal Mine', production: 2, workers: 15, professors: 0, consumption: {} },
    ];
    expect(getDefaultBuilding(config, 'coal', recipes)).toBe('Coal Mine');
  });
  it('returns first recipe name when override does not match', () => {
    const config = {
      defaultBuildingByResource: { coal: 'Nonexistent Mine' },
    } as unknown as import('@/lib/productionCalculator').CalculationConfig;
    const recipes: ProductionRecipe[] = [
      { name: 'Wooden Mine', production: 1, workers: 10, professors: 0, consumption: {} },
      { name: 'Coal Mine', production: 2, workers: 15, professors: 0, consumption: {} },
    ];
    expect(getDefaultBuilding(config, 'coal', recipes)).toBe('Wooden Mine');
  });
  it('returns first recipe name when no override configured', () => {
    const config = {} as unknown as import('@/lib/productionCalculator').CalculationConfig;
    const recipes: ProductionRecipe[] = [
      { name: 'Wooden Mine', production: 1, workers: 10, professors: 0, consumption: {} },
      { name: 'Coal Mine', production: 2, workers: 15, professors: 0, consumption: {} },
    ];
    expect(getDefaultBuilding(config, 'coal', recipes)).toBe('Wooden Mine');
  });
});

describe('getYear', () => {
  it('returns configured year', () => {
    const config = { year: 1975 } as unknown as import('@/lib/productionCalculator').CalculationConfig;
    expect(getYear(config)).toBe(1975);
  });
  it('defaults to 1960', () => {
    const config = {} as unknown as import('@/lib/productionCalculator').CalculationConfig;
    expect(getYear(config)).toBe(1960);
  });
});

describe('getEffectiveChargeRatio', () => {
  it('returns calculated value when no override', () => {
    const config = {} as unknown as import('@/lib/productionCalculator').CalculationConfig;
    expect(getEffectiveChargeRatio(config, 'coal', 0.6)).toBe(0.6);
  });
  it('returns override when override > calculated', () => {
    const config = { chargeRatioByResource: { coal: 0.9 } } as unknown as import('@/lib/productionCalculator').CalculationConfig;
    expect(getEffectiveChargeRatio(config, 'coal', 0.6)).toBe(0.9);
  });
  it('returns calculated when override < calculated', () => {
    const config = { chargeRatioByResource: { coal: 0.4 } } as unknown as import('@/lib/productionCalculator').CalculationConfig;
    expect(getEffectiveChargeRatio(config, 'coal', 0.6)).toBe(0.6);
  });
  it('clamps override to 1', () => {
    const config = { chargeRatioByResource: { coal: 1.5 } } as unknown as import('@/lib/productionCalculator').CalculationConfig;
    expect(getEffectiveChargeRatio(config, 'coal', 0.6)).toBe(1);
  });
});
