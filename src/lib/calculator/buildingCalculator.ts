import type { ProductionRecipe, ProductionResult } from '@/data/types';
import type { MineVehicleConfig } from '@/lib/productionCalculator';
import { getResourceName } from '@/data/productions';
import { clamp, getProductionFactor, getConsumptionFactor } from './helpers';
import { computeVehicleCapacity, getDefaultMineVehicleConfig } from './vehicleUtils';

function isMine(recipe: ProductionRecipe): boolean { return recipe.isMine === true; }
function requiresVehicles(recipe: ProductionRecipe): boolean { return recipe.requiresVehicles === true; }

export interface BuildingCalcResult {
  buildingCount: number;
  workersPerBuilding: number;
  totalWorkers: number;
  chargeRatio: number;
  vehicleProductionPerDay?: number;
  maxPersonnelProductionPerDay?: number;
  maxProductionPerBuilding?: number;
  invalidConfig?: boolean;
  allowPersonnel?: boolean;
}

export function calculateBuildingsAndWorkers(
  recipe: ProductionRecipe,
  targetOutputPerDay: number,
  _resourceId: string,
  sourceQuality: number = 50,
  defaultVehicleId: string = 'e-10011d',
  year: number = 1960,
  vehicleConfig?: MineVehicleConfig
): BuildingCalcResult {
  if (recipe.production === 0) {
    return { buildingCount: 0, workersPerBuilding: 0, totalWorkers: 0, chargeRatio: 0, vehicleProductionPerDay: undefined };
  }

  // Appliquer la qualité de source pour les mines
  const sourceQualityFactor = isMine(recipe) ? sourceQuality / 100 : 1;
  let adjustedProduction = recipe.production * sourceQualityFactor;

  // Appliquer le facteur d'année pour les recettes électroniques
  if (recipe.production_decrease_parameters) {
    adjustedProduction *= getProductionFactor(year, recipe.production_decrease_parameters);
  }

  // Gérer les carrières avec véhicules
  if (requiresVehicles(recipe)) {
    const effectiveConfig = vehicleConfig ?? getDefaultMineVehicleConfig(recipe, defaultVehicleId);
    const skill = recipe.vehicleSkill ?? 'excavator';

    const vehicleCapacity = computeVehicleCapacity(effectiveConfig.vehicleSlots, skill);
    const allowPersonnel = effectiveConfig.allowPersonnel;
    // Capacité max par bâtiment : véhicules + (personnel si autorisé, jusqu'à recipe.workers)
    // Pas de plafond total : (3*37 + 100) * 3.5 * qualité pour gravel avec 3 excav niveau 37 et 100 workers
    const maxCapacityPerBuilding = vehicleCapacity + (allowPersonnel ? recipe.workers : 0);

    if (maxCapacityPerBuilding > 0) {
      const maxProductionPerBuilding = adjustedProduction * maxCapacityPerBuilding;
      const buildingCount = Math.ceil(targetOutputPerDay / maxProductionPerBuilding);
      // Production véhicules = fixe (pelleteuses toujours à 100 % quand présentes)
      const vehicleProductionPerDay = adjustedProduction * vehicleCapacity * buildingCount;
      // Charge = utilisation du PERSONNEL uniquement. Si les pelleteuses suffisent, charge = 0 %
      const maxPersonnelProductionPerDay = allowPersonnel ? adjustedProduction * recipe.workers * buildingCount : 0;
      const chargeRatio = allowPersonnel && maxPersonnelProductionPerDay > 0
        ? clamp((targetOutputPerDay - vehicleProductionPerDay) / maxPersonnelProductionPerDay, 0, 1)
        : 0;

      // Personnel : charge × workers par bâtiment
      const personnelPerBuilding = allowPersonnel ? chargeRatio * recipe.workers : 0;
      const totalWorkersNeeded = allowPersonnel ? Math.ceil(personnelPerBuilding * buildingCount) : 0;
      const workersPerBuilding = allowPersonnel ? Math.ceil(personnelPerBuilding) : 0;

      return {
        buildingCount,
        workersPerBuilding,
        totalWorkers: totalWorkersNeeded,
        chargeRatio,
        vehicleProductionPerDay: allowPersonnel ? vehicleProductionPerDay : maxProductionPerBuilding * buildingCount,
        maxPersonnelProductionPerDay: allowPersonnel ? maxPersonnelProductionPerDay : undefined,
        maxProductionPerBuilding,
        allowPersonnel,
      };
    }
    // Sans véhicules ni personnel : carrière ne produit rien
    return {
      buildingCount: 0,
      workersPerBuilding: 0,
      totalWorkers: 0,
      chargeRatio: 0,
      vehicleProductionPerDay: 0,
      invalidConfig: true,
    };
  }

  // Calcul pour les mines avec personnel mais sans véhicules (coal, iron, uranium) : production = base × workers × qualité
  if (isMine(recipe) && recipe.workers > 0 && !requiresVehicles(recipe)) {
    const maxProductionPerBuilding = adjustedProduction * recipe.workers;
    const buildingCount = Math.ceil(targetOutputPerDay / maxProductionPerBuilding);
    const chargeRatio = buildingCount > 0 ? targetOutputPerDay / (maxProductionPerBuilding * buildingCount) : 0;
    const totalWorkersNeeded = Math.ceil(recipe.workers * chargeRatio * buildingCount);
    const workersPerBuilding = buildingCount > 0 ? Math.ceil(totalWorkersNeeded / buildingCount) : totalWorkersNeeded;
    return {
      buildingCount,
      workersPerBuilding,
      totalWorkers: totalWorkersNeeded,
      chargeRatio,
      vehicleProductionPerDay: undefined,
    };
  }

  // Calcul pour les bâtiments sans personnel (mines workers=0 comme oil, éoliennes, etc.)
  if (recipe.workers === 0 || isMine(recipe)) {
    const productionPerBuilding = adjustedProduction;

    // Calculer le nombre de bâtiments nécessaires (arrondi au supérieur)
    const buildingCount = Math.ceil(targetOutputPerDay / productionPerBuilding);

    // Pas de personnel ni ratio de charge (production fixe)
    return {
      buildingCount,
      workersPerBuilding: 0,
      totalWorkers: 0,
      chargeRatio: 0,
      vehicleProductionPerDay: undefined,
    };
  }

  // Production maximale d'un bâtiment (en tonnes/jour)
  const maxProductionPerBuilding = adjustedProduction * recipe.workers;

  // Calculer le nombre de bâtiments nécessaires (arrondi au supérieur)
  const buildingCount = Math.ceil(targetOutputPerDay / maxProductionPerBuilding);

  // Calculer le ratio de charge réel basé sur l'output attendu
  const chargeRatio = buildingCount > 0 ? targetOutputPerDay / (maxProductionPerBuilding * buildingCount) : 0;

  // Calculer le nombre total de travailleurs nécessaires basé sur le ratio de charge
  const totalWorkersNeeded = Math.ceil(recipe.workers * chargeRatio * buildingCount);

  // Répartir les travailleurs équitablement sur les bâtiments
  const workersPerBuilding = buildingCount > 0
    ? Math.ceil(totalWorkersNeeded / buildingCount)
    : totalWorkersNeeded;

  return {
    buildingCount,
    workersPerBuilding,
    totalWorkers: totalWorkersNeeded,
    chargeRatio,
    vehicleProductionPerDay: undefined,
  };
}

export function calculateRequirementsForBuildings(
  resourceId: string,
  recipe: ProductionRecipe,
  buildingCount: number,
  totalWorkers: number,
  workersPerBuilding?: number,
  chargeRatio?: number,
  sourceQualityFactor: number = 1,
  vehicleProductionPerDay?: number,
  year: number = 1960
): ProductionResult {
  const inputsPerDay = new Map<string, number>();
  const outputsPerDay = new Map<string, number>();

  // Pas de personnel : workers=0 (ex. oil_mine) ou mine avec véhicules sans personnel (allowPersonnel=false)
  const noPersonnel = recipe.workers === 0 || (isMine(recipe) && requiresVehicles(recipe) && totalWorkers === 0);

  // Si chargeRatio n'est pas fourni, le calculer à partir des travailleurs
  const actualChargeRatio = noPersonnel ? 0 : (chargeRatio !== undefined
    ? chargeRatio
    : (recipe.workers > 0 && workersPerBuilding !== undefined
        ? workersPerBuilding / recipe.workers
        : 1));

  // Calculer les sorties : production * totalWorkers (en tonnes/jour)
  // Utiliser le ratio de charge pour avoir la production exacte
  // Appliquer le facteur de qualité de source pour les mines
  // Pour les mines avec véhicules, utiliser la production calculée avec les véhicules
  let outputPerDay: number;
  if (vehicleProductionPerDay !== undefined) {
    // Production déjà calculée avec les véhicules
    outputPerDay = vehicleProductionPerDay;
  } else {
    const baseProductionPerBuilding = recipe.production * sourceQualityFactor;
    // Si requiresVehicles, la production est déjà calculée avec les véhicules
    // Mines avec workers (coal, iron, uranium) : production × workers × qualité × bâtiments
    // Autres sans personnel (oil, éoliennes) : production × qualité × bâtiments
    if (noPersonnel) {
      if (isMine(recipe) && recipe.workers > 0 && !requiresVehicles(recipe)) {
        outputPerDay = recipe.production * recipe.workers * sourceQualityFactor * buildingCount;
      } else {
        outputPerDay = baseProductionPerBuilding * buildingCount;
      }
    } else {
      const maxProductionPerBuilding = requiresVehicles(recipe)
        ? baseProductionPerBuilding  // Pour les véhicules, production est déjà en t/j/niveau, pas besoin de multiplier par workers
        : baseProductionPerBuilding * recipe.workers;
      outputPerDay = maxProductionPerBuilding * actualChargeRatio * buildingCount;
    }
  }
  // Appliquer le facteur d'année sur la production (composants/appareils électroniques)
  const productionFactor = recipe.production_decrease_parameters
    ? getProductionFactor(year, recipe.production_decrease_parameters)
    : 1;
  outputsPerDay.set(resourceId, outputPerDay * productionFactor);

  // Facteur de consommation : 1 + clamp((year - p1) / p2, 0, p3) via consumption_increase_parameters
  const consumptionFactor = recipe.consumption_increase_parameters
    ? getConsumptionFactor(year, recipe.consumption_increase_parameters)
    : 1;

  // Calculer les entrées : utiliser le ratio de charge pour avoir la consommation exacte
  // Exception : l'électricité ne se multiplie pas par le nombre de travailleurs
  Object.entries(recipe.consumption).forEach(([inputResourceId, consumptionPerWorkerPerDay]) => {
    let consumptionPerDay: number;
    if (noPersonnel) {
      // Pour les bâtiments sans personnel (mines, etc.), consommation directe par bâtiment
      consumptionPerDay = consumptionPerWorkerPerDay * buildingCount;
    } else if (inputResourceId === 'eletric') {
      // L'électricité est déjà en MWh/jour par bâtiment, on multiplie par le nombre de bâtiments et le ratio de charge
      consumptionPerDay = consumptionPerWorkerPerDay * buildingCount * actualChargeRatio;
    } else {
      // Pour les autres ressources, utiliser le ratio de charge avec la capacité max
      const maxConsumptionPerBuilding = consumptionPerWorkerPerDay * recipe.workers;
      consumptionPerDay = maxConsumptionPerBuilding * actualChargeRatio * buildingCount;
    }
    inputsPerDay.set(inputResourceId, consumptionPerDay * consumptionFactor);
  });

  // Consommation fixe par bâtiment (indépendante de la charge) : consommation_fixed × buildingCount
  // L'eau n'est plus en consumption_fixed : elle est calculée ci-dessous (0,02 u./travailleur/jour)
  const consumptionFixed = recipe.consumption_fixed ?? {};
  Object.entries(consumptionFixed).forEach(([inputResourceId, perBuildingPerDay]) => {
    if (inputResourceId === 'water' || inputResourceId === 'usagewater') return;
    const consumptionPerDay = perBuildingPerDay * buildingCount;
    const current = inputsPerDay.get(inputResourceId) ?? 0;
    inputsPerDay.set(inputResourceId, current + consumptionPerDay);
  });

  // Eau des travailleurs : 0,02 u./travailleur/jour (indépendant de la production)
  const effectiveTotalWorkersForWater = noPersonnel ? 0 : totalWorkers;
  if (effectiveTotalWorkersForWater > 0) {
    const workerWaterPerDay = 0.02 * effectiveTotalWorkersForWater;
    inputsPerDay.set('water', (inputsPerDay.get('water') ?? 0) + workerWaterPerDay);
  }

  // Eaux usées (sewage) : 1 m³ d'eau consommée → 1 m³ de sewage (travailleurs + production)
  const waterConsumedPerDay = (inputsPerDay.get('water') ?? 0) + (inputsPerDay.get('usagewater') ?? 0);
  if (waterConsumedPerDay > 0) {
    outputsPerDay.set('sewage', (outputsPerDay.get('sewage') ?? 0) + waterConsumedPerDay);
  }

  // Déchets (t/j) : travailleurs + production. Sans travailleurs (oil rig, carrières véhicules sans personnel) : pas de déchet travailleur.
  const workerWasteKgPerDay = recipe.worker_waste_kg_per_day;
  const prodWasteMaxTPerDay = recipe.production_waste_max_t_per_day;
  const prodWasteComposition = recipe.production_waste_composition;
  const hasHazardousOutput = recipe.has_hazardous_waste_output === true;

  let wasteMixedTPerDay = 0;
  let wasteToxicTPerDay = 0;

  // Déchets travailleurs : uniquement si des travailleurs sont actifs (pas pour carrières en mode véhicules seuls)
  if (workerWasteKgPerDay !== undefined && !noPersonnel && totalWorkers > 0) {
    wasteMixedTPerDay += (totalWorkers * workerWasteKgPerDay) / 1000;
  }

  // Ratio pour les déchets de production : charge travailleurs, ou (carrières sans personnel) ratio basé sur la production véhicules
  const isVehicleQuarryNoPersonnel = noPersonnel && vehicleProductionPerDay !== undefined && buildingCount > 0
    && recipe.workers > 0 && recipe.production > 0 && isMine(recipe) && requiresVehicles(recipe);
  const wasteProductionChargeRatio = isVehicleQuarryNoPersonnel
    ? Math.min(1, vehicleProductionPerDay! / (buildingCount * recipe.production * recipe.workers))
    : actualChargeRatio;

  if (prodWasteMaxTPerDay !== undefined && prodWasteComposition && Object.keys(prodWasteComposition).length > 0) {
    const prodWasteTPerDay = prodWasteMaxTPerDay * wasteProductionChargeRatio * buildingCount;
    const hazardousFraction = prodWasteComposition.hazardous ?? 0;
    const hazardousT = prodWasteTPerDay * hazardousFraction;
    const nonHazardousT = prodWasteTPerDay - hazardousT;
    if (hasHazardousOutput) {
      wasteMixedTPerDay += 0.7 * nonHazardousT;
      wasteToxicTPerDay += 0.3 * nonHazardousT + hazardousT;
    } else {
      wasteMixedTPerDay += prodWasteTPerDay;
    }
  }

  if (wasteMixedTPerDay > 0) {
    outputsPerDay.set('waste_mixed', (outputsPerDay.get('waste_mixed') ?? 0) + wasteMixedTPerDay);
  }
  if (wasteToxicTPerDay > 0) {
    outputsPerDay.set('waste_toxic', (outputsPerDay.get('waste_toxic') ?? 0) + wasteToxicTPerDay);
  }

  // Convertir en par seconde pour l'affichage
  const inputsPerSecond = new Map<string, number>();
  const outputsPerSecond = new Map<string, number>();

  inputsPerDay.forEach((amount, rid) => {
    inputsPerSecond.set(rid, amount / (24 * 60 * 60));
  });

  outputsPerDay.forEach((amount, rid) => {
    outputsPerSecond.set(rid, amount / (24 * 60 * 60));
  });

  // Calculer les travailleurs par bâtiment (mines : 0 personnel, 0 charge)
  const actualWorkersPerBuilding = noPersonnel ? 0 : (workersPerBuilding !== undefined
    ? workersPerBuilding
    : (buildingCount > 0 ? Math.ceil(totalWorkers / buildingCount) : recipe.workers));
  const maxWorkersPerBuilding = noPersonnel ? 0 : recipe.workers;
  const maxProfessorsPerBuilding = noPersonnel ? 0 : recipe.professors;

  // Appliquer le ratio de charge aux cols-blancs (proportionnel à la charge)
  const actualProfessorsPerBuilding = noPersonnel ? 0 : Math.ceil(maxProfessorsPerBuilding * actualChargeRatio);
  // Calculer le total en utilisant le ratio exact pour éviter les erreurs d'arrondi
  const totalProfessorsResult = noPersonnel ? 0 : Math.ceil(maxProfessorsPerBuilding * actualChargeRatio * buildingCount);

  return {
    resourceId,
    resourceName: getResourceName(resourceId),
    buildingName: recipe.name,
    buildingCount,
    inputsPerSecond,
    outputsPerSecond,
    totalWorkers: noPersonnel ? 0 : totalWorkers,
    totalProfessors: totalProfessorsResult,
    workersPerBuilding: actualWorkersPerBuilding,
    maxWorkersPerBuilding,
    professorsPerBuilding: actualProfessorsPerBuilding,
    maxProfessorsPerBuilding,
    chargeRatio: actualChargeRatio,
  };
}
