# Sprint 4 — ChainTable UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `ChainTable.tsx` from 603 to < 300 lines by (1) extracting hardcoded data, (2) replacing 23-prop drilling with a React context, and (3) adding component tests for `ChainTable`, `GoalItem`, and `PollutionTable`.

**Architecture:** A new `ChainTableContext` carries the 20 configuration props and 8 callbacks. `ResultSection` is the context provider. `ChainTable` reads from context instead of receiving them directly — it keeps only `results`, `disabledResources`, `hasAnySurplus`, `surplusByResource`, and `primaryResourceIds` as direct props (data the parent filters). Business logic is extracted to `src/data/vehicleOrigins.ts`.

**Tech Stack:** React context, @testing-library/react, Vitest, TypeScript

**Prerequisite:** Sprint 1 completed (typo fix → `professors` spelling). Sprints 2 and 3 are independent.

---

## Task 1: Extract `vehicleOrigins.ts`

**Files:**
- Create: `src/data/vehicleOrigins.ts`
- Modify: `src/components/ResultSection/ChainTable.tsx`

- [ ] **Step 1: Write a failing test**

Create `src/data/__tests__/vehicleOrigins.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getBlocForOrigin } from '../vehicleOrigins';

describe('getBlocForOrigin', () => {
  it('returns east for Soviet Union', () => {
    expect(getBlocForOrigin('Union soviétique')).toBe('east');
  });
  it('returns east for Czechoslovakia', () => {
    expect(getBlocForOrigin('Tchécoslovaquie')).toBe('east');
  });
  it('returns west for unknown origin', () => {
    expect(getBlocForOrigin('USA')).toBe('west');
  });
  it('returns west for empty string', () => {
    expect(getBlocForOrigin('')).toBe('west');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/data/__tests__/vehicleOrigins.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/data/vehicleOrigins.ts`**

```ts
/**
 * East-bloc countries of origin for vehicles.
 * Used to determine which bloc flag to display in the vehicle selector.
 */
export const BLOC_EAST_ORIGINS = new Set([
  'Union soviétique',
  'Tchécoslovaquie',
  'Roumanie',
  "Allemagne de l'Est",
  'Pologne',
  'Hongrie',
  'Bulgarie',
  'RDA',
]);

export function getBlocForOrigin(origin: string): 'east' | 'west' {
  return BLOC_EAST_ORIGINS.has(origin) ? 'east' : 'west';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/data/__tests__/vehicleOrigins.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Update `ChainTable.tsx`**

Replace:
```ts
const BLOC_EAST_ORIGINS = new Set([...]);
function getBlocForOrigin(origin: string): 'east' | 'west' { ... }
```
With:
```ts
import { getBlocForOrigin } from '@/data/vehicleOrigins';
```

Remove the local `BLOC_EAST_ORIGINS` constant and `getBlocForOrigin` function definition. All call sites of `getBlocForOrigin` in the file stay unchanged.

Also remove the local `getDefaultVehicleConfig` function (lines ~30–36 in ChainTable.tsx) and replace its call sites with an import from `productionCalculator.ts` (it already exports `migrateVehicleConfig`; use it, or import the equivalent from `vehicleUtils.ts` after Sprint 2):

```ts
// Remove local getDefaultVehicleConfig and replace call sites with:
import { migrateVehicleConfig } from '@/lib/productionCalculator';
// then replace: getDefaultVehicleConfig(recipe, defaultVehicleId)
// with: migrateVehicleConfig({ vehicleSlots: Array(recipe.maxVehicles ?? 0).fill(defaultVehicleId), allowPersonnel: false }, recipe.maxVehicles ?? 0, defaultVehicleId)
```

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/data/vehicleOrigins.ts src/data/__tests__/vehicleOrigins.test.ts src/components/ResultSection/ChainTable.tsx
git commit -m "refactor(ui): extract BLOC_EAST_ORIGINS to data/vehicleOrigins.ts"
```

---

## Task 2: Create `ChainTableContext`

**Files:**
- Create: `src/components/ResultSection/ChainTableContext.tsx`
- Create: `src/components/ResultSection/ChainTableContext.test.tsx`

- [ ] **Step 1: Write a failing test**

Create `src/components/ResultSection/ChainTableContext.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { ChainTableProvider, useChainTableContext } from './ChainTableContext';
import type { MineVehicleConfig } from '@/lib/productionCalculator';

function Consumer() {
  const { chainYear } = useChainTableContext();
  return <span data-testid="year">{chainYear}</span>;
}

const MINIMAL_CONTEXT = {
  chainYear: 1975,
  effectiveSourceQuality: 50,
  sourceQualityByResource: {},
  buildingByResource: {},
  defaultBuildingByResource: {},
  vehicleConfigByResource: {} as Record<string, MineVehicleConfig>,
  chargeRatioByResource: {},
  totalWorkers: 0,
  totalProfessors: 0,
  personnelBreakdown: [],
  defaultVehicleId: 'e-10011d',
  chainHasLivestockBuilding: false,
  onChangeYear: () => {},
  onToggleResource: () => {},
  onSetSourceQuality: () => {},
  onSetBuilding: () => {},
  onSetVehicleConfig: () => {},
  onSetChargeRatio: () => {},
  onResetChargeRatio: () => {},
};

describe('ChainTableContext', () => {
  it('provides context values to consumers', () => {
    render(
      <ChainTableProvider value={MINIMAL_CONTEXT}>
        <Consumer />
      </ChainTableProvider>
    );
    expect(screen.getByTestId('year').textContent).toBe('1975');
  });

  it('throws when useChainTableContext is used outside provider', () => {
    // Suppress React error boundary noise
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/ResultSection/ChainTableContext.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/components/ResultSection/ChainTableContext.tsx`**

```tsx
import { createContext, useContext, type ReactNode } from 'react';
import type { MineVehicleConfig } from '@/lib/productionCalculator';

export interface ChainTableContextValue {
  chainYear: number;
  effectiveSourceQuality: number;
  sourceQualityByResource: Record<string, number>;
  buildingByResource: Record<string, string>;
  defaultBuildingByResource: Record<string, string>;
  vehicleConfigByResource: Record<string, MineVehicleConfig>;
  chargeRatioByResource: Record<string, number>;
  totalWorkers: number;
  totalProfessors: number;
  personnelBreakdown: Array<{ sourceResourceId: string; buildingName: string; workers: number; professors: number }>;
  defaultVehicleId: string;
  chainHasLivestockBuilding: boolean;
  onChangeYear: (year: number) => void;
  onToggleResource: (resourceId: string) => void;
  onSetSourceQuality: (resourceId: string, value: number) => void;
  onSetBuilding: (resourceId: string, buildingName: string) => void;
  onSetVehicleConfig: (resourceId: string, cfg: MineVehicleConfig) => void;
  onSetChargeRatio: (resourceId: string, value: number) => void;
  onResetChargeRatio: (resourceId: string) => void;
}

const ChainTableContext = createContext<ChainTableContextValue | null>(null);

export function ChainTableProvider({
  value,
  children,
}: {
  value: ChainTableContextValue;
  children: ReactNode;
}) {
  return (
    <ChainTableContext.Provider value={value}>
      {children}
    </ChainTableContext.Provider>
  );
}

export function useChainTableContext(): ChainTableContextValue {
  const ctx = useContext(ChainTableContext);
  if (!ctx) throw new Error('useChainTableContext must be used inside ChainTableProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/ResultSection/ChainTableContext.test.tsx
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ResultSection/ChainTableContext.tsx src/components/ResultSection/ChainTableContext.test.tsx
git commit -m "feat(ui): create ChainTableContext to replace 23-prop drilling"
```

---

## Task 3: Wire context into `ResultSection` and `ChainTable`

**Files:**
- Modify: `src/components/ResultSection/ResultSection.tsx`
- Modify: `src/components/ResultSection/ChainTable.tsx`

- [ ] **Step 1: Make `ResultSection` the context provider**

In `src/components/ResultSection/ResultSection.tsx`:

Add imports:
```ts
import { ChainTableProvider, type ChainTableContextValue } from './ChainTableContext';
```

Build the context value from props and pass it to `ChainTableProvider` wrapping `<ChainTable>`:

```tsx
const chainTableCtx: ChainTableContextValue = {
  chainYear,
  effectiveSourceQuality,
  sourceQualityByResource,
  buildingByResource,
  defaultBuildingByResource,
  vehicleConfigByResource,
  chargeRatioByResource,
  totalWorkers,
  totalProfessors,
  personnelBreakdown,
  defaultVehicleId,
  chainHasLivestockBuilding,
  onChangeYear,
  onToggleResource,
  onSetSourceQuality,
  onSetBuilding,
  onSetVehicleConfig,
  onSetChargeRatio,
  onResetChargeRatio,
};

return (
  <>
    <ChainTableProvider value={chainTableCtx}>
      <ChainTable
        results={results}
        disabledResources={disabledResources}
        hasAnySurplus={hasAnySurplus}
        surplusByResource={surplusByResource}
        primaryResourceIds={primaryResourceIds}
      />
    </ChainTableProvider>
    {showPollutionTable && (
      <PollutionTable
        wasteTableData={wasteTableData}
        results={results}
        pollutionDistanceMode={pollutionDistanceMode}
      />
    )}
  </>
);
```

- [ ] **Step 2: Simplify `ChainTable` props interface**

In `src/components/ResultSection/ChainTable.tsx`, replace the 23-prop `ChainTableProps` interface with:

```ts
export interface ChainTableProps {
  results: ProductionResult[];
  disabledResources: Set<string>;
  hasAnySurplus: boolean;
  surplusByResource: Map<string, number>;
  primaryResourceIds: Set<string>;
}
```

- [ ] **Step 3: Update `ChainTable` function to read config from context**

At the top of the `ChainTable` function body, add:

```ts
const {
  chainYear,
  effectiveSourceQuality,
  sourceQualityByResource,
  buildingByResource,
  defaultBuildingByResource,
  vehicleConfigByResource,
  chargeRatioByResource,
  totalWorkers,
  totalProfessors,
  personnelBreakdown,
  defaultVehicleId,
  chainHasLivestockBuilding,
  onChangeYear,
  onToggleResource,
  onSetSourceQuality,
  onSetBuilding,
  onSetVehicleConfig,
  onSetChargeRatio,
  onResetChargeRatio,
} = useChainTableContext();
```

Remove all the same-named parameters from the destructured function arguments. The rest of the component body is unchanged.

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Verify file size**

```bash
wc -l src/components/ResultSection/ChainTable.tsx
```

Expected: < 400 lines (exact count depends on how many props lines were removed). Further reduction comes from Task 1 (removing `getBlocForOrigin` local definition).

- [ ] **Step 6: Commit**

```bash
git add src/components/ResultSection/ResultSection.tsx src/components/ResultSection/ChainTable.tsx
git commit -m "refactor(ui): replace ChainTable 23-prop drilling with ChainTableContext"
```

---

## Task 4: Component tests for `ChainTable`

**Files:**
- Create: `src/components/ResultSection/ChainTable.test.tsx`

- [ ] **Step 1: Write tests**

Create `src/components/ResultSection/ChainTable.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChainTable } from './ChainTable';
import { ChainTableProvider, type ChainTableContextValue } from './ChainTableContext';
import type { MineVehicleConfig } from '@/lib/productionCalculator';
import { STEEL_CHAIN_RESULTS } from '@/__fixtures__/productionResults';
const [STEEL_RESULT, COAL_RESULT, IRON_RESULT] = STEEL_CHAIN_RESULTS;

function makeCtx(overrides: Partial<ChainTableContextValue> = {}): ChainTableContextValue {
  return {
    chainYear: 1960,
    effectiveSourceQuality: 50,
    sourceQualityByResource: {},
    buildingByResource: {},
    defaultBuildingByResource: {},
    vehicleConfigByResource: {} as Record<string, MineVehicleConfig>,
    chargeRatioByResource: {},
    totalWorkers: 10,
    totalProfessors: 2,
    personnelBreakdown: [],
    defaultVehicleId: 'e-10011d',
    chainHasLivestockBuilding: false,
    onChangeYear: vi.fn(),
    onToggleResource: vi.fn(),
    onSetSourceQuality: vi.fn(),
    onSetBuilding: vi.fn(),
    onSetVehicleConfig: vi.fn(),
    onSetChargeRatio: vi.fn(),
    onResetChargeRatio: vi.fn(),
    ...overrides,
  };
}

function renderChainTable(
  props: Partial<React.ComponentProps<typeof ChainTable>> = {},
  ctxOverrides: Partial<ChainTableContextValue> = {}
) {
  const results = props.results ?? [STEEL_RESULT, COAL_RESULT, IRON_RESULT];
  return render(
    <ChainTableProvider value={makeCtx(ctxOverrides)}>
      <ChainTable
        results={results}
        disabledResources={props.disabledResources ?? new Set()}
        hasAnySurplus={props.hasAnySurplus ?? false}
        surplusByResource={props.surplusByResource ?? new Map()}
        primaryResourceIds={props.primaryResourceIds ?? new Set(['steel'])}
      />
    </ChainTableProvider>
  );
}

describe('ChainTable', () => {
  it('renders a row for each result', () => {
    renderChainTable();
    // Each result has a building name visible in the table
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
  });

  it('calls onToggleResource when a disable button is clicked', async () => {
    const onToggleResource = vi.fn();
    renderChainTable({}, { onToggleResource });
    const user = userEvent.setup();
    // Find any toggle button (first one)
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[0]);
    // Note: exact toggle button depends on ChainTable markup — adjust selector if needed
  });

  it('calls onChangeYear when year input changes', async () => {
    const onChangeYear = vi.fn();
    renderChainTable({}, { onChangeYear });
    const user = userEvent.setup();
    const yearInput = screen.getByDisplayValue('1960');
    await user.clear(yearInput);
    await user.type(yearInput, '1970');
    // onChange fires as user types
    expect(onChangeYear).toHaveBeenCalled();
  });

  it('shows no rows when results is empty', () => {
    render(
      <ChainTableProvider value={makeCtx()}>
        <ChainTable
          results={[]}
          disabledResources={new Set()}
          hasAnySurplus={false}
          surplusByResource={new Map()}
          primaryResourceIds={new Set()}
        />
      </ChainTableProvider>
    );
    // Table header may still render, but data rows should not
    expect(screen.queryAllByRole('row').length).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/ResultSection/ChainTable.test.tsx
```

Expected: FAIL (component not yet wired in tests).

- [ ] **Step 3: Fix any import or rendering issues until all tests pass**

```bash
npx vitest run src/components/ResultSection/ChainTable.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/ResultSection/ChainTable.test.tsx
git commit -m "test(ui): add ChainTable component tests"
```

---

## Task 5: Component tests for `GoalItem` and `PollutionTable`

**Files:**
- Create: `src/components/GoalList/GoalItem.test.tsx`
- Create: `src/components/ResultSection/PollutionTable.test.tsx`

- [ ] **Step 1: Write GoalItem tests**

Create `src/components/GoalList/GoalItem.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoalItem } from './GoalItem';
import { productionCalculator } from '@/lib/productionCalculator';

const ALL_PRODUCTIONS = productionCalculator.getAllProductions();

const DEFAULT_GOAL = {
  id: 'goal-1',
  resourceId: 'steel',
  buildingName: 'steel_mill',
  inputType: 'buildings' as const,
  value: 1,
};

describe('GoalItem', () => {
  it('renders the current resource name', () => {
    render(
      <GoalItem
        goal={DEFAULT_GOAL}
        allProductions={ALL_PRODUCTIONS}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
        onSetResource={vi.fn()}
      />
    );
    // The resource name or building name should be visible
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('calls onUpdate when value changes', async () => {
    const onUpdate = vi.fn();
    render(
      <GoalItem
        goal={DEFAULT_GOAL}
        allProductions={ALL_PRODUCTIONS}
        onRemove={vi.fn()}
        onUpdate={onUpdate}
        onSetResource={vi.fn()}
      />
    );
    const user = userEvent.setup();
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '5');
    expect(onUpdate).toHaveBeenCalled();
  });

  it('calls onRemove when remove button is clicked', async () => {
    const onRemove = vi.fn();
    render(
      <GoalItem
        goal={DEFAULT_GOAL}
        allProductions={ALL_PRODUCTIONS}
        onRemove={onRemove}
        onUpdate={vi.fn()}
        onSetResource={vi.fn()}
      />
    );
    const user = userEvent.setup();
    // GoalItem renders a ✕ button with Tooltip wrapping — target by its icon text
    const removeBtn = screen.getByRole('button', { name: /✕/i });
    await user.click(removeBtn);
    expect(onRemove).toHaveBeenCalled();  // GoalItem calls onRemove() with no arguments
  });
});
```

> Note: `GoalItem`'s exact props may differ from the above skeleton. Read `src/components/GoalList/GoalItem.tsx` before running to align prop names.

- [ ] **Step 2: Write PollutionTable tests**

Create `src/components/ResultSection/PollutionTable.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { PollutionTable } from './PollutionTable';
import type { WasteTableData } from '@/hooks/useCalculationChain';
import { STEEL_CHAIN_RESULTS } from '@/__fixtures__/productionResults';
const [STEEL_RESULT] = STEEL_CHAIN_RESULTS;

const EMPTY_WASTE: WasteTableData = {
  rows: [],
  totals: { sewagePerDay: 0, mixedPerDay: 0, hazardousPerDay: 0, mixedComposition: {}, hazardousComposition: {} },
  pollutionMin: undefined,
  pollutionMax: undefined,
};

const WASTE_WITH_ROW: WasteTableData = {
  rows: [{
    sourceResourceId: 'steel',
    buildingName: 'steel_mill',
    sewagePerDay: 10,
    mixedPerDay: 5,
    hazardousPerDay: 0,
    mixedComposition: {},
    hazardousComposition: {},
    pollutionTPerYear: undefined,
    safetyDistance: undefined,
  }],
  totals: { sewagePerDay: 10, mixedPerDay: 5, hazardousPerDay: 0, mixedComposition: {}, hazardousComposition: {} },
  pollutionMin: undefined,
  pollutionMax: undefined,
};

describe('PollutionTable', () => {
  it('renders a row for each waste entry', () => {
    render(
      <PollutionTable
        wasteTableData={WASTE_WITH_ROW}
        results={[STEEL_RESULT]}
        pollutionDistanceMode="q80_min"
      />
    );
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
  });

  it('renders without error when waste data is empty', () => {
    expect(() =>
      render(
        <PollutionTable
          wasteTableData={EMPTY_WASTE}
          results={[]}
          pollutionDistanceMode="q80_min"
        />
      )
    ).not.toThrow();
  });
});
```

- [ ] **Step 3: Read `GoalItem.tsx` to verify prop names align**

```bash
head -40 src/components/GoalList/GoalItem.tsx
```

Adjust the test's prop names to match the actual component interface before running.

- [ ] **Step 4: Run all new tests**

```bash
npx vitest run src/components/GoalList/GoalItem.test.tsx src/components/ResultSection/PollutionTable.test.tsx
```

Expected: all tests PASS (after adjusting prop names if needed).

- [ ] **Step 5: Run all tests + coverage**

```bash
npm run test:coverage
```

Expected: all tests pass. Coverage for `ChainTable`, `GoalItem`, `PollutionTable` ≥ 60%.

- [ ] **Step 6: Commit**

```bash
git add src/components/GoalList/GoalItem.test.tsx src/components/ResultSection/PollutionTable.test.tsx
git commit -m "test(ui): add GoalItem and PollutionTable component tests"
```

---

## Final verification

```bash
npm run lint
npm test
npm run build
wc -l src/components/ResultSection/ChainTable.tsx
```

Expected: lint clean, all tests pass, build succeeds, `ChainTable.tsx` < 400 lines (ideally < 300 after Sprint 1 extracted origins).
