/**
 * East-bloc countries of origin for vehicles.
 * Used to determine which bloc flag to display in the vehicle selector.
 */
export const BLOC_EAST_ORIGINS = new Set([
  'Union soviétique',
  'Tchécoslovaquie',
  'Roumanie',
  "Allemagne de l'Est",
  'Pologne',
  'Hongrie',
  'Bulgarie',
  'RDA',
]);

export function getBlocForOrigin(origin: string): 'east' | 'west' {
  return BLOC_EAST_ORIGINS.has(origin) ? 'east' : 'west';
}
