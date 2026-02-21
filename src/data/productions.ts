import productionsData from './productions.json';
import { ResourceProduction, ProductionRecipe } from './types';

/**
 * Mapping des IDs de ressources vers leurs noms en français
 */
const resourceNames: Record<string, string> = {
  alcohol: 'Alcool',
  alumina: 'Alumine',
  aluminium: 'Aluminium',
  asphalt: 'Asphalte',
  bauxite: 'Bauxite',
  bitumen: 'Bitume',
  boards: 'Planches',
  bricks: 'Briques',
  cement: 'Ciment',
  chemicals: 'Produits Chimiques',
  clothes: 'Vêtements',
  coal: 'Charbon',
  concrete: 'Béton',
  ecomponents: 'Composants Électroniques',
  eletronics: 'Électronique',
  explosives: 'Explosifs',
  fabric: 'Tissu',
  fertiliser: 'Engrais',
  fertiliser_liquid: 'Engrais Liquide',
  food: 'Nourriture',
  fuel: 'Carburant',
  gravel: 'Gravier',
  iron: 'Fer',
  livestock: 'Bétail',
  mcomponents: 'Composants Mécaniques',
  meat: 'Viande',
  nuclearfuel: 'Combustible Nucléaire',
  oil: 'Pétrole',
  plants: 'Cultures',
  plastics: 'Plastique',
  prefabpanels: 'Plaques Préfabriquées',
  rawbauxite: 'Bauxite Brute',
  rawcoal: 'Minerai de charbon',
  rawgravel: 'Pierre',
  rawiron: 'Minerai de Fer',
  steel: 'Acier',
  uf6: 'UF6',
  uranium: 'Uranium',
  vehicles: 'Véhicules',
  wood: 'Bois',
  yellowcake: 'Oxyde d\'uranium',
  // Ressources de consommation
  water: 'Eau',
  eletric: 'Électricité',
  // Déchets
  waste_aluminium: 'Rebuts d\'aluminium',
  waste_bio: 'Déchets organiques',
  waste_burnable: 'Déchets combustibles',
  waste_gravel: 'Déchets de gravier',
  waste_mixed: 'Autres déchets',
  waste_other: 'Autres déchets',
  waste_plastic: 'Déchets plastiques',
  waste_steel: 'Rebuts de métal',
  waste_toxic: 'Déchets dangereux',
};

/**
 * Charge et transforme les données de productions.json
 */
export function loadProductions(): Map<string, ResourceProduction> {
  const productions = new Map<string, ResourceProduction>();

  Object.entries(productionsData).forEach(([resourceId, recipes]) => {
    const resourceName = resourceNames[resourceId] || resourceId;
    
    productions.set(resourceId, {
      resourceId,
      resourceName,
      recipes: recipes as ProductionRecipe[],
    });
  });

  return productions;
}

/**
 * Obtient le nom d'une ressource
 */
export function getResourceName(resourceId: string): string {
  return resourceNames[resourceId] || resourceId;
}

/**
 * Instance globale des productions
 */
export const productions = loadProductions();
