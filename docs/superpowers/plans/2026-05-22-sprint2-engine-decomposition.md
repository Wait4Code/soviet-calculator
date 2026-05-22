# Sprint 2 — Engine Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break `src/lib/productionCalculator.ts` (1 466 lines) into focused, independently testable modules, while keeping the public API unchanged.

**Architecture:** Extract pure functions from the God Object into a `src/lib/calculator/` directory. `productionCalculator.ts` becomes a thin facade that re-exports everything and delegates to the modules. No external import paths change — all consumers keep `import { productionCalculator } from '@/lib/productionCalculator'`. Each extracted module gets its own test file.

**Tech Stack:** TypeScript, Vitest

**Prerequisite:** Sprint 1 completed (test coverage configured — use `npm run test:coverage` to verify coverage gains after each task).

---

## File map

| New file | Extracted from productionCalculator.ts | Lines (approx.) |
|---|---|---|
| `src/lib/calculator/helpers.ts` | `clamp`, `getProductionFactor`, `getConsumptionFactor`, `getSourceQuality`, `getDefaultBuilding`, `getYear`, `getEffectiveChargeRatio` | ~60 |
| `src/lib/calculator/vehicleUtils.ts` | `getDefaultMineVehicleConfig`, `computeVehicleCapacity`, `migrateVehicleConfig`, `getMineVehicleConfig` | ~70 |
| `src/lib/calculator/buildingCalculator.ts` | `calculateBuildingsAndWorkers`, `calculateRequirementsForBuildings` | ~300 |
| `src/lib/calculator/chainResolver.ts` | `calculateForResource`, `calculateChain`, `getResourcesThatDependOnDisabled` | ~700 |
| `src/lib/productionCalculator.ts` (trimmed) | Facade: class + re-exports only | ~100 |

---

## Task 1: Extract `helpers.ts`

**Files:**
- Create: `src/lib/calculator/helpers.ts`
- Create: `src/lib/calculator/__tests__/helpers.test.ts`
- Modify: `src/lib/productionCalculator.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/calculator/__tests__/helpers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  clamp,
  getProductionFactor,
  getConsumptionFactor,
} from '../helpers';

describe('clamp', () => {
  it('returns min when value is below', () => expect(clamp(-5, 0, 10)).toBe(0));
  it('returns max when value is above', () => expect(clamp(15, 0, 10)).toBe(10));
  it('returns value when within range', () => expect(clamp(5, 0, 10)).toBe(5));
});

describe('getProductionFactor', () => {
  // formula: clamp(1 - (year - p1) / p2, p3, 1)
  it('returns 1 in base year', () => {
    expect(getProductionFactor(1960, { p1: 1960, p2: 10, p3: 0.5 })).toBe(1);
  });
  it('decreases after base year', () => {
    const f = getProductionFactor(1970, { p1: 1960, p2: 10, p3: 0.5 });
    expect(f).toBe(0.5); // 1 - (1970-1960)/10 = 0, clamped to p3=0.5
  });
  it('never drops below p3', () => {
    const f = getProductionFactor(2000, { p1: 1960, p2: 10, p3: 0.3 });
    expect(f).toBe(0.3);
  });
});

describe('getConsumptionFactor', () => {
  // formula: 1 + clamp((year - p1) / p2, 0, p3)
  it('returns 1 in base year', () => {
    expect(getConsumptionFactor(1960, { p1: 1960, p2: 10, p3: 0.5 })).toBe(1);
  });
  it('increases after base year', () => {
    const f = getConsumptionFactor(1970, { p1: 1960, p2: 10, p3: 0.5 });
    expect(f).toBe(1.5); // 1 + clamp(1, 0, 0.5) = 1.5
  });
  it('never exceeds 1 + p3', () => {
    const f = getConsumptionFactor(2000, { p1: 1960, p2: 10, p3: 0.5 });
    expect(f).toBe(1.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/calculator/__tests__/helpers.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/calculator/helpers.ts`**

Copy the following functions verbatim from `src/lib/productionCalculator.ts` (lines 49–93):

```ts
import type { CalculationConfig } from '@/lib/productionCalculator';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getProductionFactor(year: number, params: { p1: number; p2: number; p3: number }): number {
  const raw = 1 - (year - params.p1) / params.p2;
  return clamp(raw, params.p3, 1);
}

export function getConsumptionFactor(year: number, params: { p1: number; p2: number; p3: number }): number {
  const raw = (year - params.p1) / params.p2;
  return 1 + clamp(raw, 0, params.p3);
}

export function getSourceQuality(config: CalculationConfig, resourceId: string): number {
  return config.sourceQualityByResource?.[resourceId] ?? config.sourceQuality ?? 50;
}

export function getDefaultBuilding(
  config: CalculationConfig,
  resourceId: string,
  recipes: import('@/data/types').ProductionRecipe[]
): string {
  if (recipes.length === 0) return '';
  const def = config.defaultBuildingByResource?.[resourceId];
  if (def && recipes.some((r) => r.name === def)) return def;
  return recipes[0].name;
}

export function getYear(config: CalculationConfig): number {
  return config.year ?? 1960;
}

export function getEffectiveChargeRatio(
  config: CalculationConfig,
  resourceId: string,
  calculated: number
): number {
  const override = config.chargeRatioByResource?.[resourceId];
  if (override === undefined) return calculated;
  return Math.max(calculated, Math.min(1, override));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/calculator/__tests__/helpers.test.ts
```

Expected: 9 tests PASS.

- [ ] **Step 5: Replace the functions in `productionCalculator.ts` with imports**

At the top of `src/lib/productionCalculator.ts`, add:

```ts
import { clamp, getProductionFactor, getConsumptionFactor, getSourceQuality, getDefaultBuilding, getYear, getEffectiveChargeRatio } from '@/lib/calculator/helpers';
```

Delete the 7 function definitions (lines 49–93) from `productionCalculator.ts`. Keep the rest of the file unchanged.

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/calculator/helpers.ts src/lib/calculator/__tests__/helpers.test.ts src/lib/productionCalculator.ts
git commit -m "refactor(calculator): extract pure helpers to lib/calculator/helpers.ts"
```

---

## Task 2: Extract `vehicleUtils.ts`

**Files:**
- Create: `src/lib/calculator/vehicleUtils.ts`
- Create: `src/lib/calculator/__tests__/vehicleUtils.test.ts`
- Modify: `src/lib/productionCalculator.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/calculator/__tests__/vehicleUtils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { migrateVehicleConfig, computeVehicleCapacity } from '../vehicleUtils';

describe('migrateVehicleConfig', () => {
  it('passes through already-migrated config (has vehicleSlots)', () => {
    const cfg = { vehicleSlots: ['e-10011d', null], allowPersonnel: false };
    expect(migrateVehicleConfig(cfg, 2, 'e-10011d')).toBe(cfg);
  });

  it('migrates old format with vehicles array', () => {
    const old = { vehicles: [{ vehicleId: 'e-10011d', count: 2 }], allowPersonnel: true } as unknown as import('@/lib/productionCalculator').MineVehicleConfig;
    const result = migrateVehicleConfig(old, 3, 'e-10011d');
    expect(result.vehicleSlots).toEqual(['e-10011d', 'e-10011d', null]);
    expect(result.allowPersonnel).toBe(true);
  });

  it('returns default config when format is unrecognized', () => {
    const bad = {} as import('@/lib/productionCalculator').MineVehicleConfig;
    const result = migrateVehicleConfig(bad, 2, 'e-10011d');
    expect(result.vehicleSlots).toHaveLength(2);
  });
});

describe('computeVehicleCapacity', () => {
  it('returns 0 for empty slots', () => {
    expect(computeVehicleCapacity([null, null], 'excavator')).toBe(0);
  });

  it('sums skill levels of filled slots', () => {
    // e-10011d is a real vehicle in vehicles.json — use it
    const result = computeVehicleCapacity(['e-10011d'], 'excavator');
    expect(result).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/calculator/__tests__/vehicleUtils.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/calculator/vehicleUtils.ts`**

Copy the four vehicle functions verbatim from `src/lib/productionCalculator.ts` (lines 97–150) and add exports:

```ts
import { getVehicle, getVehicleSkillLevel } from '@/data/vehicles';
import type { ProductionRecipe } from '@/data/types';
import type { MineVehicleConfig, CalculationConfig } from '@/lib/productionCalculator';

export function getDefaultMineVehicleConfig(
  recipe: Pick<ProductionRecipe, 'maxVehicles'>,
  defaultVehicleId: string
): MineVehicleConfig {
  const maxVehicles = recipe.maxVehicles ?? 0;
  return {
    vehicleSlots: Array(maxVehicles).fill(defaultVehicleId),
    allowPersonnel: false,
  };
}

export function migrateVehicleConfig(
  old: MineVehicleConfig,
  maxVehicles: number,
  defaultVehicleId: string
): MineVehicleConfig {
  if ('vehicleSlots' in old && Array.isArray(old.vehicleSlots)) return old;
  if ('vehicles' in old && Array.isArray((old as { vehicles?: { vehicleId: string; count: number }[] }).vehicles)) {
    const vehicles = (old as { vehicles: { vehicleId: string; count: number }[] }).vehicles;
    const slots: (string | null)[] = [];
    for (const v of vehicles) {
      for (let i = 0; i < v.count && slots.length < maxVehicles; i++) {
        slots.push(v.vehicleId);
      }
    }
    while (slots.length < maxVehicles) slots.push(null);
    return { vehicleSlots: slots.slice(0, maxVehicles), allowPersonnel: old.allowPersonnel };
  }
  return getDefaultMineVehicleConfig({ maxVehicles }, defaultVehicleId);
}

export function computeVehicleCapacity(vehicleSlots: (string | null)[], skill: string): number {
  let total = 0;
  for (const vehicleId of vehicleSlots) {
    if (vehicleId) {
      const vehicle = getVehicle(vehicleId);
      if (vehicle) total += getVehicleSkillLevel(vehicle, skill);
    }
  }
  return total;
}

export function getMineVehicleConfig(
  config: CalculationConfig,
  resourceId: string,
  recipe: ProductionRecipe
): MineVehicleConfig {
  const override = config.vehicleConfigByResource?.[resourceId];
  const defaultVehicleId = config.defaultVehicleId ?? 'e-10011d';
  const maxVehicles = recipe.maxVehicles ?? 0;
  if (override) return migrateVehicleConfig(override, maxVehicles, defaultVehicleId);
  return getDefaultMineVehicleConfig(recipe, defaultVehicleId);
}
```

- [ ] **Step 4: Update `productionCalculator.ts`**

Add imports and delete the 4 function bodies (lines 97–150). The existing `export function migrateVehicleConfig` must stay re-exported for backward compat — replace its body with a delegation:

```ts
import { getDefaultMineVehicleConfig, migrateVehicleConfig as _migrateVehicleConfig, computeVehicleCapacity, getMineVehicleConfig } from '@/lib/calculator/vehicleUtils';

/** @deprecated use @/lib/calculator/vehicleUtils directly */
export function migrateVehicleConfig(old: MineVehicleConfig, maxVehicles: number, defaultVehicleId: string): MineVehicleConfig {
  return _migrateVehicleConfig(old, maxVehicles, defaultVehicleId);
}
```

Internal usages of `getDefaultMineVehicleConfig`, `computeVehicleCapacity`, `getMineVehicleConfig` in the class methods stay as-is (they now resolve via the import).

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/calculator/vehicleUtils.ts src/lib/calculator/__tests__/vehicleUtils.test.ts src/lib/productionCalculator.ts
git commit -m "refactor(calculator): extract vehicle utilities to lib/calculator/vehicleUtils.ts"
```

---

## Task 3: Extract `buildingCalculator.ts`

**Files:**
- Create: `src/lib/calculator/buildingCalculator.ts`
- Create: `src/lib/calculator/__tests__/buildingCalculator.test.ts`
- Modify: `src/lib/productionCalculator.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/calculator/__tests__/buildingCalculator.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculateBuildingsAndWorkers } from '../buildingCalculator';
import { productions } from '@/data/productions';

describe('calculateBuildingsAndWorkers', () => {
  const coalRecipes = productions.get('coal')!.recipes;
  const coalMine = coalRecipes[0]; // coal_mine

  it('calculates building count for a coal mine at 50% quality', () => {
    const result = calculateBuildingsAndWorkers(coalMine, 656, 'coal', 50);
    expect(result.buildingCount).toBe(2);
  });

  it('returns chargeRatio between 0 and 1', () => {
    const result = calculateBuildingsAndWorkers(coalMine, 100, 'coal', 50);
    expect(result.chargeRatio).toBeGreaterThan(0);
    expect(result.chargeRatio).toBeLessThanOrEqual(1);
  });

  it('returns invalidConfig for quarry with no vehicles and no personnel', () => {
    const gravelRecipes = productions.get('gravel')!.recipes;
    const quarry = gravelRecipes.find((r) => r.requiresVehicles)!;
    const result = calculateBuildingsAndWorkers(quarry, 100, 'gravel', 50, 'e-10011d', 1960, {
      vehicleSlots: [null, null, null],
      allowPersonnel: false,
    });
    expect(result.invalidConfig).toBe(true);
    expect(result.buildingCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/calculator/__tests__/buildingCalculator.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/calculator/buildingCalculator.ts`**

This file extracts `calculateBuildingsAndWorkers` and `calculateRequirementsForBuildings` as pure exported functions (currently class methods on `ProductionCalculator`).

Copy the body of `calculateBuildingsAndWorkers` (lines ~274–402 of `productionCalculator.ts`) and `calculateRequirementsForBuildings` (lines ~408–540) into this file, converting them from class methods to standalone functions. They need access to `isMineRecipe` and `requiresVehiclesRecipe` — inline these as simple boolean checks:

```ts
import type { ProductionRecipe, ProductionResult } from '@/data/types';
import type { MineVehicleConfig } from '@/lib/productionCalculator';
import { clamp, getProductionFactor, getConsumptionFactor } from './helpers';
import { getDefaultMineVehicleConfig, computeVehicleCapacity, getMineVehicleConfig } from './vehicleUtils';
import type { CalculationConfig } from '@/lib/productionCalculator';

// Inline helpers (avoid circular dep with the class)
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
  // ── Copy the full body from ProductionCalculator.calculateBuildingsAndWorkers ──
  // (lines 283–402 of productionCalculator.ts)
  // Replace: this.isMineRecipe(recipe)       → isMine(recipe)
  // Replace: this.requiresVehiclesRecipe(recipe) → requiresVehicles(recipe)
  // Everything else is identical.
}

export function calculateRequirementsForBuildings(
  recipe: ProductionRecipe,
  buildingCount: number,
  totalWorkers: number,
  workersPerBuilding?: number,
  chargeRatio?: number,
  sourceQualityFactor: number = 1,
  vehicleProductionPerDay?: number,
  year: number = 1960
): { inputsPerDay: Map<string, number>; outputsPerDay: Map<string, number>; totalProfessors: number; professorsPerBuilding: number; maxProfessorsPerBuilding: number; actualChargeRatio: number } {
  // ── Copy the full body from ProductionCalculator.calculateRequirementsForBuildings ──
  // (lines 418–540 of productionCalculator.ts)
  // Replace: this.isMineRecipe(recipe)       → isMine(recipe)
  // Replace: this.requiresVehiclesRecipe(recipe) → requiresVehicles(recipe)
  // Everything else is identical.
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/calculator/__tests__/buildingCalculator.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Update `productionCalculator.ts` class methods to delegate**

In the `ProductionCalculator` class, replace the bodies of `calculateBuildingsAndWorkers` and `calculateRequirementsForBuildings` with delegations to the imported functions. Import at the top:

```ts
import { calculateBuildingsAndWorkers as _calcBW, calculateRequirementsForBuildings as _calcReq } from '@/lib/calculator/buildingCalculator';
```

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/calculator/buildingCalculator.ts src/lib/calculator/__tests__/buildingCalculator.test.ts src/lib/productionCalculator.ts
git commit -m "refactor(calculator): extract building calculation to lib/calculator/buildingCalculator.ts"
```

---

## Task 4: Extract `chainResolver.ts`

**Files:**
- Create: `src/lib/calculator/chainResolver.ts`
- Create: `src/lib/calculator/__tests__/chainResolver.test.ts`
- Modify: `src/lib/productionCalculator.ts`

This is the largest extraction (~700 lines). It includes `calculateForResource` (recursive chain resolution) and `calculateChain` (multi-goal aggregation) and `getResourcesThatDependOnDisabled`.

- [ ] **Step 1: Write failing tests**

Create `src/lib/calculator/__tests__/chainResolver.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveChain } from '../chainResolver';

describe('resolveChain', () => {
  it('resolves a single steel goal', () => {
    const results = resolveChain([
      { resourceId: 'steel', buildingName: 'steel_mill', inputType: 'buildings', value: 1 },
    ], {
      disabledResources: new Set(),
      sourceQuality: 50,
      year: 1960,
    });
    expect(results.some((r) => r.resourceId === 'steel')).toBe(true);
    expect(results.some((r) => r.resourceId === 'coal')).toBe(true);
  });

  it('returns empty array for empty goals', () => {
    const results = resolveChain([], { disabledResources: new Set(), sourceQuality: 50, year: 1960 });
    expect(results).toHaveLength(0);
  });

  it('does not expand disabled resources', () => {
    const results = resolveChain([
      { resourceId: 'steel', buildingName: 'steel_mill', inputType: 'buildings', value: 1 },
    ], {
      disabledResources: new Set(['coal']),
      sourceQuality: 50,
      year: 1960,
    });
    const coalResult = results.find((r) => r.resourceId === 'coal');
    expect(coalResult?.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/calculator/__tests__/chainResolver.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/calculator/chainResolver.ts`**

This file exports a single `resolveChain` function as the entry point, wrapping the existing `calculateChain` logic from `ProductionCalculator`.

```ts
import type { ProductionResult } from '@/data/types';
import type { ProductionGoalSerialized } from '@/lib/planUrl';
import { productions } from '@/data/productions';
import { sortProductionChain } from '@/lib/chainSort';
import {
  getSourceQuality, getDefaultBuilding, getYear, getEffectiveChargeRatio,
} from './helpers';
import { getMineVehicleConfig } from './vehicleUtils';
import { calculateBuildingsAndWorkers, calculateRequirementsForBuildings } from './buildingCalculator';
import type { CalculationConfig } from '@/lib/productionCalculator';

// ── Copy calculateForResource, calculateChain, getResourcesThatDependOnDisabled ──
// from ProductionCalculator class (lines ~600–1391 of productionCalculator.ts)
// converting them from class methods to standalone functions.
// Replace all `this.isMineRecipe(recipe)` with `recipe.isMine === true`
// Replace all `this.requiresVehiclesRecipe(recipe)` with `recipe.requiresVehicles === true`
// Replace all `this.getProduction(id)` with `productions.get(id)`
// Replace all `this.findRecipesProducing(id)` with `productions.get(id)?.recipes ?? []`
// Replace all `this.getMineVehicleConfig(...)` with `getMineVehicleConfig(...)`
// Replace all `this.calculateBuildingsAndWorkers(...)` with `calculateBuildingsAndWorkers(...)`
// Replace all `this.calculateRequirementsForBuildings(...)` with `calculateRequirementsForBuildings(...)`
// Replace all `this.getEffectiveChargeRatio(...)` with `getEffectiveChargeRatio(...)`

export interface ResolveChainOptions {
  disabledResources: Set<string>;
  sourceQuality: number;
  year: number;
  defaultVehicleId?: string;
  defaultBuildingByResource?: Record<string, string>;
  sourceQualityByResource?: Record<string, number>;
  vehicleConfigByResource?: Record<string, import('@/lib/productionCalculator').MineVehicleConfig>;
  chargeRatioByResource?: Record<string, number>;
}

/** Entry point: resolves a full production chain for a list of goals. */
export function resolveChain(
  goals: ProductionGoalSerialized[],
  options: ResolveChainOptions
): ProductionResult[] {
  const config: CalculationConfig = {
    resourceId: '',     // unused at the top level, set per goal
    inputType: 'buildings',
    value: 0,
    disabledResources: options.disabledResources,
    sourceQuality: options.sourceQuality,
    year: options.year,
    defaultVehicleId: options.defaultVehicleId,
    defaultBuildingByResource: options.defaultBuildingByResource,
    sourceQualityByResource: options.sourceQualityByResource,
    vehicleConfigByResource: options.vehicleConfigByResource,
    chargeRatioByResource: options.chargeRatioByResource,
  };
  // delegate to the extracted calculateChain function
  return calculateChain(goals.map((g) => ({ ...config, resourceId: g.resourceId, buildingName: g.buildingName, inputType: g.inputType, value: g.value })));
}

// ── paste calculateForResource, calculateChain, getResourcesThatDependOnDisabled here ──
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/calculator/__tests__/chainResolver.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Update `ProductionCalculator` class to delegate `calculateChain`**

In `productionCalculator.ts`, replace the bodies of `calculateForResource`, `calculateChain`, `getResourcesThatDependOnDisabled` with imports from `chainResolver.ts`. The class methods become thin wrappers:

```ts
import { resolveChain } from '@/lib/calculator/chainResolver';
```

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/calculator/chainResolver.ts src/lib/calculator/__tests__/chainResolver.test.ts src/lib/productionCalculator.ts
git commit -m "refactor(calculator): extract chain resolution to lib/calculator/chainResolver.ts"
```

---

## Task 5: Verify file sizes and final cleanup

- [ ] **Step 1: Check all file sizes are within limits**

```bash
wc -l src/lib/productionCalculator.ts src/lib/calculator/*.ts
```

Expected: `productionCalculator.ts` < 150 lines, each calculator module < 350 lines.

- [ ] **Step 2: Run full test suite with coverage**

```bash
npm run test:coverage
```

Expected: all tests pass. Coverage for `src/lib/calculator/` modules ≥ 70%.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: no TypeScript errors, successful build.

- [ ] **Step 4: Commit cleanup if any small fixes were needed**

```bash
git add -A
git commit -m "refactor(calculator): finalize engine decomposition"
```
