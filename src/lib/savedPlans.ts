/**
 * Sauvegarde locale des calculs (localStorage) avec nom et liste.
 */

import type { PlanStateSerialized } from '@/lib/planUrl';

const STORAGE_KEY = 'soviet-calculator-saved-plans';

export interface SavedPlan {
  id: string;
  name: string;
  createdAt: number;
  planState: PlanStateSerialized;
}

function readFromStorage(): SavedPlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is SavedPlan =>
        p != null &&
        typeof p.id === 'string' &&
        typeof p.name === 'string' &&
        typeof p.createdAt === 'number' &&
        p.planState != null &&
        Array.isArray((p.planState as PlanStateSerialized).g)
    );
  } catch {
    return [];
  }
}

function writeToStorage(plans: SavedPlan[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch {
    // ignore
  }
}

/** Retourne la liste des calculs sauvegardés (ordre de stockage, tri à faire côté UI). */
export function getSavedPlans(): SavedPlan[] {
  return readFromStorage();
}

/** Sauvegarde un nouveau calcul avec un nom. */
export function savePlan(name: string, planState: PlanStateSerialized): SavedPlan {
  const plans = readFromStorage();
  const plan: SavedPlan = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Sans nom',
    createdAt: Date.now(),
    planState,
  };
  plans.push(plan);
  writeToStorage(plans);
  return plan;
}

/** Met à jour le nom ou l'état d'un calcul existant (conserve la date de création). */
export function updatePlan(
  id: string,
  updates: { name?: string; planState?: PlanStateSerialized }
): void {
  const plans = readFromStorage();
  const idx = plans.findIndex((p) => p.id === id);
  if (idx === -1) return;
  if (updates.name !== undefined) plans[idx].name = updates.name.trim() || plans[idx].name;
  if (updates.planState !== undefined) plans[idx].planState = updates.planState;
  writeToStorage(plans);
}

/** Supprime un calcul sauvegardé. */
export function deletePlan(id: string): void {
  writeToStorage(readFromStorage().filter((p) => p.id !== id));
}

/** Récupère l'état d'un calcul par id. */
export function getPlanState(id: string): PlanStateSerialized | null {
  const plan = readFromStorage().find((p) => p.id === id);
  return plan?.planState ?? null;
}
