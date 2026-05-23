import { describe, it, expect } from 'vitest';
import { migrateVehicleConfig, computeVehicleCapacity, getDefaultMineVehicleConfig, getMineVehicleConfig } from '../vehicleUtils';

describe('migrateVehicleConfig', () => {
  it('passes through already-migrated config (has vehicleSlots)', () => {
    const cfg = { vehicleSlots: ['e-10011d', null], allowPersonnel: false };
    expect(migrateVehicleConfig(cfg, 2, 'e-10011d')).toBe(cfg);
  });

  it('migrates old format with vehicles array', () => {
    const old = { vehicles: [{ vehicleId: 'e-10011d', count: 2 }], allowPersonnel: true } as unknown as import('@/lib/productionCalculator').MineVehicleConfig;
    const result = migrateVehicleConfig(old, 3, 'e-10011d');
    expect(result.vehicleSlots).toEqual(['e-10011d', 'e-10011d', null]);
    expect(result.allowPersonnel).toBe(true);
  });

  it('returns default config when format is unrecognized', () => {
    const bad = {} as import('@/lib/productionCalculator').MineVehicleConfig;
    const result = migrateVehicleConfig(bad, 2, 'e-10011d');
    expect(result.vehicleSlots).toHaveLength(2);
  });
});

describe('computeVehicleCapacity', () => {
  it('returns 0 for empty slots', () => {
    expect(computeVehicleCapacity([null, null], 'excavator')).toBe(0);
  });

  it('sums skill levels of filled slots', () => {
    // e-10011d is a real vehicle in vehicles.json — use it
    const result = computeVehicleCapacity(['e-10011d'], 'excavator');
    expect(result).toBeGreaterThan(0);
  });
});

describe('getDefaultMineVehicleConfig', () => {
  it('fills all slots with defaultVehicleId', () => {
    const result = getDefaultMineVehicleConfig({ maxVehicles: 3 }, 'e-10011d');
    expect(result.vehicleSlots).toEqual(['e-10011d', 'e-10011d', 'e-10011d']);
    expect(result.allowPersonnel).toBe(false);
  });

  it('returns empty slots for maxVehicles 0', () => {
    const result = getDefaultMineVehicleConfig({ maxVehicles: 0 }, 'e-10011d');
    expect(result.vehicleSlots).toHaveLength(0);
  });
});

describe('getMineVehicleConfig', () => {
  const recipe = { maxVehicles: 2, requiresVehicles: true } as import('@/data/types').ProductionRecipe;

  it('returns default config when no override', () => {
    const config = { defaultVehicleId: 'e-10011d' } as import('@/lib/productionCalculator').CalculationConfig;
    const result = getMineVehicleConfig(config, 'coal', recipe);
    expect(result.vehicleSlots).toHaveLength(2);
    expect(result.vehicleSlots.every(s => s === 'e-10011d')).toBe(true);
  });

  it('returns migrated override when vehicleConfigByResource is set', () => {
    const override = { vehicleSlots: ['e-10011d', null], allowPersonnel: false };
    const config = {
      defaultVehicleId: 'e-10011d',
      vehicleConfigByResource: { coal: override },
    } as import('@/lib/productionCalculator').CalculationConfig;
    const result = getMineVehicleConfig(config, 'coal', recipe);
    expect(result.vehicleSlots).toEqual(['e-10011d', null]);
  });

  it('uses fallback vehicle id e-10011d when defaultVehicleId not set', () => {
    const config = {} as import('@/lib/productionCalculator').CalculationConfig;
    const result = getMineVehicleConfig(config, 'coal', recipe);
    expect(result.vehicleSlots.every(s => s === 'e-10011d')).toBe(true);
  });
});
