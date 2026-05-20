# Design : Refactoring de ProductionCalculator.tsx

**Date :** 2026-05-20  
**Statut :** Approuvé  
**Auteur :** Lead Dev (session brainstorming)

---

## Contexte et problème

`ProductionCalculator.tsx` fait actuellement **1 972 lignes**. Ce God Component cumule :

- Gestion des objectifs de production (goals)
- CRUD des plans sauvegardés (localStorage)
- Synchronisation bidirectionnelle URL ↔ état
- Lancement et memoïsation du calcul de chaîne
- Gestion des overrides par chaîne (qualité source, véhicules, charge)
- Rendu de 6+ tables de résultats
- State UI local (rename inline, panels ouverts/fermés, sorts)

Conséquences directes :

- **Aucun test UI possible** sur ce composant monolithique
- **Risque de régression élevé** à chaque modification
- **Onboarding difficile** pour tout nouveau développeur

---

## Objectif

Décomposer le composant en une architecture en couches, où :

1. La **logique d'état** est dans des custom hooks testables indépendamment
2. Les **composants visuels** sont purs (props in, callbacks out), sans accès au store
3. L'**orchestrateur** est réduit à ~80 lignes de câblage

---

## Architecture cible

### Structure des fichiers

```
src/
├── components/
│   ├── ProductionCalculator.tsx         ← orchestrateur mince (~80 lignes)
│   ├── GoalList/
│   │   ├── GoalList.tsx                 ← liste des objectifs de production
│   │   ├── GoalItem.tsx                 ← un objectif (ResourcePicker + BuildingPicker + valeur)
│   │   └── GoalList.test.tsx
│   ├── PlansPanel/
│   │   ├── PlansPanel.tsx               ← sidebar plans sauvegardés
│   │   └── PlansPanel.test.tsx
│   └── ResultSection/
│       ├── ResultSection.tsx            ← conteneur des 6 tables de résultats
│       ├── BuildingsTable.tsx
│       ├── WorkersTable.tsx
│       ├── ResourcesTable.tsx
│       ├── VehiclesTable.tsx
│       ├── MinesTable.tsx
│       ├── PollutionTable.tsx
│       └── ResultSection.test.tsx
│
└── hooks/
    ├── useProductionGoals.ts
    ├── useProductionGoals.test.ts
    ├── useSavedPlans.ts
    ├── useSavedPlans.test.ts
    ├── useUrlSync.ts
    ├── useUrlSync.test.ts
    ├── useChainSettings.ts
    ├── useChainSettings.test.ts
    ├── useCalculationChain.ts
    └── useCalculationChain.test.ts
```

### Flux de données

```
Zustand store (settings globaux: sourceQuality, year, vehicleId, …)
        ↓
  Custom hooks (state + logique métier)   ←→   URL / localStorage
        ↓
  ProductionCalculator (orchestrateur — câblage uniquement)
        ↓
  Composants purs (props in, callbacks out — zéro accès au store)
```

---

## Couche 1 — Custom Hooks

### `useProductionGoals`

Gère la liste des objectifs de production. N'a pas connaissance des plans sauvegardés ni de l'URL.

```ts
interface UseProductionGoalsReturn {
  goals: ProductionGoal[];
  addGoal: (resourceId?: string) => void;
  removeGoal: (id: string) => void;
  updateGoal: (id: string, patch: Partial<ProductionGoal>) => void;
  setGoals: (goals: ProductionGoal[]) => void;  // pour chargement plan
}
```

### `useChainSettings`

Gère tous les overrides par chaîne : ressources désactivées, qualité source par ressource, configs véhicules, ratios de charge.

```ts
interface ChainSettingsState {
  disabledResources: Set<string>;
  sourceQualityByResource: Record<string, number>;
  vehicleConfigByResource: Record<string, MineVehicleConfig>;
  chargeRatioByResource: Record<string, number>;
}

interface UseChainSettingsReturn extends ChainSettingsState {
  toggleResource: (id: string) => void;
  setSourceQuality: (id: string, q: number) => void;
  setVehicleConfig: (id: string, cfg: MineVehicleConfig) => void;
  setChargeRatio: (id: string, ratio: number) => void;
  loadSettings: (partial: Partial<ChainSettingsState>) => void;
  resetSettings: () => void;
}
```

### `useSavedPlans`

Orchestre `src/lib/savedPlans.ts`. Maintient la liste réactive et le `currentPlanId`.

```ts
interface UseSavedPlansReturn {
  savedPlansList: SavedPlan[];
  currentPlanId: string | null;
  saveCurrentPlan: (name: string, planState: PlanStateSerialized) => void;
  loadPlan: (id: string) => PlanStateSerialized | null;
  deletePlan: (id: string) => void;
  renamePlan: (id: string, name: string) => void;
  duplicatePlan: (id: string) => void;
}
```

### `useUrlSync`

Effet de bord pur. Lit le plan depuis l'URL au montage (une seule fois), écrit l'URL à chaque changement d'état.

```ts
function useUrlSync(
  goals: ProductionGoal[],
  settings: ChainSettingsState,
  store: StoreSnapshot
): { initialPlanState: PlanStateSerialized | null }
```

La valeur retournée `initialPlanState` est stable après le premier rendu. L'orchestrateur l'utilise dans un `useEffect` avec dépendance vide pour initialiser goals et settings.

### `useCalculationChain`

Orchestre `productionCalculator.calculateProductionChain`, `sortProductionChain`, et `aggregateResults`. Retourne les résultats memoïsés — ne recalcule que si les inputs changent.

```ts
interface UseCalculationChainReturn {
  aggregatedResults: ProductionResult[];
  rawChain: ProductionResult[];
}

function useCalculationChain(
  goals: ProductionGoal[],
  settings: ChainSettingsState,
  store: StoreSnapshot
): UseCalculationChainReturn
```

---

## Couche 2 — Composants purs

### `GoalItem` (~100 lignes)

Un objectif de production. Contient `ResourcePicker`, `BuildingPicker`, le sélecteur type/valeur, et le bouton supprimer.

Props : `goal`, `onUpdate(patch)`, `onRemove()`, plus les données de recettes disponibles passées depuis l'extérieur.

### `GoalList` (~60 lignes)

Rend la liste des `GoalItem` + bouton "Ajouter un objectif".

Props : `goals[]`, `onAdd()`, `onRemove(id)`, `onUpdate(id, patch)`.

### `PlansPanel` (~200 lignes)

Sidebar de gestion des plans sauvegardés. Maintient son **propre state UI local** (id du plan en cours de renommage, valeur de l'input inline).

Props : `savedPlansList[]`, `currentPlanId`, callbacks CRUD (`onSave`, `onLoad`, `onDelete`, `onRename`, `onDuplicate`, `onShare`).

### Tables de résultats

Chacune reçoit ses lignes déjà filtrées et triées. Aucun accès au store ni au moteur de calcul.

| Composant | Props clés | Callbacks |
|---|---|---|
| `BuildingsTable` | `rows: ProductionResult[]` | `onToggle`, `onVehicleConfig`, `onChargeRatio` |
| `WorkersTable` | `rows: ProductionResult[]` | — |
| `ResourcesTable` | `rows: ProductionResult[]` | — |
| `VehiclesTable` | `rows: ProductionResult[]` | — |
| `MinesTable` | `rows: ProductionResult[]` | `onSourceQuality` |
| `PollutionTable` | `rows: ProductionResult[]` | — |

### `ResultSection` (~150 lignes)

Conteneur des 6 tables. Filtre les `aggregatedResults` et distribue aux tables concernées. Reçoit aussi `chainSettings` et les callbacks pour les passer aux tables qui en ont besoin.

---

## Couche 3 — Orchestrateur mince

```tsx
export function ProductionCalculator() {
  const store = useStore();
  const goals = useProductionGoals();
  const settings = useChainSettings();
  const plans = useSavedPlans();
  const { initialPlanState } = useUrlSync(goals.goals, settings, store);
  const { aggregatedResults } = useCalculationChain(goals.goals, settings, store);

  // Initialisation depuis URL au montage (une seule fois)
  useEffect(() => {
    if (initialPlanState) {
      goals.setGoals(goalsFromPlan(initialPlanState.g));
      settings.loadSettings(settingsFromPlan(initialPlanState));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen">
      <PlansPanel
        {...plans}
        onSave={(name) => plans.saveCurrentPlan(name, buildPlanState(goals.goals, settings, store))}
      />
      <main className="flex-1 overflow-y-auto">
        <GoalList {...goals} />
        <ResultSection
          results={aggregatedResults}
          settings={settings}
          onToggleResource={settings.toggleResource}
          onSourceQuality={settings.setSourceQuality}
          onVehicleConfig={settings.setVehicleConfig}
          onChargeRatio={settings.setChargeRatio}
        />
      </main>
    </div>
  );
}
```

---

## Stratégie de tests

### Priorité 1 — Hooks (logique métier, testables sans rendu)

| Hook | Cas à tester |
|---|---|
| `useProductionGoals` | add, remove, update, setGoals |
| `useChainSettings` | toggle, set, load, reset |
| `useSavedPlans` | save, load, delete, rename, duplicate (mock localStorage) |
| `useUrlSync` | lecture URL au montage, écriture URL au changement (mock window.location) |
| `useCalculationChain` | intégration avec données réelles (réutilise les fixtures des tests existants) |

### Priorité 2 — Composants (rendu + interactions)

| Composant | Cas à tester |
|---|---|
| `GoalList` | rend la liste, bouton add déclenche callback, remove déclenche callback |
| `PlansPanel` | rend les plans, rename inline, confirme/annule avec Enter/Escape |
| Tables | rendent les lignes à partir d'une fixture `ProductionResult[]` |

### Outillage

- `@testing-library/react` avec `renderHook` pour les hooks
- `vi.spyOn(localStorage, 'getItem')` pour `useSavedPlans`
- `vi.stubGlobal('window', ...)` pour `useUrlSync`
- Fixtures partagées dans `src/__fixtures__/` pour les `ProductionResult[]` de test

---

## Plan de migration (phases)

Le refacto est exécuté **en incréments**, chacun livrant un état stable et testable.

| Phase | Contenu | Risque |
|---|---|---|
| 1 | Extraire les 5 hooks (zéro changement UI) | Faible |
| 2 | Extraire les 6 tables en composants purs | Faible |
| 3 | Extraire `GoalList` + `GoalItem` | Moyen |
| 4 | Extraire `PlansPanel` | Moyen |
| 5 | Simplifier l'orchestrateur | Faible |
| 6 | Ajouter les tests manquants | — |

À chaque phase : `npm test` doit passer. Le comportement utilisateur ne change pas.

---

## Contraintes et non-objectifs

- **Aucune modification du comportement visible** : ceci est un refacto pur
- **Compatibilité URL maintenue** : `planUrl.ts` n'est pas modifié
- **Tests existants non modifiés** (règle CLAUDE.md)
- **Pas de changement de style CSS** dans ce refacto
- **`productionCalculator.ts` non modifié** dans ce chantier (dette séparée)
