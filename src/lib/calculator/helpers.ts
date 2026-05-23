import type { CalculationConfig } from '@/lib/productionCalculator';
import type { ProductionRecipe } from '@/data/types';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Facteur de production : clamp(1 - (year - p1) / p2, p3, 1) */
export function getProductionFactor(year: number, params: { p1: number; p2: number; p3: number }): number {
  const raw = 1 - (year - params.p1) / params.p2;
  return clamp(raw, params.p3, 1);
}

/** Facteur de consommation : 1 + clamp((year - p1) / p2, 0, p3) */
export function getConsumptionFactor(year: number, params: { p1: number; p2: number; p3: number }): number {
  const raw = (year - params.p1) / params.p2;
  return 1 + clamp(raw, 0, params.p3);
}

export function getSourceQuality(config: CalculationConfig, resourceId: string): number {
  return config.sourceQualityByResource?.[resourceId] ?? config.sourceQuality ?? 50;
}

export function getDefaultBuilding(
  config: CalculationConfig,
  resourceId: string,
  recipes: ProductionRecipe[]
): string {
  if (recipes.length === 0) return '';
  const def = config.defaultBuildingByResource?.[resourceId];
  if (def && recipes.some((r) => r.name === def)) return def;
  return recipes[0].name;
}

export function getYear(config: CalculationConfig): number {
  return config.year ?? 1960;
}

/** Taux de charge effectif : surcharge uniquement à la hausse si configurée */
export function getEffectiveChargeRatio(
  config: CalculationConfig,
  resourceId: string,
  calculated: number
): number {
  const override = config.chargeRatioByResource?.[resourceId];
  if (override === undefined) return calculated;
  return Math.max(calculated, Math.min(1, override));
}
