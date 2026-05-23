import { describe, it, expect } from 'vitest';
import { calculateBuildingsAndWorkers } from '../buildingCalculator';
import { productions } from '@/data/productions';

describe('calculateBuildingsAndWorkers', () => {
  const rawcoalRecipes = productions.get('rawcoal')!.recipes;
  const coalMine = rawcoalRecipes[0]; // coal_mine (isMine, production=4.2, workers=220)

  it('calculates building count for a coal mine at 50% quality', () => {
    // maxProd/building = 4.2 * 220 * 0.5 = 462 t/day; ceil(656/462) = 2
    const result = calculateBuildingsAndWorkers(coalMine, 656, 'rawcoal', 50);
    expect(result.buildingCount).toBe(2);
  });

  it('returns chargeRatio between 0 and 1', () => {
    const result = calculateBuildingsAndWorkers(coalMine, 100, 'rawcoal', 50);
    expect(result.chargeRatio).toBeGreaterThan(0);
    expect(result.chargeRatio).toBeLessThanOrEqual(1);
  });

  it('returns invalidConfig for quarry with no vehicles and no personnel', () => {
    const rawgravelRecipes = productions.get('rawgravel')!.recipes;
    const quarry = rawgravelRecipes.find((r) => r.requiresVehicles)!;
    const result = calculateBuildingsAndWorkers(quarry, 100, 'rawgravel', 50, 'e-10011d', 1960, {
      vehicleSlots: [null, null, null],
      allowPersonnel: false,
    });
    expect(result.invalidConfig).toBe(true);
    expect(result.buildingCount).toBe(0);
  });
});
