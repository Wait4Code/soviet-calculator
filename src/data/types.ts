/**
 * Représente une recette de production (nouvelle structure depuis productions.json)
 */
export interface ProductionRecipe {
  /** Nom de l'usine */
  name: string;
  /** Production par seconde */
  production: number;
  /** Nombre de travailleurs */
  workers: number;
  /** Nombre de professeurs */
  profesors: number;
  /** Consommation par seconde (clé = ressource, valeur = quantité) */
  consumption: Record<string, number>;
  /** Consommation fixe par bâtiment et par jour (indépendante de la production), ex. eletric en MWh/j, water en m³/j */
  consumption_fixed?: Record<string, number>;
  /** Paramètres optionnels pour l'augmentation de consommation */
  consumption_increase_parameters?: {
    p1: number;
    p2: number;
    p3: number;
  };
  /** Paramètres optionnels pour la diminution de production (année) */
  production_decrease_parameters?: {
    p1: number;
    p2: number;
    p3: number;
  };
  /** Indique si cette recette est une mine (nécessite qualité de source) */
  isMine?: boolean;
  /** Indique si cette recette nécessite des véhicules */
  requiresVehicles?: boolean;
  /** Nombre maximum de véhicules pour cette recette (pour les carrières) */
  maxVehicles?: number;
  /** Skill véhicule requis (excavator, bulldozer, etc.). Défaut excavator. */
  vehicleSkill?: string;
  /** Production connexe (co-produits) : ressourceId → taux (même unité que production) */
  production_co?: Record<string, number>;
  /** Déchet par travailleur (kg/jour). Absent si pas de travailleurs (ex. oil rig, carrières véhicules sans personnel). */
  worker_waste_kg_per_day?: number;
  /** Production de déchet max de l'usine (t/jour, POQM). */
  production_waste_max_t_per_day?: number;
  /** Composition des déchets de production (fractions 0–1) : construction, metal_scrap, aluminium_scrap, plastic, bio, fertilizer, burnable, hazardous, other, ash. */
  production_waste_composition?: Record<string, number>;
  /** Présence d'une sortie déchets dangereux (Stock DD) : 70 % non-dangereux → mixte, 30 % + 100 % HAZ → dangereux. */
  has_hazardous_waste_output?: boolean;
}

/**
 * Représente une ressource avec toutes ses recettes de production possibles
 */
export interface ResourceProduction {
  /** ID de la ressource */
  resourceId: string;
  /** Nom de la ressource */
  resourceName: string;
  /** Toutes les recettes possibles pour produire cette ressource */
  recipes: ProductionRecipe[];
}

/**
 * Résultat d'un calcul de production
 */
export interface ProductionResult {
  /** ID de la ressource produite */
  resourceId: string;
  /** Nom de la ressource produite */
  resourceName?: string;  // Deprecated: use t('resources.' + resourceId) in UI components
  /** Nom de l'usine utilisée */
  buildingName: string;
  /** Nombre de bâtiments nécessaires */
  buildingCount: number;
  /** Ressources requises par seconde */
  inputsPerSecond: Map<string, number>;
  /** Ressources produites par seconde */
  outputsPerSecond: Map<string, number>;
  /** Nombre total de travailleurs nécessaires */
  totalWorkers: number;
  /** Nombre total de professeurs nécessaires */
  totalProfesors: number;
  /** Nombre de travailleurs par bâtiment */
  workersPerBuilding?: number;
  /** Capacité maximale de travailleurs par bâtiment */
  maxWorkersPerBuilding?: number;
  /** Nombre de professeurs par bâtiment */
  profesorsPerBuilding?: number;
  /** Capacité maximale de professeurs par bâtiment */
  maxProfesorsPerBuilding?: number;
  /** Ratio de charge réel (0-1), basé sur l'output ou le nombre d'usines */
  chargeRatio?: number;
  /** Indique si cette ressource est désactivée (importée) */
  disabled?: boolean;
  /** Carrière avec véhicules sans véhicules ni personnel : production nulle, config invalide */
  invalidConfig?: boolean;
  /** Résultat de production connexe (co-produit) : afficher la quantité avec un + */
  isCoProduct?: boolean;
  /** Carrière avec véhicules et personnel activé (afficher charge même si excavatrices suffisent) */
  hasVehiclePersonnelEnabled?: boolean;
  /** Production max t/jour par bâtiment (carrières véhicules) — pour recalculer buildingCount à l'agrégation */
  maxProductionPerDay?: number;
  /** Production véhicules t/jour (pelleteuses, charge 0% = production réelle quand personnel non utilisé) */
  vehicleProductionPerDay?: number;
  /** Détail par bâtiment pour une ligne coproduit (ex. sewage) : contribution de chaque bâtiment. workerWasteTPerDay optionnel pour déchets mixtes (t/j). */
  coproductBreakdown?: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number; workerWasteTPerDay?: number }>;
  /** Détail par bâtiment pour une ligne consommation (eau, électricité) : consommation de chaque bâtiment */
  consumptionBreakdown?: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number }>;
}
