/**
 * Icônes des ressources (images locales téléchargées depuis Workers & Resources wiki)
 * https://workers-resources.fandom.com/
 */

/** Mapping resourceId -> nom du fichier dans public/resources/ */
export const resourceIcons: Record<string, string> = {
  alcohol: 'alcohol.png',
  alumina: 'alumina.png',
  aluminium: 'aluminium.png',
  asphalt: 'asphalt.png',
  bauxite: 'bauxite.png',
  bitumen: 'bitumen.png',
  cement: 'cement.png',
  boards: 'boards.png',
  bricks: 'bricks.png',
  chemicals: 'chemicals.png',
  clothes: 'clothes.png',
  concrete: 'concrete.png',
  coal: 'coal.png',
  ecomponents: 'ecomponents.png',
  eletric: 'eletric.png',
  eletronics: 'eletronics.png',
  explosives: 'explosives.png',
  fertiliser: 'fertiliser.png',
  fertiliser_liquid: 'fertiliser_liquid.png',
  fabric: 'fabric.png',
  food: 'food.png',
  fuel: 'fuel.png',
  gravel: 'gravel.png',
  iron: 'iron.png',
  livestock: 'livestock.png',
  mcomponents: 'mcomponents.png',
  meat: 'meat.png',
  nuclearfuel: 'nuclearfuel.png',
  oil: 'oil.png',
  plants: 'plants.png',
  plastics: 'plastics.png',
  prefabpanels: 'prefabpanels.png',
  rawbauxite: 'rawbauxite.png',
  rawcoal: 'rawcoal.png',
  rawgravel: 'rawgravel.png',
  rawiron: 'rawiron.png',
  steel: 'steel.png',
  uf6: 'uf6.png',
  uranium: 'uranium.png',
  water: 'water.png',
  wood: 'wood.png',
  workers: 'workers.png',
  yellowcake: 'yellowcake.png',
  waste_aluminium: 'waste_aluminium.png',
  waste_bio: 'waste_bio.png',
  waste_gravel: 'waste_gravel.png',
  waste_plastic: 'waste_plastic.png',
  waste_steel: 'waste_steel.png',
};

/**
 * Retourne l'URL de l'icône pour une ressource (chemin local), ou undefined si non définie
 */
export function getResourceIcon(resourceId: string): string | undefined {
  const filename = resourceIcons[resourceId];
  if (!filename) return undefined;
  return `${import.meta.env.BASE_URL}resources/${filename}`;
}
