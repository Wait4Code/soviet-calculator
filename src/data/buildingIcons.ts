/**
 * Résolution des images de bâtiments.
 * Les images sont copiées dans public/buildings/{buildingName}.png par le script copy-building-images.js
 */
const BASE = import.meta.env.BASE_URL;
const BUILDINGS_BASE = `${BASE}buildings`;

/** Mappings nom bâtiment → nom fichier image (quand le nom diffère dans le jeu) */
const BUILDING_IMAGE_ALIASES: Record<string, string> = {
  gravel_mine_small: 'gravelmine', // tool_gravelmine.png = petite mine de gravier
};

/** Retourne le chemin de l'image d'un bâtiment (toutes regroupées dans public/buildings/) */
function getBuildingImagePaths(buildingName: string): string[] {
  const fileName = BUILDING_IMAGE_ALIASES[buildingName] ?? buildingName;
  return [`${BUILDINGS_BASE}/${fileName}.png`];
}

/**
 * Retourne l'URL de l'image d'un bâtiment.
 * La première URL de la liste est retournée (le navigateur testera le chargement).
 * Utiliser onError sur l'img pour afficher un fallback si l'image n'existe pas.
 */
export function getBuildingImageUrl(buildingName: string): string {
  return getBuildingImagePaths(buildingName)[0];
}

/**
 * Retourne toutes les URLs possibles pour un bâtiment (pour préchargement ou fallback).
 */
export function getBuildingImageUrls(buildingName: string): string[] {
  return getBuildingImagePaths(buildingName);
}
