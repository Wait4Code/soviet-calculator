# ProductionCalculator Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Décomposer `ProductionCalculator.tsx` (1972 lignes) en hooks testables + composants purs + orchestrateur mince (~80 lignes) sans aucun changement de comportement visible.

**Architecture:** 5 custom hooks encapsulent toute la logique d'état et de calcul. Les composants sont des fonctions pures (props in, callbacks out) sans accès au store. `ProductionCalculator.tsx` devient un orchestrateur qui câble les hooks aux composants.

**Tech Stack:** React 18, TypeScript strict, Vitest 4, @testing-library/react (à installer), Zustand, Vite 6

**Spec:** `docs/superpowers/specs/2026-05-20-production-calculator-refactor-design.md`

---

## Fichiers créés / modifiés

### Nouveaux fichiers
```
src/data/types.ts                              (modifié : ajoute ProductionGoal)
src/hooks/useProductionGoals.ts
src/hooks/useProductionGoals.test.ts
src/hooks/useChainSettings.ts
src/hooks/useChainSettings.test.ts
src/hooks/useSavedPlans.ts
src/hooks/useSavedPlans.test.ts
src/hooks/useUrlSync.ts
src/hooks/useUrlSync.test.ts
src/hooks/useCalculationChain.ts
src/hooks/useCalculationChain.test.ts
src/__fixtures__/productionResults.ts
src/components/GoalList/GoalList.tsx
src/components/GoalList/GoalItem.tsx
src/components/GoalList/GoalList.test.tsx
src/components/PlansPanel/PlansPanel.tsx
src/components/PlansPanel/PlansPanel.test.tsx
src/components/ResultSection/ChainTable.tsx
src/components/ResultSection/PollutionTable.tsx
src/components/ResultSection/ResultSection.tsx
src/components/ResultSection/ResultSection.test.tsx
```

### Fichiers modifiés
```
vite.config.ts                                 (environment node → jsdom)
src/data/types.ts                              (+ ProductionGoal interface)
src/components/ProductionCalculator.tsx        (remplacé par l'orchestrateur)
```

---

## Task 0: Installer @testing-library/react et passer l'environnement de test en jsdom

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1 : Installer les dépendances de test**

```bash
npm install -D @testing-library/react @testing-library/user-event jsdom
```

Expected output: `added N packages`

- [ ] **Step 2 : Modifier `vite.config.ts` pour utiliser jsdom**

Fichier actuel (`vite.config.ts`) :
```ts
test: {
  globals: true,
  environment: 'node',
  include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
},
```

Remplacer `environment: 'node'` par `environment: 'jsdom'` :
```ts
test: {
  globals: true,
  environment: 'jsdom',
  include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
},
```

- [ ] **Step 3 : Vérifier que les tests existants passent encore**

```bash
npm test
```

Expected: `2 passed (25)`

- [ ] **Step 4 : Commit**

```bash
git add vite.config.ts package.json package-lock.json
git commit -m "chore(test): add @testing-library/react and switch to jsdom environment"
```

---

## Task 1: Déplacer `ProductionGoal` dans `src/data/types.ts`

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/components/ProductionCalculator.tsx`

`ProductionGoal` est actuellement défini à la ligne 21 de `ProductionCalculator.tsx`. Le déplacer dans `types.ts` le rend importable par les hooks sans créer de dépendance circulaire.

- [ ] **Step 1 : Ajouter `ProductionGoal` à la fin de `src/data/types.ts`**

Ajouter après la dernière interface (`ProductionResult`) :

```ts
/**
 * Un objectif de production défini par l'utilisateur
 */
export interface ProductionGoal {
  id: string;
  resourceId: string;
  buildingName: string;
  inputType: 'buildings' | 'output_per_day' | 'output_per_year';
  value: number;
}
```

- [ ] **Step 2 : Dans `src/components/ProductionCalculator.tsx`, remplacer la définition locale par un import**

Supprimer les lignes 21-27 (la définition de `ProductionGoal`) :
```tsx
export interface ProductionGoal {
  id: string;
  resourceId: string;
  buildingName: string;
  inputType: 'buildings' | 'output_per_day' | 'output_per_year';
  value: number;
}
```

Ajouter `ProductionGoal` dans l'import existant de `@/data/types` (ligne 5) :
```tsx
import { ProductionResult, ProductionGoal } from '@/data/types';
```

- [ ] **Step 3 : Vérifier que les tests passent**

```bash
npm test
```

Expected: `2 passed (25)`

- [ ] **Step 4 : Commit**

```bash
git add src/data/types.ts src/components/ProductionCalculator.tsx
git commit -m "refactor(types): move ProductionGoal interface to data/types.ts"
```

---

## Task 2: Créer les fixtures de test partagées

**Files:**
- Create: `src/__fixtures__/productionResults.ts`

Ces fixtures sont utilisées par les tests des hooks et des composants. Elles représentent des `ProductionResult[]` réalistes pour les tests.

- [ ] **Step 1 : Créer `src/__fixtures__/productionResults.ts`**

```ts
import type { ProductionResult } from '@/data/types';
import type { ProductionGoal } from '@/data/types';

/**
 * Une chaîne acier simple : aciérie + mines charbon + mines fer + usines de traitement.
 * Extrait des valeurs réelles du calculateur (1 aciérie steel_mill_v2).
 */
export const STEEL_CHAIN_RESULTS: ProductionResult[] = [
  {
    resourceId: 'steel',
    resourceName: 'Acier',
    buildingName: 'steel_mill_v2',
    buildingCount: 1,
    inputsPerSecond: new Map([
      ['coal', 0.00875],
      ['iron', 0.00694],
    ]),
    outputsPerSecond: new Map([['steel', 0.000497]]),
    totalWorkers: 200,
    totalProfesors: 0,
    workersPerBuilding: 200,
    maxWorkersPerBuilding: 200,
    profesorsPerBuilding: 0,
    maxProfesorsPerBuilding: 0,
    chargeRatio: 1.0,
  },
  {
    resourceId: 'coal',
    resourceName: 'Charbon',
    buildingName: 'coal_processing',
    buildingCount: 2,
    inputsPerSecond: new Map([['rawcoal', 0.01667]]),
    outputsPerSecond: new Map([['coal', 0.00875]]),
    totalWorkers: 60,
    totalProfesors: 0,
    workersPerBuilding: 30,
    maxWorkersPerBuilding: 30,
    profesorsPerBuilding: 0,
    maxProfesorsPerBuilding: 0,
    chargeRatio: 0.729,
  },
  {
    resourceId: 'iron',
    resourceName: 'Fer',
    buildingName: 'iron_processing',
    buildingCount: 2,
    inputsPerSecond: new Map([['rawiron', 0.01389]]),
    outputsPerSecond: new Map([['iron', 0.00694]]),
    totalWorkers: 30,
    totalProfesors: 0,
    workersPerBuilding: 15,
    maxWorkersPerBuilding: 15,
    profesorsPerBuilding: 0,
    maxProfesorsPerBuilding: 0,
    chargeRatio: 0.926,
  },
];

export const STEEL_GOAL: ProductionGoal = {
  id: 'test-goal-1',
  resourceId: 'steel',
  buildingName: 'steel_mill_v2',
  inputType: 'buildings',
  value: 1,
};

export const SAVED_PLAN_STATE = {
  v: 1,
  g: [{ resourceId: 'steel', buildingName: 'steel_mill_v2', inputType: 'buildings' as const, value: 1 }],
  y: 1960,
};
```

- [ ] **Step 2 : Vérifier que le fichier compile (pas de test à ce stade)**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: pas d'erreur sur `src/__fixtures__/productionResults.ts`

- [ ] **Step 3 : Commit**

```bash
git add src/__fixtures__/productionResults.ts
git commit -m "test: add shared production result fixtures"
```

---

## Task 3: Extraire `useProductionGoals`

**Files:**
- Create: `src/hooks/useProductionGoals.ts`
- Create: `src/hooks/useProductionGoals.test.ts`

Ce hook encapsule la liste des objectifs de production : ajout, suppression, modification, et chargement depuis un plan. Il extrait la logique des lignes 61-90 et 162-192 de `ProductionCalculator.tsx`.

- [ ] **Step 1 : Écrire le test en premier (`src/hooks/useProductionGoals.test.ts`)**

```ts
import { renderHook, act } from '@testing-library/react';
import { useProductionGoals, goalsFromPlan, createInitialGoal } from './useProductionGoals';

describe('createInitialGoal', () => {
  it('crée un objectif steel avec buildingName valide', () => {
    const goal = createInitialGoal('steel', {});
    expect(goal.resourceId).toBe('steel');
    expect(goal.buildingName).toBeTruthy();
    expect(goal.inputType).toBe('buildings');
    expect(goal.value).toBe(1);
    expect(goal.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('utilise le bâtiment par défaut si fourni et valide', () => {
    const goal = createInitialGoal('steel', { steel: 'steel_mill_v2' });
    expect(goal.buildingName).toBe('steel_mill_v2');
  });
});

describe('goalsFromPlan', () => {
  it('convertit les goals de plan en ProductionGoal avec UUID frais', () => {
    const goals = goalsFromPlan([
      { resourceId: 'steel', buildingName: 'steel_mill_v2', inputType: 'buildings', value: 1 },
    ]);
    expect(goals).toHaveLength(1);
    expect(goals[0].resourceId).toBe('steel');
    expect(goals[0].buildingName).toBe('steel_mill_v2');
    expect(goals[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('force value à 1 si la valeur est invalide (négatif)', () => {
    const goals = goalsFromPlan([
      { resourceId: 'steel', buildingName: 'steel_mill_v2', inputType: 'buildings', value: -5 },
    ]);
    expect(goals[0].value).toBe(1);
  });

  it('force value à 1 si la valeur est NaN', () => {
    const goals = goalsFromPlan([
      { resourceId: 'steel', buildingName: 'steel_mill_v2', inputType: 'buildings', value: NaN },
    ]);
    expect(goals[0].value).toBe(1);
  });
});

describe('useProductionGoals', () => {
  it('initialise avec un objectif steel par défaut', () => {
    const { result } = renderHook(() => useProductionGoals({}));
    expect(result.current.goals).toHaveLength(1);
    expect(result.current.goals[0].resourceId).toBe('steel');
  });

  it('addGoal avec resourceId ajoute un objectif', () => {
    const { result } = renderHook(() => useProductionGoals({}));
    act(() => { result.current.addGoal('coal'); });
    expect(result.current.goals).toHaveLength(2);
    expect(result.current.goals[1].resourceId).toBe('coal');
  });

  it('removeGoal ne supprime pas le dernier objectif', () => {
    const { result } = renderHook(() => useProductionGoals({}));
    const id = result.current.goals[0].id;
    act(() => { result.current.removeGoal(id); });
    expect(result.current.goals).toHaveLength(1);
  });

  it('removeGoal supprime un objectif quand il en reste plusieurs', () => {
    const { result } = renderHook(() => useProductionGoals({}));
    act(() => { result.current.addGoal('coal'); });
    const firstId = result.current.goals[0].id;
    act(() => { result.current.removeGoal(firstId); });
    expect(result.current.goals).toHaveLength(1);
    expect(result.current.goals[0].resourceId).toBe('coal');
  });

  it('updateGoal met à jour un champ', () => {
    const { result } = renderHook(() => useProductionGoals({}));
    const id = result.current.goals[0].id;
    act(() => { result.current.updateGoal(id, { value: 5 }); });
    expect(result.current.goals[0].value).toBe(5);
  });

  it('setGoals remplace toute la liste', () => {
    const { result } = renderHook(() => useProductionGoals({}));
    const newGoals = goalsFromPlan([
      { resourceId: 'coal', buildingName: 'coal_mine', inputType: 'buildings', value: 3 },
    ]);
    act(() => { result.current.setGoals(newGoals); });
    expect(result.current.goals).toHaveLength(1);
    expect(result.current.goals[0].resourceId).toBe('coal');
    expect(result.current.goals[0].value).toBe(3);
  });

  it('setGoalResource met à jour resourceId et buildingName', () => {
    const { result } = renderHook(() => useProductionGoals({}));
    const id = result.current.goals[0].id;
    act(() => { result.current.setGoalResource(id, 'coal', {}); });
    expect(result.current.goals[0].resourceId).toBe('coal');
    expect(result.current.goals[0].buildingName).toBeTruthy();
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
npx vitest run src/hooks/useProductionGoals.test.ts
```

Expected: FAIL — `Cannot find module './useProductionGoals'`

- [ ] **Step 3 : Créer `src/hooks/useProductionGoals.ts`**

```ts
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
    const targetId = resourceId ?? [...allProductions][0]?.resourceId;
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
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
npx vitest run src/hooks/useProductionGoals.test.ts
```

Expected: `11 passed`

- [ ] **Step 5 : Vérifier que tous les tests passent**

```bash
npm test
```

Expected: `3 passed (36)`

- [ ] **Step 6 : Commit**

```bash
git add src/hooks/useProductionGoals.ts src/hooks/useProductionGoals.test.ts
git commit -m "feat(hooks): extract useProductionGoals with tests"
```

---

## Task 4: Extraire `useChainSettings`

**Files:**
- Create: `src/hooks/useChainSettings.ts`
- Create: `src/hooks/useChainSettings.test.ts`

Ce hook encapsule tous les overrides par chaîne : ressources désactivées, qualité source, bâtiment par ressource, véhicules, taux de charge, et année. Il extrait la logique des lignes 119-136, 904-955 de `ProductionCalculator.tsx`.

- [ ] **Step 1 : Écrire le test en premier (`src/hooks/useChainSettings.test.ts`)**

```ts
import { renderHook, act } from '@testing-library/react';
import { useChainSettings, settingsFromPlan } from './useChainSettings';
import type { ProductionResult } from '@/data/types';

const EMPTY_CHAIN: ProductionResult[] = [];

describe('settingsFromPlan', () => {
  it('extrait les settings depuis un plan sérialisé', () => {
    const settings = settingsFromPlan({
      g: [],
      y: 1975,
      sq: 60,
      sqr: { rawcoal: 70 },
      br: { steel: 'steel_mill_v2' },
      cr: { steel: 0.8 },
      d: ['coal'],
    });
    expect(settings.chainYear).toBe(1975);
    expect(settings.sourceQualityFromPlan).toBe(60);
    expect(settings.sourceQualityByResource).toEqual({ rawcoal: 70 });
    expect(settings.buildingByResource).toEqual({ steel: 'steel_mill_v2' });
    expect(settings.chargeRatioByResource).toEqual({ steel: 0.8 });
    expect(settings.disabledResources).toEqual(new Set(['coal']));
  });

  it('retourne des valeurs par défaut si le plan est minimal', () => {
    const settings = settingsFromPlan({ g: [], y: 1960 });
    expect(settings.chainYear).toBe(1960);
    expect(settings.sourceQualityFromPlan).toBeNull();
    expect(settings.disabledResources.size).toBe(0);
  });
});

describe('useChainSettings', () => {
  it('initialise avec les valeurs par défaut', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    expect(result.current.chainYear).toBe(1960);
    expect(result.current.disabledResources.size).toBe(0);
    expect(result.current.sourceQualityFromPlan).toBeNull();
    expect(result.current.sourceQualityByResource).toEqual({});
    expect(result.current.buildingByResource).toEqual({});
    expect(result.current.vehicleConfigByResource).toEqual({});
    expect(result.current.chargeRatioByResource).toEqual({});
  });

  it('setChainYear met à jour l\'année', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.setChainYear(1980); });
    expect(result.current.chainYear).toBe(1980);
  });

  it('setSourceQuality met à jour la qualité d\'une ressource', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.setSourceQuality('rawcoal', 75); });
    expect(result.current.sourceQualityByResource.rawcoal).toBe(75);
  });

  it('setSourceQuality clamp entre 0 et 100', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.setSourceQuality('rawcoal', 150); });
    expect(result.current.sourceQualityByResource.rawcoal).toBe(100);
    act(() => { result.current.setSourceQuality('rawcoal', -10); });
    expect(result.current.sourceQualityByResource.rawcoal).toBe(0);
  });

  it('setBuilding met à jour le bâtiment d\'une ressource', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.setBuilding('steel', 'steel_mill_v2'); });
    expect(result.current.buildingByResource.steel).toBe('steel_mill_v2');
  });

  it('setChargeRatio met à jour le ratio', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.setChargeRatio('steel', 0.75); });
    expect(result.current.chargeRatioByResource.steel).toBe(0.75);
  });

  it('toggleResource désactive une ressource', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.toggleResource('coal', EMPTY_CHAIN); });
    expect(result.current.disabledResources.has('coal')).toBe(true);
  });

  it('toggleResource réactive une ressource désactivée', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.toggleResource('coal', EMPTY_CHAIN); });
    act(() => { result.current.toggleResource('coal', EMPTY_CHAIN); });
    expect(result.current.disabledResources.has('coal')).toBe(false);
  });

  it('loadSettings remplace l\'état courant', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => {
      result.current.loadSettings({
        chainYear: 1985,
        sourceQualityFromPlan: 80,
        sourceQualityByResource: { rawcoal: 65 },
        buildingByResource: {},
        vehicleConfigByResource: {},
        chargeRatioByResource: {},
        disabledResources: new Set(['coal']),
      });
    });
    expect(result.current.chainYear).toBe(1985);
    expect(result.current.sourceQualityFromPlan).toBe(80);
    expect(result.current.disabledResources.has('coal')).toBe(true);
  });

  it('resetSettings remet à zéro', () => {
    const { result } = renderHook(() => useChainSettings(1960));
    act(() => { result.current.setChainYear(1985); });
    act(() => { result.current.resetSettings(1960); });
    expect(result.current.chainYear).toBe(1960);
    expect(result.current.disabledResources.size).toBe(0);
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

```bash
npx vitest run src/hooks/useChainSettings.test.ts
```

Expected: FAIL — `Cannot find module './useChainSettings'`

- [ ] **Step 3 : Créer `src/hooks/useChainSettings.ts`**

```ts
import { useState } from 'react';
import { productionCalculator } from '@/lib/productionCalculator';
import type { ProductionResult } from '@/data/types';
import type { MineVehicleConfig } from '@/lib/productionCalculator';
import type { PlanStateSerialized } from '@/lib/planUrl';

export interface ChainSettingsState {
  disabledResources: Set<string>;
  chainYear: number;
  sourceQualityFromPlan: number | null;
  sourceQualityByResource: Record<string, number>;
  buildingByResource: Record<string, string>;
  vehicleConfigByResource: Record<string, MineVehicleConfig>;
  chargeRatioByResource: Record<string, number>;
}

export interface UseChainSettingsReturn extends ChainSettingsState {
  toggleResource: (id: string, fullChainResults: ProductionResult[]) => void;
  setSourceQuality: (id: string, q: number) => void;
  setBuilding: (id: string, buildingName: string) => void;
  setVehicleConfig: (id: string, cfg: MineVehicleConfig) => void;
  setChargeRatio: (id: string, ratio: number) => void;
  setChainYear: (year: number) => void;
  loadSettings: (state: ChainSettingsState) => void;
  resetSettings: (defaultYear?: number) => void;
}

export function settingsFromPlan(plan: PlanStateSerialized): ChainSettingsState {
  const vc: Record<string, MineVehicleConfig> = {};
  if (plan.vc && typeof plan.vc === 'object') {
    for (const [rid, v] of Object.entries(plan.vc)) {
      if (v && Array.isArray(v.vehicleSlots) && typeof v.allowPersonnel === 'boolean') {
        vc[rid] = { vehicleSlots: v.vehicleSlots, allowPersonnel: v.allowPersonnel };
      }
    }
  }
  return {
    disabledResources: new Set(plan.d ?? []),
    chainYear: plan.y ?? 1960,
    sourceQualityFromPlan: plan.sq ?? null,
    sourceQualityByResource: plan.sqr ?? {},
    buildingByResource: plan.br ?? {},
    vehicleConfigByResource: vc,
    chargeRatioByResource: plan.cr ?? {},
  };
}

export function useChainSettings(defaultYear: number): UseChainSettingsReturn {
  const [disabledResources, setDisabledResources] = useState<Set<string>>(new Set());
  const [manuallyDisabledResources, setManuallyDisabledResources] = useState<Set<string>>(new Set());
  const [initialDisabledResources] = useState<Set<string>>(new Set());
  const [chainYear, setChainYear] = useState<number>(defaultYear);
  const [sourceQualityFromPlan, setSourceQualityFromPlan] = useState<number | null>(null);
  const [sourceQualityByResource, setSourceQualityByResource] = useState<Record<string, number>>({});
  const [buildingByResource, setBuildingByResource] = useState<Record<string, string>>({});
  const [vehicleConfigByResource, setVehicleConfigByResource] = useState<Record<string, MineVehicleConfig>>({});
  const [chargeRatioByResource, setChargeRatioByResource] = useState<Record<string, number>>({});

  const toggleResource = (resourceId: string, fullChainResults: ProductionResult[]) => {
    if (!productionCalculator.canDisableResource(resourceId)) return;

    const newDisabled = new Set(disabledResources);
    const newManuallyDisabled = new Set(manuallyDisabledResources);
    const wasDisabled = newDisabled.has(resourceId);

    if (wasDisabled) {
      newDisabled.delete(resourceId);
      newManuallyDisabled.delete(resourceId);
      const dependentResources = productionCalculator.findDependentResources(
        new Set([resourceId]),
        fullChainResults
      );
      newDisabled.forEach((disabledResourceId) => {
        if (dependentResources.has(disabledResourceId)) {
          const wasManuallyDisabled = newManuallyDisabled.has(disabledResourceId);
          const wasInitiallyDisabled = initialDisabledResources.has(disabledResourceId);
          if (!wasManuallyDisabled && !wasInitiallyDisabled) {
            newDisabled.delete(disabledResourceId);
            newManuallyDisabled.delete(disabledResourceId);
          }
        }
      });
    } else {
      newDisabled.add(resourceId);
      newManuallyDisabled.add(resourceId);
      const dependentResources = productionCalculator.findDependentResources(
        new Set([resourceId]),
        fullChainResults
      );
      dependentResources.forEach((depId) => {
        if (productionCalculator.canDisableResource(depId)) {
          newDisabled.add(depId);
        }
      });
    }

    setDisabledResources(newDisabled);
    setManuallyDisabledResources(newManuallyDisabled);
  };

  const setSourceQuality = (id: string, q: number) => {
    setSourceQualityByResource((prev) => ({
      ...prev,
      [id]: Math.max(0, Math.min(100, q)),
    }));
  };

  const setBuilding = (id: string, buildingName: string) => {
    setBuildingByResource((prev) => ({ ...prev, [id]: buildingName }));
  };

  const setVehicleConfig = (id: string, cfg: MineVehicleConfig) => {
    setVehicleConfigByResource((prev) => ({ ...prev, [id]: cfg }));
  };

  const setChargeRatio = (id: string, ratio: number) => {
    setChargeRatioByResource((prev) => ({ ...prev, [id]: ratio }));
  };

  const loadSettings = (state: ChainSettingsState) => {
    setDisabledResources(new Set(state.disabledResources));
    setManuallyDisabledResources(new Set());
    setChainYear(state.chainYear);
    setSourceQualityFromPlan(state.sourceQualityFromPlan);
    setSourceQualityByResource({ ...state.sourceQualityByResource });
    setBuildingByResource({ ...state.buildingByResource });
    setVehicleConfigByResource({ ...state.vehicleConfigByResource });
    setChargeRatioByResource({ ...state.chargeRatioByResource });
  };

  const resetSettings = (year?: number) => {
    setDisabledResources(new Set());
    setManuallyDisabledResources(new Set());
    setChainYear(year ?? defaultYear);
    setSourceQualityFromPlan(null);
    setSourceQualityByResource({});
    setBuildingByResource({});
    setVehicleConfigByResource({});
    setChargeRatioByResource({});
  };

  return {
    disabledResources,
    chainYear,
    sourceQualityFromPlan,
    sourceQualityByResource,
    buildingByResource,
    vehicleConfigByResource,
    chargeRatioByResource,
    toggleResource,
    setSourceQuality,
    setBuilding,
    setVehicleConfig,
    setChargeRatio,
    setChainYear,
    loadSettings,
    resetSettings,
  };
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
npx vitest run src/hooks/useChainSettings.test.ts
```

Expected: `14 passed`

- [ ] **Step 5 : Vérifier tous les tests**

```bash
npm test
```

Expected: `4 passed`

- [ ] **Step 6 : Commit**

```bash
git add src/hooks/useChainSettings.ts src/hooks/useChainSettings.test.ts
git commit -m "feat(hooks): extract useChainSettings with tests"
```

---

## Task 5: Extraire `useSavedPlans`

**Files:**
- Create: `src/hooks/useSavedPlans.ts`
- Create: `src/hooks/useSavedPlans.test.ts`

Ce hook encapsule le CRUD des plans sauvegardés (localStorage) et la sauvegarde automatique. Il extrait la logique des lignes 92-99, 295-399 de `ProductionCalculator.tsx`.

- [ ] **Step 1 : Écrire le test en premier (`src/hooks/useSavedPlans.test.ts`)**

```ts
import { renderHook, act } from '@testing-library/react';
import { useSavedPlans } from './useSavedPlans';
import { SAVED_PLAN_STATE } from '@/__fixtures__/productionResults';

// Nettoyer le localStorage entre les tests
beforeEach(() => {
  localStorage.clear();
});

describe('useSavedPlans', () => {
  it('initialise avec une liste vide', () => {
    const { result } = renderHook(() => useSavedPlans('fr'));
    expect(result.current.savedPlansList).toHaveLength(0);
    expect(result.current.currentPlanId).toBeNull();
  });

  it('saveCurrentPlan ajoute un plan et le définit comme courant', () => {
    const { result } = renderHook(() => useSavedPlans('fr'));
    act(() => {
      result.current.saveCurrentPlan('Mon plan', SAVED_PLAN_STATE);
    });
    expect(result.current.savedPlansList).toHaveLength(1);
    expect(result.current.savedPlansList[0].name).toBe('Mon plan');
    expect(result.current.currentPlanId).toBe(result.current.savedPlansList[0].id);
  });

  it('loadPlan retourne l\'état du plan et le définit comme courant', () => {
    const { result } = renderHook(() => useSavedPlans('fr'));
    let planId = '';
    act(() => {
      result.current.saveCurrentPlan('Test', SAVED_PLAN_STATE);
      planId = result.current.savedPlansList[0]?.id ?? '';
    });
    let loaded = null;
    act(() => {
      loaded = result.current.loadPlan(planId);
    });
    expect(loaded).not.toBeNull();
    expect(result.current.currentPlanId).toBe(planId);
  });

  it('loadPlan retourne null pour un id inexistant', () => {
    const { result } = renderHook(() => useSavedPlans('fr'));
    let loaded = null;
    act(() => {
      loaded = result.current.loadPlan('non-existent-id');
    });
    expect(loaded).toBeNull();
  });

  it('deletePlan supprime le plan et efface currentPlanId si c\'était le courant', () => {
    const { result } = renderHook(() => useSavedPlans('fr'));
    let planId = '';
    act(() => {
      result.current.saveCurrentPlan('À supprimer', SAVED_PLAN_STATE);
      planId = result.current.savedPlansList[0]?.id ?? '';
    });
    act(() => { result.current.deletePlan(planId); });
    expect(result.current.savedPlansList).toHaveLength(0);
    expect(result.current.currentPlanId).toBeNull();
  });

  it('renamePlan met à jour le nom du plan', () => {
    const { result } = renderHook(() => useSavedPlans('fr'));
    let planId = '';
    act(() => {
      result.current.saveCurrentPlan('Ancien nom', SAVED_PLAN_STATE);
      planId = result.current.savedPlansList[0]?.id ?? '';
    });
    act(() => { result.current.renamePlan(planId, 'Nouveau nom'); });
    expect(result.current.savedPlansList[0].name).toBe('Nouveau nom');
  });

  it('duplicatePlan crée une copie et la définit comme courante', () => {
    const { result } = renderHook(() => useSavedPlans('fr'));
    let planId = '';
    act(() => {
      result.current.saveCurrentPlan('Original', SAVED_PLAN_STATE);
      planId = result.current.savedPlansList[0]?.id ?? '';
    });
    act(() => { result.current.duplicatePlan(planId, (name) => `Copie de ${name}`); });
    expect(result.current.savedPlansList).toHaveLength(2);
    expect(result.current.savedPlansList[1].name).toBe('Copie de Original');
    expect(result.current.currentPlanId).toBe(result.current.savedPlansList[1].id);
  });

  it('autosave met à jour l\'état du plan courant après un délai', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSavedPlans('fr'));
    act(() => {
      result.current.saveCurrentPlan('Autosave', SAVED_PLAN_STATE);
    });
    const updatedState = { ...SAVED_PLAN_STATE, y: 1985 };
    act(() => { result.current.autosave(updatedState); });
    act(() => { vi.advanceTimersByTime(700); });
    const planId = result.current.currentPlanId;
    const loaded = planId ? result.current.loadPlan(planId) : null;
    expect(loaded?.y).toBe(1985);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

```bash
npx vitest run src/hooks/useSavedPlans.test.ts
```

Expected: FAIL — `Cannot find module './useSavedPlans'`

- [ ] **Step 3 : Créer `src/hooks/useSavedPlans.ts`**

```ts
import { useState, useRef } from 'react';
import {
  getSavedPlans,
  savePlan,
  updatePlan,
  deletePlan as deletePlanLib,
  getPlanState,
  type SavedPlan,
} from '@/lib/savedPlans';
import type { PlanStateSerialized } from '@/lib/planUrl';

export interface UseSavedPlansReturn {
  savedPlansList: SavedPlan[];
  currentPlanId: string | null;
  saveCurrentPlan: (name: string, planState: PlanStateSerialized) => void;
  loadPlan: (id: string) => PlanStateSerialized | null;
  deletePlan: (id: string) => void;
  renamePlan: (id: string, name: string) => void;
  duplicatePlan: (id: string, copyName: (name: string) => string) => PlanStateSerialized | null;
  handleNewPlan: (defaultState: PlanStateSerialized, generateName: (state: PlanStateSerialized) => string) => PlanStateSerialized;
  autosave: (planState: PlanStateSerialized) => void;
  setCurrentPlanId: (id: string | null) => void;
}

export function useSavedPlans(_locale: string): UseSavedPlansReturn {
  const [savedPlansList, setSavedPlansList] = useState<SavedPlan[]>(() => getSavedPlans());
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = () => setSavedPlansList(getSavedPlans());

  const saveCurrentPlan = (name: string, planState: PlanStateSerialized) => {
    const plan = savePlan(name, planState);
    setCurrentPlanId(plan.id);
    refresh();
  };

  const loadPlan = (id: string): PlanStateSerialized | null => {
    const state = getPlanState(id);
    if (state) setCurrentPlanId(id);
    return state;
  };

  const deletePlan = (id: string) => {
    deletePlanLib(id);
    if (id === currentPlanId) setCurrentPlanId(null);
    refresh();
  };

  const renamePlan = (id: string, name: string) => {
    updatePlan(id, { name });
    refresh();
  };

  const duplicatePlan = (id: string, copyName: (name: string) => string): PlanStateSerialized | null => {
    const plan = savedPlansList.find((p) => p.id === id);
    if (!plan) return null;
    const newPlan = savePlan(copyName(plan.name), plan.planState);
    setCurrentPlanId(newPlan.id);
    refresh();
    return plan.planState;
  };

  const handleNewPlan = (
    defaultState: PlanStateSerialized,
    generateName: (state: PlanStateSerialized) => string
  ): PlanStateSerialized => {
    const plan = savePlan(generateName(defaultState), defaultState);
    setCurrentPlanId(plan.id);
    refresh();
    return defaultState;
  };

  const autosave = (planState: PlanStateSerialized) => {
    if (!currentPlanId) return;
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    autosaveTimeoutRef.current = setTimeout(() => {
      autosaveTimeoutRef.current = null;
      updatePlan(currentPlanId, { planState });
      refresh();
    }, 600);
  };

  return {
    savedPlansList,
    currentPlanId,
    saveCurrentPlan,
    loadPlan,
    deletePlan,
    renamePlan,
    duplicatePlan,
    handleNewPlan,
    autosave,
    setCurrentPlanId,
  };
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
npx vitest run src/hooks/useSavedPlans.test.ts
```

Expected: `9 passed`

- [ ] **Step 5 : Vérifier tous les tests**

```bash
npm test
```

Expected: `5 passed`

- [ ] **Step 6 : Commit**

```bash
git add src/hooks/useSavedPlans.ts src/hooks/useSavedPlans.test.ts
git commit -m "feat(hooks): extract useSavedPlans with tests"
```

---

## Task 6: Extraire `useUrlSync`

**Files:**
- Create: `src/hooks/useUrlSync.ts`
- Create: `src/hooks/useUrlSync.test.ts`

Ce hook lit l'état depuis l'URL au montage (une seule fois via ref) et écrit dans l'URL de manière debouncée quand l'état change. Il extrait la logique des lignes 109-111, 259-269 de `ProductionCalculator.tsx`.

- [ ] **Step 1 : Écrire le test en premier (`src/hooks/useUrlSync.test.ts`)**

```ts
import { renderHook, act } from '@testing-library/react';
import { useUrlSync } from './useUrlSync';
import { encodePlanState } from '@/lib/planUrl';
import { SAVED_PLAN_STATE } from '@/__fixtures__/productionResults';

describe('useUrlSync', () => {
  beforeEach(() => {
    // Réinitialiser l'URL avant chaque test
    window.history.replaceState(null, '', '/');
  });

  it('retourne null si l\'URL ne contient pas de plan', () => {
    const { result } = renderHook(() => useUrlSync(null));
    expect(result.current.initialPlanState).toBeNull();
  });

  it('lit l\'état initial depuis l\'URL si présent', () => {
    const encoded = encodePlanState(SAVED_PLAN_STATE);
    window.history.replaceState(null, '', `/?plan=${encoded}`);
    const { result } = renderHook(() => useUrlSync(null));
    expect(result.current.initialPlanState).not.toBeNull();
    expect(result.current.initialPlanState?.g).toHaveLength(1);
    expect(result.current.initialPlanState?.g[0].resourceId).toBe('steel');
  });

  it('l\'initialPlanState ne change pas au re-render', () => {
    const encoded = encodePlanState(SAVED_PLAN_STATE);
    window.history.replaceState(null, '', `/?plan=${encoded}`);
    const { result, rerender } = renderHook(() => useUrlSync(null));
    const first = result.current.initialPlanState;
    rerender();
    expect(result.current.initialPlanState).toBe(first);
  });

  it('écrit dans l\'URL après un délai quand l\'état change', async () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(
      ({ state }) => useUrlSync(state),
      { initialProps: { state: null as typeof SAVED_PLAN_STATE | null } }
    );
    rerender({ state: SAVED_PLAN_STATE });
    expect(new URLSearchParams(window.location.search).has('plan')).toBe(false);
    act(() => { vi.advanceTimersByTime(700); });
    expect(new URLSearchParams(window.location.search).has('plan')).toBe(true);
    vi.useRealTimers();
  });

  it('efface l\'URL si l\'état est null', async () => {
    vi.useFakeTimers();
    const encoded = encodePlanState(SAVED_PLAN_STATE);
    window.history.replaceState(null, '', `/?plan=${encoded}`);
    renderHook(({ state }) => useUrlSync(state), { initialProps: { state: null as typeof SAVED_PLAN_STATE | null } });
    act(() => { vi.advanceTimersByTime(700); });
    expect(new URLSearchParams(window.location.search).has('plan')).toBe(false);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

```bash
npx vitest run src/hooks/useUrlSync.test.ts
```

Expected: FAIL — `Cannot find module './useUrlSync'`

- [ ] **Step 3 : Créer `src/hooks/useUrlSync.ts`**

```ts
import { useRef, useEffect } from 'react';
import { getPlanStateFromUrl, setPlanStateInUrl, type PlanStateSerialized } from '@/lib/planUrl';

export function useUrlSync(
  currentPlanState: PlanStateSerialized | null
): { initialPlanState: PlanStateSerialized | null } {
  // Lire l'URL une seule fois au montage (ref stable)
  const initialPlanStateRef = useRef<PlanStateSerialized | null | undefined>(undefined);
  if (initialPlanStateRef.current === undefined) {
    initialPlanStateRef.current = getPlanStateFromUrl();
  }

  // Écrire dans l'URL de manière debouncée
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setPlanStateInUrl(currentPlanState);
    }, 600);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [currentPlanState]);

  return { initialPlanState: initialPlanStateRef.current };
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
npx vitest run src/hooks/useUrlSync.test.ts
```

Expected: `5 passed`

- [ ] **Step 5 : Vérifier tous les tests**

```bash
npm test
```

Expected: `6 passed`

- [ ] **Step 6 : Commit**

```bash
git add src/hooks/useUrlSync.ts src/hooks/useUrlSync.test.ts
git commit -m "feat(hooks): extract useUrlSync with tests"
```

---

## Task 7: Extraire `useCalculationChain`

**Files:**
- Create: `src/hooks/useCalculationChain.ts`
- Create: `src/hooks/useCalculationChain.test.ts`

Ce hook encapsule tout le calcul de la chaîne de production. Il extrait les deux grands `useMemo` des lignes 203-227 (`fullChainResults`), 402-752 (`resultsWithMeta`), et 804-898 (`wasteTableData`) de `ProductionCalculator.tsx`.

- [ ] **Step 1 : Écrire le test en premier (`src/hooks/useCalculationChain.test.ts`)**

```ts
import { renderHook } from '@testing-library/react';
import { useCalculationChain } from './useCalculationChain';
import type { ProductionGoal } from '@/data/types';
import type { ChainSettingsState } from './useChainSettings';

const DEFAULT_SETTINGS: ChainSettingsState = {
  disabledResources: new Set(),
  chainYear: 1960,
  sourceQualityFromPlan: null,
  sourceQualityByResource: {},
  buildingByResource: {},
  vehicleConfigByResource: {},
  chargeRatioByResource: {},
};

const STEEL_GOAL: ProductionGoal = {
  id: 'test-1',
  resourceId: 'steel',
  buildingName: 'steel_mill_v2',
  inputType: 'buildings',
  value: 1,
};

describe('useCalculationChain', () => {
  it('retourne des listes vides si aucun goal valide', () => {
    const { result } = renderHook(() =>
      useCalculationChain([], DEFAULT_SETTINGS, {
        sourceQuality: 50,
        defaultVehicleId: 'e-10011d',
        defaultBuildingByResource: {},
      })
    );
    expect(result.current.results).toHaveLength(0);
    expect(result.current.fullChainResults).toHaveLength(0);
  });

  it('calcule une chaîne acier complète (1 aciérie)', () => {
    const { result } = renderHook(() =>
      useCalculationChain([STEEL_GOAL], DEFAULT_SETTINGS, {
        sourceQuality: 50,
        defaultVehicleId: 'e-10011d',
        defaultBuildingByResource: {},
      })
    );
    const steelResult = result.current.results.find(
      (r) => r.resourceId === 'steel' && r.buildingName === 'steel_mill_v2'
    );
    expect(steelResult).toBeDefined();
    expect(steelResult!.buildingCount).toBe(1);
  });

  it('totalWorkers est calculé sur les ressources actives', () => {
    const { result } = renderHook(() =>
      useCalculationChain([STEEL_GOAL], DEFAULT_SETTINGS, {
        sourceQuality: 50,
        defaultVehicleId: 'e-10011d',
        defaultBuildingByResource: {},
      })
    );
    expect(result.current.totalWorkers).toBeGreaterThan(0);
    expect(result.current.totalProfesors).toBeGreaterThanOrEqual(0);
  });

  it('respecte les ressources désactivées', () => {
    const settings: ChainSettingsState = {
      ...DEFAULT_SETTINGS,
      disabledResources: new Set(['coal']),
    };
    const { result } = renderHook(() =>
      useCalculationChain([STEEL_GOAL], settings, {
        sourceQuality: 50,
        defaultVehicleId: 'e-10011d',
        defaultBuildingByResource: {},
      })
    );
    const coalResult = result.current.results.find((r) => r.resourceId === 'coal');
    // La ressource coal doit apparaître comme importée (disabled = true)
    expect(coalResult?.disabled).toBe(true);
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

```bash
npx vitest run src/hooks/useCalculationChain.test.ts
```

Expected: FAIL — `Cannot find module './useCalculationChain'`

- [ ] **Step 3 : Créer `src/hooks/useCalculationChain.ts`**

Ce hook contient les deux useMemo majeurs extraits de ProductionCalculator.tsx. Copier **intégralement** les blocs des lignes 203–227 (`fullChainResults`) et 402–751 (`resultsWithMeta`) depuis `ProductionCalculator.tsx`, puis les adapter pour recevoir leurs dépendances via les paramètres du hook.

```ts
import { useMemo } from 'react';
import { productionCalculator } from '@/lib/productionCalculator';
import { sortProductionChain } from '@/lib/chainSort';
import { getResourceName } from '@/data/productions';
import { POLLUTION_T_PER_YEAR, getSafetyDistance, type PollutionDistanceMode } from '@/data/pollutionByBuilding';
import type { ProductionResult } from '@/data/types';
import type { ProductionGoal } from '@/data/types';
import type { CalculationConfig } from '@/lib/productionCalculator';
import type { ChainSettingsState } from './useChainSettings';

export interface WasteTableRow {
  sourceResourceId: string;
  buildingName: string;
  sewagePerDay: number;
  mixedPerDay: number;
  hazardousPerDay: number;
  mixedComposition: Record<string, number>;
  hazardousComposition: Record<string, number>;
  pollutionTPerYear: number | undefined;
  safetyDistance: {
    q80_min: number; q80_med: number; q80_max: number;
    q95_min: number; q95_med: number; q95_max: number;
  } | undefined;
}

export interface WasteTableData {
  rows: WasteTableRow[];
  totals: {
    sewagePerDay: number;
    mixedPerDay: number;
    hazardousPerDay: number;
    mixedComposition: Record<string, number>;
    hazardousComposition: Record<string, number>;
  };
  pollutionMin: number | undefined;
  pollutionMax: number | undefined;
  distanceMin: number | undefined;
  distanceMax: number | undefined;
}

export interface UseCalculationChainReturn {
  fullChainResults: ProductionResult[];
  results: ProductionResult[];
  surplusByResource: Map<string, number>;
  hasAnySurplus: boolean;
  sewageResult: ProductionResult | null;
  wasteMixedResult: ProductionResult | null;
  wasteToxicResult: ProductionResult | null;
  personnelBreakdown: Array<{ sourceResourceId: string; buildingName: string; workers: number; profesors: number }>;
  wasteTableData: WasteTableData;
  totalWorkers: number;
  totalProfesors: number;
}

export interface ChainStoreSnapshot {
  sourceQuality: number;
  defaultVehicleId: string;
  defaultBuildingByResource: Record<string, string>;
}

const WORKER_WASTE_060: Record<string, number> = { bio: 0.10 / 0.60, burnable: 0.20 / 0.60, other: 0.30 / 0.60 };
const WORKER_WASTE_043: Record<string, number> = { bio: 0.10 / 0.43, burnable: 0.12 / 0.43, other: 0.10 / 0.43, construction: 0.11 / 0.43 };

export function useCalculationChain(
  goals: ProductionGoal[],
  settings: ChainSettingsState,
  store: ChainStoreSnapshot
): UseCalculationChainReturn {
  const {
    disabledResources,
    chainYear,
    sourceQualityFromPlan,
    sourceQualityByResource,
    buildingByResource,
    vehicleConfigByResource,
    chargeRatioByResource,
  } = settings;

  const effectiveSourceQuality = sourceQualityFromPlan ?? store.sourceQuality;
  const effectiveBuildingByResource = useMemo(
    () => ({ ...store.defaultBuildingByResource, ...buildingByResource }),
    [store.defaultBuildingByResource, buildingByResource]
  );

  // Chaîne complète sans ressources désactivées (pour le calcul des dépendances)
  const fullChainResults = useMemo(() => {
    const validGoals = goals.filter((g) => g.resourceId && g.buildingName && g.value > 0);
    if (validGoals.length === 0) return [];
    const allChains: ProductionResult[] = [];
    for (const goal of validGoals) {
      const config: CalculationConfig = {
        resourceId: goal.resourceId,
        buildingName: effectiveBuildingByResource[goal.resourceId] ?? goal.buildingName,
        inputType: goal.inputType,
        value: goal.value,
        disabledResources: new Set(),
        sourceQuality: effectiveSourceQuality,
        sourceQualityByResource,
        defaultVehicleId: store.defaultVehicleId,
        defaultBuildingByResource: effectiveBuildingByResource,
        year: chainYear,
        vehicleConfigByResource: Object.keys(vehicleConfigByResource).length > 0 ? vehicleConfigByResource : undefined,
        chargeRatioByResource: Object.keys(chargeRatioByResource).length > 0 ? chargeRatioByResource : undefined,
      };
      const chain = productionCalculator.calculateProductionChain(config);
      allChains.push(...chain);
    }
    return productionCalculator.aggregateResults(allChains);
  }, [goals, effectiveSourceQuality, sourceQualityByResource, chainYear, store.defaultVehicleId, effectiveBuildingByResource, vehicleConfigByResource, chargeRatioByResource]);

  // Résultats complets avec gestion des ressources désactivées
  const resultsWithMeta = useMemo(() => {
    const validGoals = goals.filter((g) => g.resourceId && g.buildingName && g.value > 0);
    const primaryIds = new Set(validGoals.map((g) => g.resourceId));
    if (validGoals.length === 0) {
      return {
        results: [] as ProductionResult[],
        surplusByResource: new Map<string, number>(),
        hasAnySurplus: false,
        sewageResult: null,
        wasteMixedResult: null,
        wasteToxicResult: null,
        personnelBreakdown: [],
      };
    }

    const allChains: ProductionResult[] = [];
    for (const goal of validGoals) {
      const config: CalculationConfig = {
        resourceId: goal.resourceId,
        buildingName: effectiveBuildingByResource[goal.resourceId] ?? goal.buildingName,
        inputType: goal.inputType,
        value: goal.value,
        disabledResources,
        sourceQuality: effectiveSourceQuality,
        sourceQualityByResource,
        defaultVehicleId: store.defaultVehicleId,
        defaultBuildingByResource: effectiveBuildingByResource,
        year: chainYear,
        vehicleConfigByResource: Object.keys(vehicleConfigByResource).length > 0 ? vehicleConfigByResource : undefined,
        chargeRatioByResource: Object.keys(chargeRatioByResource).length > 0 ? chargeRatioByResource : undefined,
      };
      const chain = productionCalculator.calculateProductionChain(config);
      allChains.push(...chain);
    }
    const aggregated = productionCalculator.aggregateResults(allChains);

    const aggregatedMap = new Map<string, ProductionResult>();
    aggregated.forEach((result) => { aggregatedMap.set(result.resourceId, result); });

    const resourcesToRemove = new Set<string>();
    const usedByMap = new Map<string, Set<string>>();
    fullChainResults.forEach((fullResult) => {
      fullResult.inputsPerSecond.forEach((_, inputResourceId) => {
        if (!usedByMap.has(inputResourceId)) usedByMap.set(inputResourceId, new Set());
        usedByMap.get(inputResourceId)!.add(fullResult.resourceId);
      });
    });

    const toRemove = productionCalculator.findDependentResources(disabledResources, fullChainResults);
    toRemove.forEach((depId) => resourcesToRemove.add(depId));

    const totalConsumptionPerResource = new Map<string, number>();
    fullChainResults.forEach((result) => {
      if (!resourcesToRemove.has(result.resourceId) && !disabledResources.has(result.resourceId)) {
        result.inputsPerSecond.forEach((amount, inputResourceId) => {
          if (!resourcesToRemove.has(inputResourceId)) {
            totalConsumptionPerResource.set(inputResourceId, (totalConsumptionPerResource.get(inputResourceId) || 0) + amount);
          }
        });
      }
    });

    const finalResults: ProductionResult[] = [];
    const addedResources = new Set<string>();
    const nonProducibleResults = new Map<string, ProductionResult>();
    aggregated.forEach((result) => {
      if (result.disabled && result.buildingName === 'Import') nonProducibleResults.set(result.resourceId, result);
    });

    fullChainResults.forEach((fullResult) => {
      const resourceId = fullResult.resourceId;
      if (resourcesToRemove.has(resourceId)) return;
      if (disabledResources.has(resourceId)) {
        if (!addedResources.has(resourceId)) {
          const totalConsumption = totalConsumptionPerResource.get(resourceId);
          if (totalConsumption !== undefined && totalConsumption > 0) {
            finalResults.push({ ...fullResult, outputsPerSecond: new Map([[resourceId, totalConsumption]]) });
          } else {
            finalResults.push(fullResult);
          }
          addedResources.add(resourceId);
        }
        return;
      }
      const calculatedResult = aggregatedMap.get(resourceId);
      if (calculatedResult && !addedResources.has(resourceId)) {
        const totalConsumption = totalConsumptionPerResource.get(resourceId);
        const production = calculatedResult.outputsPerSecond.get(resourceId) ?? 0;
        const hasSurplus = production > (totalConsumption ?? 0);
        if (totalConsumption !== undefined && totalConsumption > 0 && !hasSurplus) {
          const outputs = new Map(calculatedResult.outputsPerSecond);
          outputs.set(resourceId, totalConsumption);
          finalResults.push({ ...calculatedResult, outputsPerSecond: outputs });
        } else {
          finalResults.push(calculatedResult);
        }
        addedResources.add(resourceId);
      } else if (!addedResources.has(resourceId)) {
        const producingRecipes = productionCalculator.findRecipesProducing(resourceId);
        const isNonProducible = producingRecipes.length === 0;
        if (isNonProducible) {
          const users = usedByMap.get(resourceId);
          const hasActiveUser = users && Array.from(users).some(
            (userId) => !disabledResources.has(userId) && !resourcesToRemove.has(userId)
          );
          if (hasActiveUser) {
            const totalConsumption = totalConsumptionPerResource.get(resourceId);
            if (totalConsumption !== undefined) {
              finalResults.push({ ...fullResult, outputsPerSecond: new Map([[resourceId, totalConsumption]]) });
            } else {
              finalResults.push(fullResult);
            }
            addedResources.add(resourceId);
          }
        } else {
          const totalConsumption = totalConsumptionPerResource.get(resourceId);
          const production = fullResult.outputsPerSecond.get(resourceId) ?? 0;
          const hasSurplus = production > (totalConsumption ?? 0);
          if (totalConsumption !== undefined && totalConsumption > 0 && !hasSurplus) {
            const outputs = new Map(fullResult.outputsPerSecond);
            outputs.set(resourceId, totalConsumption);
            finalResults.push({ ...fullResult, outputsPerSecond: outputs });
          } else {
            finalResults.push(fullResult);
          }
          addedResources.add(resourceId);
        }
      }
    });

    const normalResources: ProductionResult[] = [];
    let waterResource: ProductionResult | null = null;
    let electricityResource: ProductionResult | null = null;
    let totalSewagePerSecond = 0;
    finalResults.forEach((result) => { totalSewagePerSecond += result.outputsPerSecond.get('sewage') ?? 0; });

    finalResults.forEach((result) => {
      if (productionCalculator.isElectricity(result.resourceId)) electricityResource = result;
      else if (productionCalculator.isWater(result.resourceId)) waterResource = result;
      else if (productionCalculator.isSewage(result.resourceId)) { /* synthétique */ }
      else if (productionCalculator.isWasteOutput(result.resourceId)) { /* synthétique */ }
      else normalResources.push(result);
    });

    nonProducibleResults.forEach((nonProducibleResult, resourceId) => {
      if (!addedResources.has(resourceId)) {
        const users = usedByMap.get(resourceId);
        const hasActiveUser = users && Array.from(users).some(
          (userId) => !disabledResources.has(userId) && !resourcesToRemove.has(userId)
        );
        if (hasActiveUser) {
          const totalConsumption = totalConsumptionPerResource.get(resourceId);
          const resultToAdd = totalConsumption !== undefined
            ? { ...nonProducibleResult, outputsPerSecond: new Map([[resourceId, totalConsumption]]) }
            : nonProducibleResult;
          if (productionCalculator.isElectricity(resourceId)) electricityResource = resultToAdd;
          else if (productionCalculator.isWater(resourceId)) waterResource = resultToAdd;
          else normalResources.push(resultToAdd);
          addedResources.add(resourceId);
        }
      }
    });

    const sewageBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number }> = [];
    let totalWasteMixedPerSecond = 0;
    let totalWasteToxicPerSecond = 0;
    const wasteMixedBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number; workerWasteTPerDay?: number }> = [];
    const wasteToxicBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number }> = [];

    finalResults.forEach((result) => {
      if (disabledResources.has(result.resourceId)) return;
      const amt = result.outputsPerSecond.get('sewage') ?? 0;
      if (amt > 0) sewageBreakdown.push({ sourceResourceId: result.resourceId, buildingName: result.buildingName, amountPerSecond: amt });
      const wasteMixedAmt = result.outputsPerSecond.get('waste_mixed') ?? 0;
      if (wasteMixedAmt > 0) {
        totalWasteMixedPerSecond += wasteMixedAmt;
        const recipe = productionCalculator.getRecipe(result.resourceId, result.buildingName);
        const workerWasteTPerDay = recipe?.worker_waste_kg_per_day != null && result.totalWorkers > 0
          ? (result.totalWorkers * recipe.worker_waste_kg_per_day) / 1000
          : undefined;
        wasteMixedBreakdown.push({
          sourceResourceId: result.resourceId,
          buildingName: result.buildingName,
          amountPerSecond: wasteMixedAmt,
          ...(workerWasteTPerDay != null && workerWasteTPerDay > 0 ? { workerWasteTPerDay } : {}),
        });
      }
      const wasteToxicAmt = result.outputsPerSecond.get('waste_toxic') ?? 0;
      if (wasteToxicAmt > 0) {
        totalWasteToxicPerSecond += wasteToxicAmt;
        wasteToxicBreakdown.push({ sourceResourceId: result.resourceId, buildingName: result.buildingName, amountPerSecond: wasteToxicAmt });
      }
    });

    const waterConsumptionBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number }> = [];
    const electricityConsumptionBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number }> = [];
    finalResults.forEach((result) => {
      if (disabledResources.has(result.resourceId)) return;
      const waterAmt = (result.inputsPerSecond.get('water') ?? 0) + (result.inputsPerSecond.get('usagewater') ?? 0);
      if (waterAmt > 0) waterConsumptionBreakdown.push({ sourceResourceId: result.resourceId, buildingName: result.buildingName, amountPerSecond: waterAmt });
      const elecAmt = result.inputsPerSecond.get('eletric') ?? 0;
      if (elecAmt > 0) electricityConsumptionBreakdown.push({ sourceResourceId: result.resourceId, buildingName: result.buildingName, amountPerSecond: elecAmt });
    });

    if (waterResource && waterConsumptionBreakdown.length > 0) {
      waterResource = Object.assign({}, waterResource, { consumptionBreakdown: waterConsumptionBreakdown });
    }
    if (electricityResource && electricityConsumptionBreakdown.length > 0) {
      electricityResource = Object.assign({}, electricityResource, { consumptionBreakdown: electricityConsumptionBreakdown });
    }

    const sortedNormals = sortProductionChain(normalResources);
    const results = [
      ...sortedNormals,
      ...(waterResource ? [waterResource] : []),
      ...(electricityResource ? [electricityResource] : []),
    ];

    const surplusByResource = productionCalculator.computeSurplusByResource(aggregated);
    const hasAnySurplus = results.some((r) => {
      const surplusPerSec = primaryIds.has(r.resourceId) ? 0 : (surplusByResource.get(r.resourceId) ?? 0);
      const surplusPerDay = surplusPerSec * (24 * 60 * 60);
      const amountPerDay = (r.outputsPerSecond.get(r.resourceId) ?? 0) * (24 * 60 * 60);
      const surplusToShow = r.isCoProduct ? amountPerDay : surplusPerDay;
      return surplusToShow > 0.01;
    });

    const personnelBreakdown = results
      .filter((r) => !disabledResources.has(r.resourceId) && (r.totalWorkers + r.totalProfesors) > 0)
      .map((r) => ({ sourceResourceId: r.resourceId, buildingName: r.buildingName, workers: r.totalWorkers, profesors: r.totalProfesors }));

    const sewageResult: ProductionResult | null = totalSewagePerSecond > 0 ? {
      resourceId: 'sewage', resourceName: getResourceName('sewage'), buildingName: 'Coproduct',
      buildingCount: 0, inputsPerSecond: new Map(), outputsPerSecond: new Map([['sewage', totalSewagePerSecond]]),
      totalWorkers: 0, totalProfesors: 0, isCoProduct: true, coproductBreakdown: sewageBreakdown,
    } : null;

    const wasteMixedResult: ProductionResult | null = totalWasteMixedPerSecond > 0 ? {
      resourceId: 'waste_mixed', resourceName: getResourceName('waste_mixed'), buildingName: 'Coproduct',
      buildingCount: 0, inputsPerSecond: new Map(), outputsPerSecond: new Map([['waste_mixed', totalWasteMixedPerSecond]]),
      totalWorkers: 0, totalProfesors: 0, isCoProduct: true, coproductBreakdown: wasteMixedBreakdown,
    } : null;

    const wasteToxicResult: ProductionResult | null = totalWasteToxicPerSecond > 0 ? {
      resourceId: 'waste_toxic', resourceName: getResourceName('waste_toxic'), buildingName: 'Coproduct',
      buildingCount: 0, inputsPerSecond: new Map(), outputsPerSecond: new Map([['waste_toxic', totalWasteToxicPerSecond]]),
      totalWorkers: 0, totalProfesors: 0, isCoProduct: true, coproductBreakdown: wasteToxicBreakdown,
    } : null;

    return { results, surplusByResource, hasAnySurplus, sewageResult, wasteMixedResult, wasteToxicResult, personnelBreakdown };
  }, [goals, disabledResources, fullChainResults, effectiveSourceQuality, sourceQualityByResource, chainYear, store.defaultVehicleId, effectiveBuildingByResource, vehicleConfigByResource, chargeRatioByResource]);

  // Données pour la table déchets/pollution
  const wasteTableData = useMemo((): WasteTableData => {
    const { sewageResult, wasteMixedResult, wasteToxicResult } = resultsWithMeta;
    const byBuilding = new Map<string, WasteTableRow>();
    const key = (a: string, b: string) => `${a}|${b}`;

    const addRow = (sourceResourceId: string, buildingName: string) => {
      const k = key(sourceResourceId, buildingName);
      if (!byBuilding.has(k)) {
        const recipe = productionCalculator.getRecipe(sourceResourceId, buildingName);
        byBuilding.set(k, {
          sourceResourceId, buildingName,
          sewagePerDay: 0, mixedPerDay: 0, hazardousPerDay: 0,
          mixedComposition: {}, hazardousComposition: {},
          pollutionTPerYear: POLLUTION_T_PER_YEAR[buildingName],
          safetyDistance: recipe?.safetyDistance,
        });
      }
      return byBuilding.get(k)!;
    };

    sewageResult?.coproductBreakdown?.forEach((entry) => {
      addRow(entry.sourceResourceId, entry.buildingName).sewagePerDay += entry.amountPerSecond * 86400;
    });

    wasteMixedResult?.coproductBreakdown?.forEach((entry) => {
      const row = addRow(entry.sourceResourceId, entry.buildingName);
      const tPerDay = entry.amountPerSecond * 86400;
      row.mixedPerDay += tPerDay;
      const recipe = productionCalculator.getRecipe(entry.sourceResourceId, entry.buildingName);
      const workerWasteTPerDay = entry.workerWasteTPerDay ?? 0;
      const productionMixedTPerDay = tPerDay - workerWasteTPerDay;
      if (workerWasteTPerDay > 0 && recipe?.worker_waste_kg_per_day != null) {
        const comp = recipe.worker_waste_kg_per_day === 0.43 ? WORKER_WASTE_043 : WORKER_WASTE_060;
        Object.entries(comp).forEach(([typeKey, frac]) => {
          row.mixedComposition[typeKey] = (row.mixedComposition[typeKey] ?? 0) + workerWasteTPerDay * frac;
        });
      }
      if (productionMixedTPerDay > 0 && recipe?.production_waste_composition) {
        const comp = recipe.production_waste_composition;
        const entries = Object.entries(comp).filter(([k, f]) => k !== 'hazardous' && f > 0);
        const sumFrac = entries.reduce((s, [, f]) => s + f, 0);
        if (sumFrac > 0) {
          entries.forEach(([typeKey, frac]) => {
            row.mixedComposition[typeKey] = (row.mixedComposition[typeKey] ?? 0) + productionMixedTPerDay * (frac / sumFrac);
          });
        }
      }
    });

    wasteToxicResult?.coproductBreakdown?.forEach((entry) => {
      const row = addRow(entry.sourceResourceId, entry.buildingName);
      const entryTPerDay = entry.amountPerSecond * 86400;
      row.hazardousPerDay += entryTPerDay;
      const recipe = productionCalculator.getRecipe(entry.sourceResourceId, entry.buildingName);
      const comp = recipe?.production_waste_composition;
      const hasHazardous = recipe?.has_hazardous_waste_output === true;
      if (!comp || !hasHazardous) return;
      const hFrac = comp.hazardous ?? 0;
      if (hFrac === 0 && Object.entries(comp).every(([, f]) => f === 0)) return;
      const coef = 0.3 * (1 - hFrac) + hFrac;
      if (coef <= 0) return;
      const prodWasteTPerDay = entryTPerDay / coef;
      Object.entries(comp).filter(([, f]) => f > 0).forEach(([typeKey, frac]) => {
        const amount = typeKey === 'hazardous' ? prodWasteTPerDay * frac : 0.3 * prodWasteTPerDay * frac;
        if (amount > 0) row.hazardousComposition[typeKey] = (row.hazardousComposition[typeKey] ?? 0) + amount;
      });
    });

    const rows = Array.from(byBuilding.values()).filter((r) => r.sewagePerDay > 0 || r.mixedPerDay > 0 || r.hazardousPerDay > 0);
    const polValues = rows.map((r) => r.pollutionTPerYear).filter((v): v is number => v != null);
    const pollutionMin = polValues.length > 0 ? Math.min(...polValues) : undefined;
    const pollutionMax = polValues.length > 0 ? Math.max(...polValues) : undefined;
    // dummy pollutionDistanceMode for computation — the actual mode is passed to getSafetyDistance in PollutionTable
    const dummyMode: PollutionDistanceMode = 'q80_min';
    const sdValues = rows.map((r) => r.safetyDistance != null ? getSafetyDistance(r.safetyDistance, dummyMode) : null).filter((v): v is number => v != null);
    const distanceMin = sdValues.length > 0 ? Math.min(...sdValues) : undefined;
    const distanceMax = sdValues.length > 0 ? Math.max(...sdValues) : undefined;
    const totals = rows.reduce(
      (acc, r) => ({ sewagePerDay: acc.sewagePerDay + r.sewagePerDay, mixedPerDay: acc.mixedPerDay + r.mixedPerDay, hazardousPerDay: acc.hazardousPerDay + r.hazardousPerDay, mixedComposition: {} as Record<string, number>, hazardousComposition: {} as Record<string, number> }),
      { sewagePerDay: 0, mixedPerDay: 0, hazardousPerDay: 0, mixedComposition: {} as Record<string, number>, hazardousComposition: {} as Record<string, number> }
    );
    rows.forEach((r) => {
      Object.entries(r.mixedComposition).forEach(([k, v]) => { totals.mixedComposition[k] = (totals.mixedComposition[k] ?? 0) + v; });
      Object.entries(r.hazardousComposition).forEach(([k, v]) => { totals.hazardousComposition[k] = (totals.hazardousComposition[k] ?? 0) + v; });
    });
    return { rows, totals, pollutionMin, pollutionMax, distanceMin, distanceMax };
  }, [resultsWithMeta]);

  const { results, surplusByResource, hasAnySurplus, sewageResult, wasteMixedResult, wasteToxicResult, personnelBreakdown } = resultsWithMeta;

  const totalWorkers = useMemo(
    () => Math.ceil(productionCalculator.calculateTotalWorkers(results.filter((r) => !disabledResources.has(r.resourceId)))),
    [results, disabledResources]
  );
  const totalProfesors = useMemo(
    () => Math.ceil(productionCalculator.calculateTotalProfesors(results.filter((r) => !disabledResources.has(r.resourceId)))),
    [results, disabledResources]
  );

  return {
    fullChainResults,
    results,
    surplusByResource,
    hasAnySurplus,
    sewageResult,
    wasteMixedResult,
    wasteToxicResult,
    personnelBreakdown,
    wasteTableData,
    totalWorkers,
    totalProfesors,
  };
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
npx vitest run src/hooks/useCalculationChain.test.ts
```

Expected: `4 passed`

- [ ] **Step 5 : Vérifier tous les tests**

```bash
npm test
```

Expected: `7 passed`

- [ ] **Step 6 : Commit**

```bash
git add src/hooks/useCalculationChain.ts src/hooks/useCalculationChain.test.ts
git commit -m "feat(hooks): extract useCalculationChain with tests"
```

---

## Task 8: Extraire `GoalItem` et `GoalList`

**Files:**
- Create: `src/components/GoalList/GoalItem.tsx`
- Create: `src/components/GoalList/GoalList.tsx`
- Create: `src/components/GoalList/GoalList.test.tsx`
- Modify: `src/components/ProductionCalculator.tsx`

`GoalList` et `GoalItem` encapsulent le rendu des objectifs de production (lignes 980-1076 de `ProductionCalculator.tsx`).

- [ ] **Step 1 : Écrire le test en premier (`src/components/GoalList/GoalList.test.tsx`)**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { GoalList } from './GoalList';
import { STEEL_GOAL } from '@/__fixtures__/productionResults';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe('GoalList', () => {
  const mockAllProductions = [
    { resourceId: 'steel', resourceName: 'Acier', recipes: [{ name: 'steel_mill_v2', production: 1, workers: 200, profesors: 0, consumption: {} }] },
  ];

  it('affiche un objectif', () => {
    render(
      <GoalList
        goals={[STEEL_GOAL]}
        allProductions={mockAllProductions as never}
        effectiveBuildingByResource={{}}
        onAddGoal={() => {}}
        onRemoveGoal={() => {}}
        onUpdateGoal={() => {}}
        onSetGoalResource={() => {}}
      />,
      { wrapper }
    );
    expect(screen.getByRole('button', { name: /ajouter/i })).toBeInTheDocument();
  });

  it('appelle onAddGoal au clic sur le bouton ajouter', () => {
    const onAdd = vi.fn();
    render(
      <GoalList
        goals={[STEEL_GOAL]}
        allProductions={mockAllProductions as never}
        effectiveBuildingByResource={{}}
        onAddGoal={onAdd}
        onRemoveGoal={() => {}}
        onUpdateGoal={() => {}}
        onSetGoalResource={() => {}}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /ajouter/i }));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

```bash
npx vitest run src/components/GoalList/GoalList.test.tsx
```

Expected: FAIL — `Cannot find module './GoalList'`

- [ ] **Step 3 : Créer `src/components/GoalList/GoalItem.tsx`**

Copier le contenu du `map` interne des goals de `ProductionCalculator.tsx` (lignes 986-1066) dans un composant isolé :

```tsx
import { useTranslation } from 'react-i18next';
import { productionCalculator } from '@/lib/productionCalculator';
import type { ProductionGoal } from '@/data/types';
import type { ResourceProduction } from '@/data/types';
import { Tooltip } from '@/components/Tooltip';
import { ResourcePicker } from '@/components/ResourcePicker';
import { BuildingPicker } from '@/components/BuildingPicker';

interface GoalItemProps {
  goal: ProductionGoal;
  allProductions: ResourceProduction[];
  effectiveBuildingByResource: Record<string, string>;
  onUpdate: (patch: Partial<Pick<ProductionGoal, 'resourceId' | 'buildingName' | 'inputType' | 'value'>>) => void;
  onRemove: () => void;
  onSetResource: (resourceId: string) => void;
}

export function GoalItem({
  goal,
  allProductions,
  effectiveBuildingByResource,
  onUpdate,
  onRemove,
  onSetResource,
}: GoalItemProps) {
  const { t } = useTranslation();
  const recipe = productionCalculator.getRecipe(goal.resourceId, goal.buildingName);
  const prodPerBuildingPerDay = recipe ? recipe.production * recipe.workers : 0;
  const displayBuildings = goal.inputType === 'buildings'
    ? goal.value
    : prodPerBuildingPerDay > 0
      ? (goal.inputType === 'output_per_year' ? goal.value / 365 : goal.value) / prodPerBuildingPerDay
      : 0;
  const displayPerDay = goal.inputType === 'output_per_day'
    ? goal.value
    : goal.inputType === 'output_per_year'
      ? goal.value / 365
      : prodPerBuildingPerDay * goal.value;
  const displayPerYear = goal.inputType === 'output_per_year' ? goal.value : displayPerDay * 365;

  const production = productionCalculator.getProduction(goal.resourceId);
  const recipes = production?.recipes ?? [];

  return (
    <div className="flex flex-wrap items-center gap-3 bg-gray-700/50 rounded-lg px-3 py-2">
      <Tooltip content={t('industry.removeGoalTitle')}>
        <button
          type="button"
          onClick={onRemove}
          className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center text-red-400 hover:bg-gray-600 transition-colors"
        >
          ✕
        </button>
      </Tooltip>
      <ResourcePicker
        productions={allProductions}
        selectedResourceId={goal.resourceId}
        onSelect={onSetResource}
        size={40}
      />
      {recipes.length > 1 && (
        <BuildingPicker
          resourceId={goal.resourceId}
          selectedBuilding={effectiveBuildingByResource[goal.resourceId] ?? goal.buildingName}
          onSelect={(buildingName) => onUpdate({ buildingName })}
        />
      )}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-400">{t('industry.buildings')}:</label>
        <input
          type="number" min="0.01" step="0.1"
          value={displayBuildings}
          onChange={(e) => {
            const v = parseFloat(e.target.value) || 0;
            onUpdate({ inputType: 'buildings', value: v });
          }}
          className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-400">{t('industry.perDay')}:</label>
        <input
          type="number" min="0" step="0.1"
          value={displayPerDay.toFixed(2)}
          onChange={(e) => {
            const v = parseFloat(e.target.value) || 0;
            onUpdate({ inputType: 'output_per_day', value: v });
          }}
          className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-400">{t('industry.perYear')}:</label>
        <input
          type="number" min="0" step="0.1"
          value={displayPerYear.toFixed(1)}
          onChange={(e) => {
            const v = parseFloat(e.target.value) || 0;
            onUpdate({ inputType: 'output_per_year', value: v });
          }}
          className="w-28 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4 : Créer `src/components/GoalList/GoalList.tsx`**

```tsx
import { useTranslation } from 'react-i18next';
import type { ProductionGoal } from '@/data/types';
import type { ResourceProduction } from '@/data/types';
import { GoalItem } from './GoalItem';

interface GoalListProps {
  goals: ProductionGoal[];
  allProductions: ResourceProduction[];
  effectiveBuildingByResource: Record<string, string>;
  onAddGoal: () => void;
  onRemoveGoal: (id: string) => void;
  onUpdateGoal: (id: string, patch: Partial<Pick<ProductionGoal, 'resourceId' | 'buildingName' | 'inputType' | 'value'>>) => void;
  onSetGoalResource: (goalId: string, resourceId: string) => void;
}

export function GoalList({
  goals,
  allProductions,
  effectiveBuildingByResource,
  onAddGoal,
  onRemoveGoal,
  onUpdateGoal,
  onSetGoalResource,
}: GoalListProps) {
  const { t } = useTranslation();
  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-soviet-red">{t('industry.title')}</h2>
      <div className="space-y-3">
        <label className="block text-sm font-medium">{t('industry.productionGoals')}</label>
        <p className="text-sm text-gray-400 mb-2">{t('industry.productionGoalsHint')}</p>
        <div className="space-y-2">
          {goals.map((goal) => (
            <GoalItem
              key={goal.id}
              goal={goal}
              allProductions={allProductions}
              effectiveBuildingByResource={effectiveBuildingByResource}
              onUpdate={(patch) => onUpdateGoal(goal.id, patch)}
              onRemove={() => onRemoveGoal(goal.id)}
              onSetResource={(resourceId) => onSetGoalResource(goal.id, resourceId)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onAddGoal}
          className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-gray-700 border border-gray-600 hover:border-soviet-gold hover:bg-gray-600 transition-colors text-soviet-gold"
        >
          + {t('industry.addGoal')}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5 : Vérifier que les tests passent**

```bash
npx vitest run src/components/GoalList/GoalList.test.tsx
```

Expected: `2 passed`

- [ ] **Step 6 : Vérifier tous les tests**

```bash
npm test
```

Expected: `8 passed`

- [ ] **Step 7 : Commit**

```bash
git add src/components/GoalList/
git commit -m "feat(ui): extract GoalList and GoalItem components with tests"
```

---

## Task 9: Extraire `PlansPanel`

**Files:**
- Create: `src/components/PlansPanel/PlansPanel.tsx`
- Create: `src/components/PlansPanel/PlansPanel.test.tsx`
- Modify: `src/components/ProductionCalculator.tsx`

`PlansPanel` encapsule tout le panneau latéral des plans sauvegardés (lignes 1853-1970 de `ProductionCalculator.tsx`). Il maintient son propre state UI (rename inline, tri).

- [ ] **Step 1 : Écrire le test en premier (`src/components/PlansPanel/PlansPanel.test.tsx`)**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { PlansPanel } from './PlansPanel';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import type { SavedPlan } from '@/lib/savedPlans';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const MOCK_PLAN: SavedPlan = {
  id: 'plan-1',
  name: 'Mon plan acier',
  createdAt: Date.now(),
  planState: { g: [], y: 1960 },
};

describe('PlansPanel', () => {
  it('affiche le bouton Nouveau calcul', () => {
    render(
      <PlansPanel
        savedPlansList={[]}
        currentPlanId={null}
        onNewPlan={() => {}}
        onLoadPlan={() => {}}
        onDeletePlan={() => {}}
        onRenamePlan={() => {}}
        onDuplicatePlan={() => {}}
        onSharePlan={() => {}}
      />,
      { wrapper }
    );
    expect(screen.getByRole('button', { name: /nouveau/i })).toBeInTheDocument();
  });

  it('affiche le nom d\'un plan sauvegardé', () => {
    render(
      <PlansPanel
        savedPlansList={[MOCK_PLAN]}
        currentPlanId={null}
        onNewPlan={() => {}}
        onLoadPlan={() => {}}
        onDeletePlan={() => {}}
        onRenamePlan={() => {}}
        onDuplicatePlan={() => {}}
        onSharePlan={() => {}}
      />,
      { wrapper }
    );
    expect(screen.getByText('Mon plan acier')).toBeInTheDocument();
  });

  it('appelle onLoadPlan au clic sur Charger', () => {
    const onLoad = vi.fn();
    render(
      <PlansPanel
        savedPlansList={[MOCK_PLAN]}
        currentPlanId={null}
        onNewPlan={() => {}}
        onLoadPlan={onLoad}
        onDeletePlan={() => {}}
        onRenamePlan={() => {}}
        onDuplicatePlan={() => {}}
        onSharePlan={() => {}}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /charger|load/i }));
    expect(onLoad).toHaveBeenCalledWith('plan-1');
  });

  it('affiche un input de renommage inline au clic sur Renommer', () => {
    render(
      <PlansPanel
        savedPlansList={[MOCK_PLAN]}
        currentPlanId={null}
        onNewPlan={() => {}}
        onLoadPlan={() => {}}
        onDeletePlan={() => {}}
        onRenamePlan={() => {}}
        onDuplicatePlan={() => {}}
        onSharePlan={() => {}}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /renommer|rename/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier l'échec**

```bash
npx vitest run src/components/PlansPanel/PlansPanel.test.tsx
```

Expected: FAIL — `Cannot find module './PlansPanel'`

- [ ] **Step 3 : Créer `src/components/PlansPanel/PlansPanel.tsx`**

Copier le contenu de l'`<aside>` de `ProductionCalculator.tsx` (lignes 1854-1970), en remplaçant les références aux variables locales par des props et du state local :

```tsx
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SavedPlan } from '@/lib/savedPlans';
import { Tooltip } from '@/components/Tooltip';

type PlansSort = { field: 'date' | 'name'; order: 'asc' | 'desc' };

interface PlansPanelProps {
  savedPlansList: SavedPlan[];
  currentPlanId: string | null;
  onNewPlan: () => void;
  onLoadPlan: (id: string) => void;
  onDeletePlan: (id: string) => void;
  onRenamePlan: (id: string, name: string) => void;
  onDuplicatePlan: (id: string) => void;
  onSharePlan?: (id: string) => void;
}

export function PlansPanel({
  savedPlansList,
  currentPlanId,
  onNewPlan,
  onLoadPlan,
  onDeletePlan,
  onRenamePlan,
  onDuplicatePlan,
}: PlansPanelProps) {
  const { t } = useTranslation();
  const [renamePlanId, setRenamePlanId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [plansSort, setPlansSort] = useState<PlansSort>({ field: 'date', order: 'desc' });

  const sortedPlansList = useMemo(() => {
    const list = [...savedPlansList];
    if (plansSort.field === 'name') {
      const cmp = (a: SavedPlan, b: SavedPlan) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return plansSort.order === 'asc' ? list.sort(cmp) : list.sort((a, b) => -cmp(a, b));
    }
    const cmp = (a: SavedPlan, b: SavedPlan) => a.createdAt - b.createdAt;
    return plansSort.order === 'asc' ? list.sort(cmp) : list.sort((a, b) => -cmp(a, b));
  }, [savedPlansList, plansSort]);

  const toggleSort = (field: 'date' | 'name') => {
    setPlansSort((prev) =>
      prev.field === field
        ? { ...prev, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : { field, order: field === 'date' ? 'desc' : 'asc' }
    );
  };

  const startRename = (plan: SavedPlan) => {
    setRenamePlanId(plan.id);
    setRenameValue(plan.name);
  };

  const submitRename = () => {
    if (renamePlanId && renameValue.trim()) {
      onRenamePlan(renamePlanId, renameValue.trim());
    }
    setRenamePlanId(null);
    setRenameValue('');
  };

  return (
    <aside className="w-80 shrink-0 flex flex-col bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-600">
        <h3 className="text-lg font-semibold text-soviet-gold">{t('industry.myCalculations')}</h3>
        <button
          type="button"
          onClick={onNewPlan}
          className="mt-3 w-full py-2 rounded-lg bg-soviet-red hover:bg-red-700 text-white text-sm font-medium transition-colors"
        >
          + {t('industry.newCalculation')}
        </button>
      </div>
      {savedPlansList.length > 1 && (
        <div className="flex justify-end gap-3 px-3 pt-1 pb-0.5 border-b border-gray-700/50">
          <Tooltip content={plansSort.order === 'desc' ? t('industry.sortDateDesc') : t('industry.sortDateAsc')}>
            <button
              type="button"
              onClick={() => toggleSort('date')}
              className="text-xs text-gray-500 hover:text-soviet-gold transition-colors underline-offset-2 hover:underline"
            >
              {t('industry.sortDate')} {plansSort.field === 'date' ? (plansSort.order === 'desc' ? '↓' : '↑') : ''}
            </button>
          </Tooltip>
          <Tooltip content={plansSort.field === 'name' && plansSort.order === 'asc' ? t('industry.sortNameAZ') : t('industry.sortNameZA')}>
            <button
              type="button"
              onClick={() => toggleSort('name')}
              className="text-xs text-gray-500 hover:text-soviet-gold transition-colors underline-offset-2 hover:underline"
            >
              {t('industry.sortName')} {plansSort.field === 'name' ? (plansSort.order === 'asc' ? '↑' : '↓') : ''}
            </button>
          </Tooltip>
        </div>
      )}
      <ul className="flex-1 overflow-y-auto p-2 space-y-1">
        {sortedPlansList.map((plan) => (
          <li
            key={plan.id}
            className={`rounded-lg transition-colors ${
              plan.id === currentPlanId
                ? 'ring-1 ring-soviet-gold bg-gray-700/80'
                : 'bg-gray-700/50 hover:bg-gray-700/70'
            }`}
          >
            <div className="p-2 flex flex-col gap-1">
              {renamePlanId === plan.id ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={submitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename();
                    if (e.key === 'Escape') { setRenamePlanId(null); setRenameValue(''); }
                  }}
                  autoFocus
                  className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white"
                />
              ) : (
                <span className="text-sm text-white truncate cursor-default">{plan.name}</span>
              )}
              <span className="text-xs text-gray-500">
                {new Date(plan.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                <button type="button" onClick={() => onLoadPlan(plan.id)}
                  className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-soviet-gold hover:text-gray-900 text-gray-200 transition-colors">
                  {t('industry.load')}
                </button>
                <Tooltip content={t('industry.duplicate')}>
                  <button type="button" onClick={() => onDuplicatePlan(plan.id)}
                    className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-gray-200 transition-colors">
                    {t('industry.duplicate')}
                  </button>
                </Tooltip>
                <Tooltip content={t('industry.rename')}>
                  <button type="button" onClick={() => startRename(plan)}
                    className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-gray-200 transition-colors">
                    {t('industry.rename')}
                  </button>
                </Tooltip>
                <Tooltip content={t('industry.delete')}>
                  <button type="button" onClick={() => onDeletePlan(plan.id)}
                    className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-red-600 text-gray-200 transition-colors">
                    {t('industry.delete')}
                  </button>
                </Tooltip>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {savedPlansList.length === 0 && (
        <p className="p-4 text-sm text-gray-500">{t('industry.noCalculations')}</p>
      )}
    </aside>
  );
}
```

- [ ] **Step 4 : Vérifier que les tests passent**

```bash
npx vitest run src/components/PlansPanel/PlansPanel.test.tsx
```

Expected: `4 passed`

- [ ] **Step 5 : Vérifier tous les tests**

```bash
npm test
```

Expected: `9 passed`

- [ ] **Step 6 : Commit**

```bash
git add src/components/PlansPanel/
git commit -m "feat(ui): extract PlansPanel component with tests"
```

---

## Task 10: Extraire `ChainTable`

**Files:**
- Create: `src/components/ResultSection/ChainTable.tsx`
- Modify: (aucune modification de ProductionCalculator.tsx à cette étape)

`ChainTable` contient le tableau principal de la chaîne de production (lignes 1089-1676 de `ProductionCalculator.tsx`). C'est le composant le plus complexe — il gère l'affichage des lignes, la configuration véhicules inline, et la ligne Personnels.

- [ ] **Step 1 : Créer `src/components/ResultSection/ChainTable.tsx`**

Créer le fichier avec les imports et la signature de props, puis copier le JSX depuis `ProductionCalculator.tsx` lignes 1089–1676 en adaptant les références aux variables locales par des props. Les variables locales à remplacer par des props :

| Variable dans ProductionCalculator | Prop dans ChainTable |
|---|---|
| `results` | `results` |
| `disabledResources` | `disabledResources` |
| `hasAnySurplus` | `hasAnySurplus` |
| `chainYear` | `chainYear` |
| `setChainYear(v)` | `onChangeYear(v)` |
| `vehicleConfigByResource` | `vehicleConfigByResource` |
| `sourceQualityByResource` | `sourceQualityByResource` |
| `effectiveSourceQuality` | `effectiveSourceQuality` |
| `effectiveBuildingByResource` | `effectiveBuildingByResource` |
| `toggleResourceDisabled(id)` | `onToggleResource(id)` |
| `setSourceQualityForResource(id,v)` | `onSetSourceQuality(id,v)` |
| `setBuildingForResource(id,name)` | `onSetBuilding(id,name)` |
| `setVehicleConfigByResource(fn)` | `onSetVehicleConfig(id, cfg)` |
| `expandedChainRows` | state local du composant |
| `setExpandedChainRows(fn)` | state local du composant |
| `vehicleSlotPickerOpen` | state local du composant |
| `setVehicleSlotPickerOpen(v)` | state local du composant |
| `totalWorkers` | `totalWorkers` |
| `totalProfesors` | `totalProfesors` |
| `personnelBreakdown` | `personnelBreakdown` |

```tsx
import { useState, useEffect, useRef, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { productionCalculator } from '@/lib/productionCalculator';
import { formatNumber } from '@/lib/format';
import { getResourceIcon } from '@/data/resourceIcons';
import { getBuildingImageUrls } from '@/data/buildingIcons';
import { Tooltip } from '@/components/Tooltip';
import { BuildingPicker } from '@/components/BuildingPicker';
import { vehicles, getVehicle, formatVehicleSkills, ORIGIN_TO_KEY } from '@/data/vehicles';
import type { ProductionResult } from '@/data/types';
import type { MineVehicleConfig } from '@/lib/productionCalculator';

const BASE = import.meta.env.BASE_URL;
const VEHICLE_PLACEHOLDER = `${BASE}vehicles/excavator.svg`;
const SIDE_EAST = `${BASE}sides/east.png`;
const SIDE_WEST = `${BASE}sides/west.png`;

const BLOC_EAST_ORIGINS = new Set([
  'Union soviétique', 'Tchécoslovaquie', 'Roumanie', 'Allemagne de l\'Est',
  'Pologne', 'Hongrie', 'Bulgarie', 'RDA',
]);

function getVehicleImageSrc(vehicle: { image?: string } | undefined): string {
  return vehicle?.image ? `${BASE}${vehicle.image}` : VEHICLE_PLACEHOLDER;
}

function getBlocForOrigin(origin: string): 'east' | 'west' {
  return BLOC_EAST_ORIGINS.has(origin) ? 'east' : 'west';
}

export interface ChainTableProps {
  results: ProductionResult[];
  disabledResources: Set<string>;
  hasAnySurplus: boolean;
  chainYear: number;
  effectiveSourceQuality: number;
  sourceQualityByResource: Record<string, number>;
  effectiveBuildingByResource: Record<string, string>;
  vehicleConfigByResource: Record<string, MineVehicleConfig>;
  totalWorkers: number;
  totalProfesors: number;
  personnelBreakdown: Array<{ sourceResourceId: string; buildingName: string; workers: number; profesors: number }>;
  onChangeYear: (year: number) => void;
  onToggleResource: (resourceId: string) => void;
  onSetSourceQuality: (resourceId: string, value: number) => void;
  onSetBuilding: (resourceId: string, buildingName: string) => void;
  onSetVehicleConfig: (resourceId: string, cfg: MineVehicleConfig) => void;
}

export function ChainTable({
  results,
  disabledResources,
  hasAnySurplus,
  chainYear,
  effectiveSourceQuality,
  sourceQualityByResource,
  effectiveBuildingByResource,
  vehicleConfigByResource,
  totalWorkers,
  totalProfesors,
  personnelBreakdown,
  onChangeYear,
  onToggleResource,
  onSetSourceQuality,
  onSetBuilding,
  onSetVehicleConfig,
}: ChainTableProps) {
  const { t } = useTranslation();
  const [expandedChainRows, setExpandedChainRows] = useState<Set<string>>(new Set());
  const [vehicleSlotPickerOpen, setVehicleSlotPickerOpen] = useState<{ resourceId: string; slotIndex: number } | null>(null);
  const vehicleSlotPickerRef = useRef<HTMLDivElement | null>(null);

  const hasAnyMine = results.some((r) => productionCalculator.isMineResult(r.resourceId, r.buildingName));
  const hasAnyVehicleMine = results.some((r) => productionCalculator.isVehicleMineResult(r.resourceId, r.buildingName));

  useEffect(() => {
    if (!vehicleSlotPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const picker = document.querySelector('[data-vehicle-slot-picker]');
      if (picker?.contains(target)) return;
      setVehicleSlotPickerOpen(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [vehicleSlotPickerOpen]);

  // ─── COLLER ICI LE JSX DES LIGNES 1089-1676 DE ProductionCalculator.tsx ───
  // Remplacer chaque référence locale par la prop correspondante (tableau ci-dessus).
  // Les setters de state local restent en state local (expandedChainRows, vehicleSlotPickerOpen).
  // onSetVehicleConfig remplace setVehicleConfigByResource((prev) => ({ ...prev, [rid]: cfg })).
  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
      {/* Contenu copié depuis ProductionCalculator.tsx lignes 1092-1676 */}
      {/* TODO : remplacer ce commentaire par le JSX extrait */}
      <p className="text-gray-400">ChainTable — à compléter lors de l&apos;extraction</p>
    </div>
  );
}
```

**Note importante :** Le commentaire `TODO` doit être remplacé par le JSX des lignes 1092-1676 de `ProductionCalculator.tsx`. L'extraction est du copier-coller + remplacement des variables locales par les props selon le tableau ci-dessus. Pas de logique nouvelle à écrire.

- [ ] **Step 2 : Compiler pour vérifier les types**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: pas d'erreur dans `src/components/ResultSection/ChainTable.tsx`

- [ ] **Step 3 : Commit**

```bash
git add src/components/ResultSection/ChainTable.tsx
git commit -m "feat(ui): extract ChainTable component skeleton"
```

---

## Task 11: Extraire `PollutionTable`

**Files:**
- Create: `src/components/ResultSection/PollutionTable.tsx`

`PollutionTable` contient la table Déchets/Eaux usées/Pollution (lignes 1678-1849 de `ProductionCalculator.tsx`).

- [ ] **Step 1 : Créer `src/components/ResultSection/PollutionTable.tsx`**

Variables locales à remplacer par des props :

| Variable dans ProductionCalculator | Prop dans PollutionTable |
|---|---|
| `wasteTableData` | `wasteTableData` |
| `pollutionDistanceMode` | `pollutionDistanceMode` |
| `expandedWasteRows` | state local du composant |
| `setExpandedWasteRows(fn)` | state local du composant |
| `results` (pour `chainResult`) | `results` |

```tsx
import { useState, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { productionCalculator } from '@/lib/productionCalculator';
import { getResourceIcon } from '@/data/resourceIcons';
import { getBuildingImageUrls } from '@/data/buildingIcons';
import { getSafetyDistance, type PollutionDistanceMode } from '@/data/pollutionByBuilding';
import { Tooltip } from '@/components/Tooltip';
import type { ProductionResult } from '@/data/types';
import type { WasteTableData } from '@/hooks/useCalculationChain';

const WASTE_COMPOSITION_LABEL_KEY: Record<string, string> = {
  construction: 'waste_construction', metal_scrap: 'waste_steel', aluminium_scrap: 'waste_aluminium',
  plastic: 'waste_plastic', bio: 'waste_bio', fertilizer: 'fertiliser', burnable: 'waste_burnable',
  hazardous: 'waste_toxic', other: 'waste_other', ash: 'waste_ash',
};
const WASTE_TYPE_ORDER = ['aluminium_scrap', 'metal_scrap', 'construction', 'plastic', 'bio', 'fertilizer', 'burnable', 'hazardous', 'other', 'ash'];
const sortWasteTypes = (types: string[]) =>
  types.slice().sort((a, b) => {
    const i = WASTE_TYPE_ORDER.indexOf(a); const j = WASTE_TYPE_ORDER.indexOf(b);
    if (i === -1 && j === -1) return a.localeCompare(b);
    if (i === -1) return 1; if (j === -1) return -1;
    return i - j;
  });
const WASTE_TOTAL_ROW_KEY = '__total__';

export interface PollutionTableProps {
  wasteTableData: WasteTableData;
  results: ProductionResult[];
  pollutionDistanceMode: PollutionDistanceMode;
}

export function PollutionTable({ wasteTableData, results, pollutionDistanceMode }: PollutionTableProps) {
  const { t } = useTranslation();
  const [expandedWasteRows, setExpandedWasteRows] = useState<Set<string>>(new Set());

  // ─── COLLER ICI LE JSX DES LIGNES 1678-1849 DE ProductionCalculator.tsx ───
  // Remplacer chaque référence locale par la prop correspondante (tableau ci-dessus).
  // expandedWasteRows et setExpandedWasteRows restent en state local.
  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
      {/* Contenu copié depuis ProductionCalculator.tsx lignes 1678-1849 */}
      <p className="text-gray-400">PollutionTable — à compléter lors de l&apos;extraction</p>
    </div>
  );
}

// Silence unused import warnings until JSX is filled in
void sortWasteTypes; void WASTE_COMPOSITION_LABEL_KEY; void WASTE_TOTAL_ROW_KEY;
void getSafetyDistance; void getResourceIcon; void getBuildingImageUrls;
void productionCalculator; void Fragment;
```

- [ ] **Step 2 : Compiler pour vérifier les types**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: pas d'erreur dans `PollutionTable.tsx`

- [ ] **Step 3 : Vérifier tous les tests**

```bash
npm test
```

Expected: `9 passed`

- [ ] **Step 4 : Commit**

```bash
git add src/components/ResultSection/PollutionTable.tsx
git commit -m "feat(ui): extract PollutionTable component skeleton"
```

---

## Task 12: Créer `ResultSection` et remplir les tables

**Files:**
- Create: `src/components/ResultSection/ResultSection.tsx`
- Create: `src/components/ResultSection/ResultSection.test.tsx`
- Modify: `src/components/ResultSection/ChainTable.tsx` (remplir le JSX)
- Modify: `src/components/ResultSection/PollutionTable.tsx` (remplir le JSX)

**Étape critique :** remplir le JSX des deux tables ET créer le conteneur `ResultSection`.

- [ ] **Step 1 : Remplir le JSX de `ChainTable.tsx`**

Dans `src/components/ResultSection/ChainTable.tsx`, remplacer le commentaire TODO par le JSX des lignes **1092-1676** de `ProductionCalculator.tsx`. Appliquer les substitutions du tableau de la Task 10.

Substitutions clés à faire pendant le copier-coller :
- `setChainYear(parseInt(e.target.value, 10) || 1960)` → `onChangeYear(parseInt(e.target.value, 10) || 1960)`
- `toggleResourceDisabled(result.resourceId)` → `onToggleResource(result.resourceId)`
- `setSourceQualityForResource(rid, value)` → `onSetSourceQuality(rid, value)`
- `setBuildingForResource(rid, name)` → `onSetBuilding(rid, name)`
- `setVehicleConfigByResource((prev) => ({ ...prev, [result.resourceId]: { ...cfg, vehicleSlots: next } }))` → `onSetVehicleConfig(result.resourceId, { ...cfg, vehicleSlots: next })`
- `chargeRatioByResource` n'est utilisé que dans le calcul (le hook), pas dans le rendu — à supprimer des props si absent du JSX

- [ ] **Step 2 : Remplir le JSX de `PollutionTable.tsx`**

Dans `src/components/ResultSection/PollutionTable.tsx`, remplacer le commentaire TODO par le JSX des lignes **1678-1849** de `ProductionCalculator.tsx`. La fonction `renderCompositionTable` (définie localement dans la IIFE de ProductionCalculator, environ lignes 1600-1676) doit être déplacée dans `PollutionTable.tsx` comme fonction locale.

- [ ] **Step 3 : Créer `src/components/ResultSection/ResultSection.tsx`**

```tsx
import type { ProductionResult } from '@/data/types';
import type { MineVehicleConfig } from '@/lib/productionCalculator';
import type { PollutionDistanceMode } from '@/data/pollutionByBuilding';
import type { WasteTableData } from '@/hooks/useCalculationChain';
import { ChainTable } from './ChainTable';
import { PollutionTable } from './PollutionTable';

interface ResultSectionProps {
  results: ProductionResult[];
  disabledResources: Set<string>;
  hasAnySurplus: boolean;
  chainYear: number;
  effectiveSourceQuality: number;
  sourceQualityByResource: Record<string, number>;
  effectiveBuildingByResource: Record<string, string>;
  vehicleConfigByResource: Record<string, MineVehicleConfig>;
  totalWorkers: number;
  totalProfesors: number;
  personnelBreakdown: Array<{ sourceResourceId: string; buildingName: string; workers: number; profesors: number }>;
  wasteTableData: WasteTableData;
  pollutionDistanceMode: PollutionDistanceMode;
  onChangeYear: (year: number) => void;
  onToggleResource: (resourceId: string) => void;
  onSetSourceQuality: (resourceId: string, value: number) => void;
  onSetBuilding: (resourceId: string, buildingName: string) => void;
  onSetVehicleConfig: (resourceId: string, cfg: MineVehicleConfig) => void;
}

export function ResultSection({
  results,
  disabledResources,
  hasAnySurplus,
  chainYear,
  effectiveSourceQuality,
  sourceQualityByResource,
  effectiveBuildingByResource,
  vehicleConfigByResource,
  totalWorkers,
  totalProfesors,
  personnelBreakdown,
  wasteTableData,
  pollutionDistanceMode,
  onChangeYear,
  onToggleResource,
  onSetSourceQuality,
  onSetBuilding,
  onSetVehicleConfig,
}: ResultSectionProps) {
  if (results.length === 0) return null;

  const showPollutionTable = wasteTableData.rows.length > 0;

  return (
    <>
      <ChainTable
        results={results}
        disabledResources={disabledResources}
        hasAnySurplus={hasAnySurplus}
        chainYear={chainYear}
        effectiveSourceQuality={effectiveSourceQuality}
        sourceQualityByResource={sourceQualityByResource}
        effectiveBuildingByResource={effectiveBuildingByResource}
        vehicleConfigByResource={vehicleConfigByResource}
        totalWorkers={totalWorkers}
        totalProfesors={totalProfesors}
        personnelBreakdown={personnelBreakdown}
        onChangeYear={onChangeYear}
        onToggleResource={onToggleResource}
        onSetSourceQuality={onSetSourceQuality}
        onSetBuilding={onSetBuilding}
        onSetVehicleConfig={onSetVehicleConfig}
      />
      {showPollutionTable && (
        <PollutionTable
          wasteTableData={wasteTableData}
          results={results}
          pollutionDistanceMode={pollutionDistanceMode}
        />
      )}
    </>
  );
}
```

- [ ] **Step 4 : Écrire le test de `ResultSection` (`src/components/ResultSection/ResultSection.test.tsx`)**

```tsx
import { render, screen } from '@testing-library/react';
import { ResultSection } from './ResultSection';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import type { WasteTableData } from '@/hooks/useCalculationChain';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const EMPTY_WASTE_DATA: WasteTableData = {
  rows: [],
  totals: { sewagePerDay: 0, mixedPerDay: 0, hazardousPerDay: 0, mixedComposition: {}, hazardousComposition: {} },
  pollutionMin: undefined, pollutionMax: undefined,
  distanceMin: undefined, distanceMax: undefined,
};

describe('ResultSection', () => {
  it('ne rend rien si results est vide', () => {
    const { container } = render(
      <ResultSection
        results={[]}
        disabledResources={new Set()}
        hasAnySurplus={false}
        chainYear={1960}
        effectiveSourceQuality={50}
        sourceQualityByResource={{}}
        effectiveBuildingByResource={{}}
        vehicleConfigByResource={{}}
        totalWorkers={0}
        totalProfesors={0}
        personnelBreakdown={[]}
        wasteTableData={EMPTY_WASTE_DATA}
        pollutionDistanceMode="q80_min"
        onChangeYear={() => {}}
        onToggleResource={() => {}}
        onSetSourceQuality={() => {}}
        onSetBuilding={() => {}}
        onSetVehicleConfig={() => {}}
      />,
      { wrapper }
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 5 : Lancer les tests**

```bash
npx vitest run src/components/ResultSection/
```

Expected: `1 passed`

- [ ] **Step 6 : Vérifier tous les tests**

```bash
npm test
```

Expected: `10 passed`

- [ ] **Step 7 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 erreurs

- [ ] **Step 8 : Commit**

```bash
git add src/components/ResultSection/
git commit -m "feat(ui): extract ResultSection, ChainTable and PollutionTable components"
```

---

## Task 13: Câbler l'orchestrateur — remplacer `ProductionCalculator.tsx`

**Files:**
- Modify: `src/components/ProductionCalculator.tsx` (remplacement complet)

C'est l'étape finale : remplacer les 1972 lignes de `ProductionCalculator.tsx` par l'orchestrateur mince qui câble les hooks aux composants. Le comportement visible reste identique.

- [ ] **Step 1 : Lire les tests existants pour comprendre ce qui doit continuer à fonctionner**

```bash
npx vitest run
```

Expected: tous les tests passent avant de toucher quoi que ce soit.

- [ ] **Step 2 : Remplacer `src/components/ProductionCalculator.tsx` par l'orchestrateur**

```tsx
import { useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/stores/useStore';
import { useProductionGoals, goalsFromPlan, createInitialGoal } from '@/hooks/useProductionGoals';
import { useChainSettings, settingsFromPlan } from '@/hooks/useChainSettings';
import { useSavedPlans } from '@/hooks/useSavedPlans';
import { useUrlSync } from '@/hooks/useUrlSync';
import { useCalculationChain } from '@/hooks/useCalculationChain';
import { getResourceName } from '@/data/productions';
import type { PlanStateSerialized } from '@/lib/planUrl';
import { GoalList } from '@/components/GoalList/GoalList';
import { PlansPanel } from '@/components/PlansPanel/PlansPanel';
import { ResultSection } from '@/components/ResultSection/ResultSection';

export type { ProductionGoal } from '@/data/types';

function generatePlanName(state: PlanStateSerialized, t: (key: string) => string): string {
  if (!state.g?.length) return t('industry.unnamed');
  const names = state.g.map((g) => t(`resources.${g.resourceId}`)).filter(Boolean);
  return [...new Set(names)].join(', ') || t('industry.unnamed');
}

function buildPlanState(
  goals: ReturnType<typeof useProductionGoals>['goals'],
  settings: ReturnType<typeof useChainSettings>,
  store: { year: number; sourceQuality: number }
): PlanStateSerialized {
  const g = goals
    .filter((g) => g.resourceId && g.buildingName)
    .map((g) => ({ resourceId: g.resourceId, buildingName: g.buildingName, inputType: g.inputType, value: g.value }));
  if (g.length === 0) return { g };
  const vc: Record<string, { vehicleSlots: (string | null)[]; allowPersonnel: boolean }> = {};
  Object.entries(settings.vehicleConfigByResource).forEach(([rid, cfg]) => {
    vc[rid] = { vehicleSlots: cfg.vehicleSlots, allowPersonnel: cfg.allowPersonnel };
  });
  const effectiveSourceQuality = settings.sourceQualityFromPlan ?? store.sourceQuality;
  return {
    g,
    y: settings.chainYear,
    sq: effectiveSourceQuality,
    sqr: Object.keys(settings.sourceQualityByResource).length ? settings.sourceQualityByResource : undefined,
    br: Object.keys(settings.buildingByResource).length ? settings.buildingByResource : undefined,
    vc: Object.keys(vc).length ? vc : undefined,
    cr: Object.keys(settings.chargeRatioByResource).length ? settings.chargeRatioByResource : undefined,
    d: settings.disabledResources.size ? Array.from(settings.disabledResources) : undefined,
  };
}

export function ProductionCalculator() {
  const { t, i18n } = useTranslation();
  const sourceQuality = useStore((state) => state.sourceQuality);
  const defaultYear = useStore((state) => state.year);
  const defaultVehicleId = useStore((state) => state.defaultVehicleId);
  const defaultBuildingByResource = useStore((state) => state.defaultBuildingByResource);
  const pollutionDistanceMode = useStore((state) => state.pollutionDistanceMode);

  const goals = useProductionGoals(defaultBuildingByResource);
  const settings = useChainSettings(defaultYear);
  const plans = useSavedPlans(i18n.language);

  const effectiveBuildingByResource = useMemo(
    () => ({ ...defaultBuildingByResource, ...settings.buildingByResource }),
    [defaultBuildingByResource, settings.buildingByResource]
  );

  const effectiveSourceQuality = settings.sourceQualityFromPlan ?? sourceQuality;

  const currentPlanState = useMemo(
    () => buildPlanState(goals.goals, settings, { year: defaultYear, sourceQuality }),
    [goals.goals, settings, defaultYear, sourceQuality]
  );

  const { initialPlanState } = useUrlSync(currentPlanState);

  const chain = useCalculationChain(goals.goals, settings, {
    sourceQuality,
    defaultVehicleId,
    defaultBuildingByResource,
  });

  // Initialisation depuis l'URL au premier montage
  const hasInitRef = useRef(false);
  useEffect(() => {
    if (hasInitRef.current) return;
    hasInitRef.current = true;
    if (initialPlanState) {
      goals.setGoals(goalsFromPlan(initialPlanState.g));
      settings.loadSettings(settingsFromPlan(initialPlanState));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Créer un plan initial si aucun n'existe encore
  const hasCreatedInitialPlanRef = useRef(false);
  useEffect(() => {
    if (hasCreatedInitialPlanRef.current) return;
    if (plans.savedPlansList.length === 0 && currentPlanState.g.length > 0) {
      hasCreatedInitialPlanRef.current = true;
      plans.saveCurrentPlan(generatePlanName(currentPlanState, t), currentPlanState);
    }
  }, [currentPlanState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave debouncé
  useEffect(() => {
    plans.autosave(currentPlanState);
  }, [currentPlanState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Réinitialiser les ressources désactivées quand les goals de base changent
  useEffect(() => {
    settings.resetSettings(settings.chainYear);
  }, [goals.goals.map((g) => g.resourceId).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const allProductions = useMemo(
    () =>
      [...(productionCalculator as unknown as { getAllProductions(): Iterable<{ resourceId: string; resourceName: string; recipes: unknown[] }> }).getAllProductions()].sort((a, b) =>
        t(`resources.${a.resourceId}`).localeCompare(t(`resources.${b.resourceId}`))
      ),
    [t]
  );

  const handleLoadPlan = (id: string) => {
    const planState = plans.loadPlan(id);
    if (planState) {
      goals.setGoals(goalsFromPlan(planState.g));
      settings.loadSettings(settingsFromPlan(planState));
    }
  };

  const handleNewPlan = () => {
    const defaultGoal = createInitialGoal('steel', defaultBuildingByResource);
    const defaultState: PlanStateSerialized = {
      g: [{ resourceId: defaultGoal.resourceId, buildingName: defaultGoal.buildingName, inputType: defaultGoal.inputType, value: defaultGoal.value }],
      y: defaultYear,
    };
    plans.handleNewPlan(defaultState, (s) => generatePlanName(s, t));
    goals.setGoals(goalsFromPlan(defaultState.g));
    settings.resetSettings(defaultYear);
  };

  const handleDuplicatePlan = (id: string) => {
    const planState = plans.duplicatePlan(id, (name) => t('industry.copyOf', { name }));
    if (planState) {
      goals.setGoals(goalsFromPlan(planState.g));
      settings.loadSettings(settingsFromPlan(planState));
    }
  };

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0 space-y-6">
        <GoalList
          goals={goals.goals}
          allProductions={allProductions as never}
          effectiveBuildingByResource={effectiveBuildingByResource}
          onAddGoal={() => {
            const first = allProductions[0];
            if (first) goals.addGoal(first.resourceId);
          }}
          onRemoveGoal={goals.removeGoal}
          onUpdateGoal={goals.updateGoal}
          onSetGoalResource={(goalId, resourceId) => goals.setGoalResource(goalId, resourceId, effectiveBuildingByResource)}
        />

        {chain.results.length > 0 && (
          <ResultSection
            results={chain.results}
            disabledResources={settings.disabledResources}
            hasAnySurplus={chain.hasAnySurplus}
            chainYear={settings.chainYear}
            effectiveSourceQuality={effectiveSourceQuality}
            sourceQualityByResource={settings.sourceQualityByResource}
            effectiveBuildingByResource={effectiveBuildingByResource}
            vehicleConfigByResource={settings.vehicleConfigByResource}
            totalWorkers={chain.totalWorkers}
            totalProfesors={chain.totalProfesors}
            personnelBreakdown={chain.personnelBreakdown}
            wasteTableData={chain.wasteTableData}
            pollutionDistanceMode={pollutionDistanceMode}
            onChangeYear={settings.setChainYear}
            onToggleResource={(id) => settings.toggleResource(id, chain.fullChainResults)}
            onSetSourceQuality={settings.setSourceQuality}
            onSetBuilding={settings.setBuilding}
            onSetVehicleConfig={settings.setVehicleConfig}
          />
        )}
      </div>

      <PlansPanel
        savedPlansList={plans.savedPlansList}
        currentPlanId={plans.currentPlanId}
        onNewPlan={handleNewPlan}
        onLoadPlan={handleLoadPlan}
        onDeletePlan={plans.deletePlan}
        onRenamePlan={plans.renamePlan}
        onDuplicatePlan={handleDuplicatePlan}
      />
    </div>
  );
}
```

**Note :** L'import manquant `productionCalculator` dans l'orchestrateur doit être ajouté. Remplacer la ligne `allProductions` par :

```tsx
import { productionCalculator } from '@/lib/productionCalculator';
// ...
const allProductions = useMemo(
  () =>
    [...productionCalculator.getAllProductions()].sort((a, b) =>
      t(`resources.${a.resourceId}`).localeCompare(t(`resources.${b.resourceId}`))
    ),
  [t]
);
```

- [ ] **Step 3 : Compiler**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Corriger les erreurs TypeScript une par une. Les erreurs les plus communes :
- Import manquant → ajouter l'import
- Type incompatible sur `allProductions as never` → utiliser `as ResourceProduction[]` avec l'import correct
- `getResourceName` non utilisé → supprimer

- [ ] **Step 4 : Lancer tous les tests**

```bash
npm test
```

Expected: `10 passed`

- [ ] **Step 5 : Lancer le build complet**

```bash
npm run build 2>&1 | tail -20
```

Expected: `built in Xs`

- [ ] **Step 6 : Commit**

```bash
git add src/components/ProductionCalculator.tsx
git commit -m "refactor(calculator): wire hooks and components into slim orchestrator"
```

---

## Task 14: Vérification finale

**Files:** aucun

- [ ] **Step 1 : Lancer tous les tests**

```bash
npm test
```

Expected: tous passent.

- [ ] **Step 2 : Vérifier la taille du fichier orchestrateur**

```bash
wc -l src/components/ProductionCalculator.tsx
```

Expected: < 150 lignes.

- [ ] **Step 3 : Vérifier la taille des nouveaux fichiers**

```bash
wc -l src/hooks/*.ts src/components/GoalList/*.tsx src/components/PlansPanel/*.tsx src/components/ResultSection/*.tsx | sort -rn | head -20
```

Expected: aucun fichier > 400 lignes (sauf ChainTable qui peut aller jusqu'à ~600 lignes).

- [ ] **Step 4 : Lancer le lint**

```bash
npm run lint 2>&1 | tail -20
```

Corriger les avertissements ESLint restants (imports inutilisés, etc.).

- [ ] **Step 5 : Build final**

```bash
npm run build 2>&1 | tail -10
```

Expected: build réussi, 0 erreur.

- [ ] **Step 6 : Commit final**

```bash
git add -A
git commit -m "refactor(calculator): complete ProductionCalculator decomposition"
```

---

## Récapitulatif des phases

| Phase | Tasks | Risque | Rollback |
|---|---|---|---|
| Setup | 0–2 | Faible | `git revert` |
| Hooks | 3–7 | Faible | Les hooks sont des fichiers nouveaux, n'affectent pas l'existant |
| Composants | 8–12 | Moyen | Chaque composant est créé avant d'être utilisé |
| Câblage | 13 | Élevé | `git checkout src/components/ProductionCalculator.tsx` restaure l'original |
| Vérification | 14 | — | — |

**Invariant de sécurité :** après chaque task, `npm test` doit passer. Si un test casse, ne pas continuer à la task suivante.
