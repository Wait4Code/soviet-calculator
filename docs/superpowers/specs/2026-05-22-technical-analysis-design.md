# Technical Analysis & Improvement Plan — Soviet Calculator

**Date:** 2026-05-22  
**Author:** Claude (architect review)  
**Branch:** `docs/technical-analysis-2026-05-22`  
**Approach:** Progressive (4 sequential sprints, each independently deliverable)

---

## 1. Context

Soviet Calculator is a React SPA that calculates resource production chains for the game *Workers & Resources: Soviet Republic*. The app has undergone a significant UI refactoring (recent commits: decomposition of `ProductionCalculator.tsx` from 107KB into hooks + components). The calculation engine and some UI components remain candidates for improvement.

**Stack:** React 18, TypeScript, Vite, Zustand, i18next, Tailwind, Vitest  
**Deployment:** GitHub Pages, CI via GitHub Actions on release  
**Tests:** 73 passing (moteur de calcul + hooks principaux)

---

## 2. Strengths

- **Recently refactored UI architecture** — `ProductionCalculator.tsx` is now a slim orchestrator (~274 lines). Hooks (`useProductionGoals`, `useChainSettings`, `useSavedPlans`, `useUrlSync`, `useCalculationChain`) and components (`GoalList`, `PlansPanel`, `ResultSection`) have clear boundaries.
- **Solid unit tests on the calculation engine** — 73 tests, all passing. `productionCalculator.ts`, `chainSort.ts`, and the 5 main hooks are covered.
- **Modern stack** — Vite + React 18 + strict TypeScript + Zustand + i18next. No unnecessary exotic dependencies.
- **URL sharing + persisted plans** — base64url encoding with versioning (`v: 1`) and localStorage save with autosave/rename/duplicate.
- **Centralized data** — `productions.json` and `vehicles.json` are the single source of truth.
- **CI/CD present** — GitHub Actions runs tests + build + deploy on each release.

---

## 3. Weaknesses

### 🔴 Critical

#### 3.1 `productionCalculator.ts` — God Object (1 466 lines)

Despite the UI refactoring, the calculation engine remains monolithic. The `ProductionCalculator` class and its pure functions handle everything in a single file:
- Input conversion (buildings → t/d, t/yr → t/d)
- Personnel mines (coal, iron, uranium)
- Vehicle quarries (gravel)
- Co-products and waste flows
- Year factors (`production_decrease`, `consumption_increase`)
- Multi-goal aggregation + recursive chain resolution

**Risk:** adding a new mine type or game mechanic requires navigating 1 400+ lines.

#### 3.2 `ChainTable.tsx` — 603 lines, 23 props

The component is too large and receives 23 props. It also contains business logic (`migrateVehicleConfig`, `BLOC_EAST_ORIGINS` hardcoded list of 8 countries in French). The 23 props are a symptom of prop drilling that should be resolved with a React context or a local Zustand slice.

#### 3.3 `useCalculationChain.ts` — 586 lines, too many responsibilities

This hook aggregates: main chain calculation, waste flows (sewage, waste_mixed, waste_toxic), personnel breakdown, totals. Difficult to test in isolation.

---

### 🟠 Important

#### 3.4 `getResourceName` hardcoded in French — broken i18n in the engine

In `productions.ts`, a `resourceNames` map contains all resource names hardcoded in French. `getResourceName()` is called **14 times** in `productionCalculator.ts` and `useCalculationChain.ts` to populate `ProductionResult.resourceName`. Result: regardless of the user's chosen language, `resourceName` is always in French in calculation results.

#### 3.5 `formatNumber` fixed at `fr-FR`

`src/lib/format.ts` creates a static `Intl.NumberFormat('fr-FR', ...)`. English-speaking users see `3 000` (non-breaking space) instead of `3,000`. The formatter should use the app's active locale.

#### 3.6 No test coverage measurement

`@vitest/coverage-v8` is installed but **never configured**. No coverage threshold is defined, no `npm run test:coverage` command exists. React components (`ChainTable`, `PollutionTable`, `GoalItem`, `Settings`) have **zero tests**. Actual coverage is unknown.

---

### 🟡 Minor

#### 3.7 Typos in public interfaces

- `profesors` (missing `s`) in `ProductionRecipe`, `ProductionResult` and everywhere they're consumed → propagated across the entire codebase. Fixing this requires a localStorage migration (field rename).
- `eletronics` / `eletronic_factory` (one `c` instead of two) in resource/building IDs. **Do not rename** — these are serialized IDs stored in saved plans and URLs. Renaming would break all existing data. Accepted as-is.

#### 3.8 No React Error Boundary

If the calculation engine throws (corrupted data, invalid plan, unhandled edge case), the entire app crashes to a blank screen. A single `ErrorBoundary` around `ProductionCalculator` would be sufficient.

#### 3.9 No versioning for localStorage plans

The URL format has `v: 1`, but `SavedPlan` objects in localStorage have no version field. A schema change to `PlanStateSerialized` can silently corrupt existing saved plans with no error message.

#### 3.10 6 `eslint-disable` suppressions in `ProductionCalculator.tsx`

Mostly for `react-hooks/exhaustive-deps`. These suppressions potentially hide real stale closure bugs.

---

## 4. Improvement Plan (progressive approach)

The progressive approach was chosen over surgical (too conservative) and big-bang (too risky). Each sprint is independently deliverable and validates the previous one.

---

### Sprint 1 — Foundations (low risk, immediate impact)

**Goal:** Establish a safety net before any structural refactoring.

**1a. Configure test coverage**
- Add `coverage` block in `vite.config.ts` (provider `v8`, thresholds: 70% lines/branches for the engine)
- Add `npm run test:coverage` to `package.json`
- Use coverage output to guide Sprints 2 and 4

**1b. Add an Error Boundary**
- Create `src/components/ErrorBoundary.tsx` (class component, React requirement)
- Wrap `<ProductionCalculator />` in `App.tsx`
- Display a user-friendly error message + "Reset" button instead of blank screen

**1c. localStorage plan versioning + typo migration**
- Add `schemaVersion: number` field to `SavedPlan`
- Write `migratePlan(raw): SavedPlan` to handle old formats silently on read
- Fix interface field typo `profesors` → `professors` in `types.ts` **during the same migration** (since a migration is already needed). Scope: TypeScript field names only — no change to resource/building string IDs.
- Update all affected: `types.ts`, `productionCalculator.ts`, `useCalculationChain.ts`, all hooks and components using the field, tests

**Acceptance criteria:**
- `npm run test:coverage` runs and reports percentages
- A thrown error in the calculator shows an error UI, not a blank screen
- Existing saved plans still load correctly after the migration
- All 73 existing tests still pass

---

### Sprint 2 — Engine decomposition

**Goal:** Break `productionCalculator.ts` into focused, independently testable modules.

**Proposed file structure:**

```
src/lib/calculator/
  inputConversion.ts      — convertToPerDay(), getYear(), clamp(), factor helpers
  mineCalculator.ts       — personnel mines + vehicle quarries
  buildingCalculator.ts   — standard buildings, year factors
  chainResolver.ts        — recursive chain resolution (the core loop)
  aggregator.ts           — multi-goal aggregation, co-products, waste flows
src/lib/productionCalculator.ts  — public facade, orchestrates modules (no logic change)
```

**Key constraints:**
- `ProductionCalculator` class stays as the public export facade — no external interface changes
- Each new module exports pure functions only (no class, no singleton)
- Each new module gets its own test file
- The public API (`productionCalculator.ts`) does not change — existing tests remain valid

**Acceptance criteria:**
- No file in `src/lib/calculator/` exceeds 300 lines
- Each module has ≥ 80% line coverage
- All existing tests still pass without modification

---

### Sprint 3 — i18n consistency

**Goal:** Make language switching work correctly end-to-end.

**3a. Remove `getResourceName` from the engine**
- `ProductionResult.resourceName` is made **optional** (`resourceName?: string`) in `types.ts` — the engine stops populating it
- UI components use `t('resources.' + resourceId)` directly for display; they no longer rely on `resourceName`
- `getResourceName` is kept as a non-i18n fallback only for internal/test contexts where `t()` is not available
- Audit all 14 call sites and replace with i18n lookups in components

**3b. Localize `formatNumber`**
- Transform `format.ts` into `formatNumber(value: number, locale: string): string`
- Create `useFormatNumber()` hook that reads `i18n.language`
- Replace all static `formatNumber()` call sites in components with the hook
- `3 000` → `3,000` for English users, `3 000` for French users

**Acceptance criteria:**
- Switching language updates all displayed resource names immediately
- Numbers use the correct locale separator for the active language
- No resource name is hardcoded in French in the engine

---

### Sprint 4 — UI: ChainTable reduction + component tests

**Goal:** Reduce `ChainTable.tsx` below 300 lines and add UI test coverage.

**4a. Resolve prop drilling with a React context**
- Create `src/components/ResultSection/ChainContext.tsx`
- Context carries: `chainYear`, `sourceQuality`, `vehicleConfigByResource`, `chargeRatioByResource`, `buildingByResource`, and all 8 mutation callbacks
- `ChainTable` reads from context instead of receiving 23 props
- `ResultSection` is the context provider

**4b. Extract business logic out of `ChainTable.tsx`**
- `BLOC_EAST_ORIGINS` → `src/data/vehicleOrigins.ts` (with an exported helper `getBlocForOrigin`)
- `getDefaultVehicleConfig` local duplicate → remove, use the one from `productionCalculator.ts`
- Result: `ChainTable.tsx` is a pure rendering component, < 300 lines

**4c. Component tests**
- `ChainTable`: snapshot test + main interactions (toggle resource, change year)
- `GoalItem`: resource selection test
- `PollutionTable`: render test with fixture data
- Reuse `src/__fixtures__/productionResults.ts` for test data

**Acceptance criteria:**
- `ChainTable.tsx` < 300 lines
- `ChainTable` receives ≤ 5 props (context handles the rest)
- Component test coverage ≥ 60% for `ChainTable`, `GoalItem`, `PollutionTable`
- All existing tests still pass

---

## 5. Out of scope

The following were identified but excluded from this plan to keep scope focused:

- Adding new game buildings/resources to `productions.json` (data work, not code quality)
- Cloud sync / multi-device plan sharing (feature, not tech debt)
- Additional language support beyond FR/EN (feature)
- Fixing `eslint-disable` suppressions in `ProductionCalculator.tsx` (tracked, but low risk — address organically during Sprint 2/4 refactoring)

---

## 6. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| typo migration corrupts existing plans | Low | High | Test migration with fixtures before merging |
| Engine decomposition introduces calculation regressions | Medium | High | Run full test suite after each module extraction |
| ChainContext causes subtle render bugs | Low | Medium | Add integration test for plan load → render flow |
| `resourceName` removal breaks a display path | Low | Medium | Audit all 14 call sites before removing |
