/**
 * Traductions des noms de bâtiments (généré depuis doc/buildings_types_categories et doc/translations/FR.txt)
 * Générer avec: node scripts/build-building-translations.js
 */
import buildingNamesData from './buildingNames.json';

const buildingNames = buildingNamesData as Record<string, string>;

/**
 * Retourne le nom traduit d'un bâtiment, ou le nom brut si pas de traduction
 */
export function getBuildingName(buildingName: string): string {
  if (!buildingName || buildingName === 'Import') return buildingName;
  return buildingNames[buildingName] ?? buildingName;
}
