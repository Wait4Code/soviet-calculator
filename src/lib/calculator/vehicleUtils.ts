import { getVehicle, getVehicleSkillLevel } from '@/data/vehicles';
import type { ProductionRecipe } from '@/data/types';
import type { MineVehicleConfig, CalculationConfig } from '@/lib/productionCalculator';

/** Construit la config véhicule par défaut (tous les emplacements avec defaultVehicleId, pas de personnel) */
export function getDefaultMineVehicleConfig(
  recipe: Pick<ProductionRecipe, 'maxVehicles'>,
  defaultVehicleId: string
): MineVehicleConfig {
  const maxVehicles = recipe.maxVehicles ?? 0;
  return {
    vehicleSlots: Array(maxVehicles).fill(defaultVehicleId),
    allowPersonnel: false,
  };
}

/** Migre l'ancien format (vehicles) vers le nouveau (vehicleSlots) - exporté pour l'UI */
export function migrateVehicleConfig(old: MineVehicleConfig, maxVehicles: number, defaultVehicleId: string): MineVehicleConfig {
  if ('vehicleSlots' in old && Array.isArray(old.vehicleSlots)) return old;
  if ('vehicles' in old && Array.isArray((old as { vehicles?: { vehicleId: string; count: number }[] }).vehicles)) {
    const vehicles = (old as { vehicles: { vehicleId: string; count: number }[] }).vehicles;
    const slots: (string | null)[] = [];
    for (const v of vehicles) {
      for (let i = 0; i < v.count && slots.length < maxVehicles; i++) {
        slots.push(v.vehicleId);
      }
    }
    while (slots.length < maxVehicles) slots.push(null);
    return { vehicleSlots: slots.slice(0, maxVehicles), allowPersonnel: old.allowPersonnel };
  }
  return getDefaultMineVehicleConfig({ maxVehicles } as ProductionRecipe, defaultVehicleId);
}

/** Calcule la capacité véhicules (somme des skill_level par emplacement non vide) */
export function computeVehicleCapacity(vehicleSlots: (string | null)[], skill: string): number {
  let total = 0;
  for (const vehicleId of vehicleSlots) {
    if (vehicleId) {
      const vehicle = getVehicle(vehicleId);
      if (vehicle) {
        total += getVehicleSkillLevel(vehicle, skill);
      }
    }
  }
  return total;
}

/** Récupère la config véhicule pour une ressource (override ou défaut) */
export function getMineVehicleConfig(
  config: Partial<CalculationConfig>,
  resourceId: string,
  recipe: ProductionRecipe
): MineVehicleConfig {
  const override = config.vehicleConfigByResource?.[resourceId];
  const defaultVehicleId = config.defaultVehicleId ?? 'e-10011d';
  const maxVehicles = recipe.maxVehicles ?? 0;
  if (override) return migrateVehicleConfig(override, maxVehicles, defaultVehicleId);
  return getDefaultMineVehicleConfig(recipe, defaultVehicleId);
}
