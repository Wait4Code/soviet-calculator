import vehiclesData from './vehicles.json';

export interface Vehicle {
  id: string;
  name: string;
  origin: string;
  productionYears: string;
  maxSpeed: string;
  emptyWeight: string;
  enginePower: string;
  length: string;
  /** Skills avec niveau (ex. excavator, bulldozer) */
  skills: Record<string, number>;
  /** Chemin vers l'image (ex. /vehicles/e-10011d.png). Si absent, icône placeholder. */
  image?: string;
}

export function loadVehicles(): Map<string, Vehicle> {
  const vehiclesMap = new Map<string, Vehicle>();
  (vehiclesData.vehicles as Vehicle[]).forEach((vehicle) => {
    vehiclesMap.set(vehicle.id, vehicle);
  });
  return vehiclesMap;
}

export const vehicles = loadVehicles();

/** Map origine (chaîne du JSON) → clé i18n (origins.xxx). Utiliser avec t('origins.' + ORIGIN_TO_KEY[origin]). */
export const ORIGIN_TO_KEY: Record<string, string> = {
  'Union soviétique': 'union_sovietique',
  'Tchécoslovaquie': 'tchecoslovaquie',
  'Roumanie': 'roumanie',
  "Allemagne de l'Est": 'allemagne_est',
  "Allemagne de l'Ouest": 'allemagne_ouest',
  'USA': 'usa',
  'RDA': 'rda',
};

export function getVehicle(vehicleId: string): Vehicle | undefined {
  return vehicles.get(vehicleId);
}

/** Niveau du véhicule pour un skill donné (0 si absent). */
export function getVehicleSkillLevel(vehicle: Vehicle, skill: string): number {
  return vehicle.skills[skill] ?? 0;
}

/** Libellé des skills pour affichage (ex. "excavator 9, bulldozer 9"). */
export function formatVehicleSkills(vehicle: Vehicle): string {
  const entries = Object.entries(vehicle.skills).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([skill, level]) => `${skill} ${level}`).join(', ');
}
