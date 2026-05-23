import { describe, it, expect } from 'vitest';
import { migrateVehicleConfig, computeVehicleCapacity } from '../vehicleUtils';

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
