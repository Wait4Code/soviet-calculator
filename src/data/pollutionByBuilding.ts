/**
 * Environmental pollution (t/year) at max production per building.
 * Source: wrsr_files/readme.md (pol: values). Used for Sewage, waste & pollution table.
 */
export const POLLUTION_T_PER_YEAR: Record<string, number> = {
  fertilizer: 16.4,
  food_factory: 7.8,
  distillery: 9.6,
  animal_farm: 3.6,
  slaughterhouse: 6.9,
  sawmill: 1.2,
  fabric_factory: 8.2,
  clothing_factory: 4.4,
  gravel_mine_small: 2.0,
  gravel_mine_big: 4.1,
  gravel_processing: 12.6,
  gravel_processing_small: 9.3,
  CementPlant: 14.0,
  cement_plant_v3: 14.0,
  cement_plant_v2: 17.2,
  concrete_plant_v2: 8.4,
  panels_factory_v3: 6.2,
  asphalt_plant: 7.0,
  brick_factory_v2: 17.0,
  oil_mine: 4.0,
  oil_rafinery_v2: 34.2,
  coal_mine: 12.2,
  coal_processing: 12.0,
  iron_processing: 12.0,
  chemical_plant: 15.2,
  chemical_plant_big: 65.2,
  plastics_factory: 13.4,
  iron_mine: 12.2,
  steel_mill_v2: 39.9,
  bauxite_processing: 4.2,
  alumina_plant: 24.3,
  aluminium_plant: 20.9,
  uranium_mine: 8.4,
  uranium_processing: 8.4,
  uranium_conversion: 26.0,
  nuclear_fuel_plant: 17.2,
  eletronic_components_factory: 5.4,
  eletronic_factory: 4.0,
  mechanical_components_factory: 7.8,
  explosive_factory: 10.0,
  waste_gravelrecycling: 4.2,
  waste_plasticrecycling: 3.3,
  waste_steelrecycling: 9.6,
  waste_aluminiumrecycling: 7.2,
};

/**
 * The 6 pollution distance modes, ordered from most optimistic to most pessimistic.
 * q80 = targeting 80% life quality, q95 = targeting 95% life quality.
 */
export type PollutionDistanceMode = 'q80_min' | 'q80_med' | 'q80_max' | 'q95_min' | 'q95_med' | 'q95_max';

export const POLLUTION_DISTANCE_MODES: PollutionDistanceMode[] = [
  'q80_min', 'q80_med', 'q80_max', 'q95_min', 'q95_med', 'q95_max',
];

export function getSafetyDistance(
  sd: { q80_min: number; q80_med: number; q80_max: number; q95_min: number; q95_med: number; q95_max: number },
  mode: PollutionDistanceMode
): number {
  return sd[mode];
}
