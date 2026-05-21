import { useState } from 'react';
import { productionCalculator } from '@/lib/productionCalculator';
import type { ProductionGoal } from '@/data/types';

export function createInitialGoal(
  resourceId: string,
  defaultBuildingByResource: Record<string, string>
): ProductionGoal {
  const production = productionCalculator.getProduction(resourceId);
  const recipes = production?.recipes ?? [];
  const defaultName = defaultBuildingByResource[resourceId];
  const buildingName =
    defaultName && recipes.some((r) => r.name === defaultName)
      ? defaultName
      : recipes[0]?.name ?? '';
  return {
    id: crypto.randomUUID(),
    resourceId,
    buildingName,
    inputType: 'buildings',
    value: 1,
  };
}

export function goalsFromPlan(
  planGoals: {
    resourceId: string;
    buildingName: string;
    inputType: 'buildings' | 'output_per_day' | 'output_per_year';
    value: number;
  }[]
): ProductionGoal[] {
  return planGoals.map((g) => {
    const production = productionCalculator.getProduction(g.resourceId);
    const recipes = production?.recipes ?? [];
    const buildingName = recipes.some((r) => r.name === g.buildingName)
      ? g.buildingName
      : recipes[0]?.name ?? g.buildingName;
    return {
      id: crypto.randomUUID(),
      resourceId: g.resourceId,
      buildingName,
      inputType: g.inputType,
      value: Number.isFinite(g.value) && g.value > 0 ? g.value : 1,
    };
  });
}

export interface UseProductionGoalsReturn {
  goals: ProductionGoal[];
  addGoal: (resourceId?: string) => void;
  removeGoal: (id: string) => void;
  updateGoal: (
    id: string,
    patch: Partial<Pick<ProductionGoal, 'resourceId' | 'buildingName' | 'inputType' | 'value'>>
  ) => void;
  setGoalResource: (
    goalId: string,
    resourceId: string,
    buildingByResource?: Record<string, string>
  ) => void;
  setGoals: (goals: ProductionGoal[]) => void;
}

export function useProductionGoals(
  defaultBuildingByResource: Record<string, string>,
  initialGoals?: ProductionGoal[]
): UseProductionGoalsReturn {
  const [goals, setGoals] = useState<ProductionGoal[]>(
    () => initialGoals ?? [createInitialGoal('steel', defaultBuildingByResource)]
  );

  const addGoal = (resourceId?: string) => {
    const allProductions = productionCalculator.getAllProductions();
    const targetId = resourceId ?? allProductions[0]?.resourceId;
    if (!targetId) return;
    setGoals((prev) => [
      ...prev,
      createInitialGoal(targetId, defaultBuildingByResource),
    ]);
  };

  const removeGoal = (goalId: string) => {
    setGoals((prev) => (prev.length > 1 ? prev.filter((g) => g.id !== goalId) : prev));
  };

  const updateGoal = (
    goalId: string,
    updates: Partial<Pick<ProductionGoal, 'resourceId' | 'buildingName' | 'inputType' | 'value'>>
  ) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === goalId ? { ...g, ...updates } : g))
    );
  };

  const setGoalResource = (
    goalId: string,
    resourceId: string,
    buildingByResource: Record<string, string> = {}
  ) => {
    const production = productionCalculator.getProduction(resourceId);
    const recipes = production?.recipes ?? [];
    const defaultName = buildingByResource[resourceId];
    const buildingName =
      defaultName && recipes.some((r) => r.name === defaultName)
        ? defaultName
        : recipes[0]?.name ?? '';
    updateGoal(goalId, { resourceId, buildingName });
  };

  return { goals, addGoal, removeGoal, updateGoal, setGoalResource, setGoals };
}
