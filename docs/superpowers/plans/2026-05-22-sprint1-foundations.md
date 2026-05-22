# Sprint 1 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a safety net before any structural refactoring — test coverage reporting, Error Boundary, localStorage versioning, and `profesors` → `professors` typo fix.

**Architecture:** Four independent improvements applied in sequence. No external interface changes. The typo fix is a mechanical rename across all non-test source files; one test file requires manual user update after the rename.

**Tech Stack:** Vitest (coverage v8), React class component (ErrorBoundary), TypeScript, localStorage

**Prerequisite:** none — this sprint is the starting point.

---

## Task 1: Configure test coverage

**Files:**
- Modify: `vite.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Add coverage block to `vite.config.ts`**

Replace the `test` block with:

```ts
test: {
  globals: true,
  environment: 'jsdom',
  include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
  setupFiles: ['src/test-setup.ts'],
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html'],
    include: ['src/**/*.{ts,tsx}'],
    exclude: [
      'src/**/*.test.{ts,tsx}',
      'src/**/*.spec.{ts,tsx}',
      'src/test-setup.ts',
      'src/vite-env.d.ts',
      'src/main.tsx',
      'src/i18n.ts',
    ],
    thresholds: {
      'src/lib/**': { lines: 70, branches: 60, functions: 70 },
    },
  },
},
```

- [ ] **Step 2: Add `test:coverage` script to `package.json`**

In the `"scripts"` block, after `"test": "vitest run"`, add:

```json
"test:coverage": "vitest run --coverage",
```

- [ ] **Step 3: Run coverage and verify it reports**

```bash
npm run test:coverage
```

Expected: all 73 tests pass, then a coverage table is printed. The HTML report is written to `coverage/index.html`. It is normal for UI components (`ChainTable`, `PollutionTable`, `GoalItem`) to show 0% — that is what we are documenting.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts package.json
git commit -m "chore(test): configure vitest coverage reporting"
```

---

## Task 2: Add Error Boundary

**Files:**
- Create: `src/components/ErrorBoundary.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write a failing test for ErrorBoundary**

Create `src/components/ErrorBoundary.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

function Bomb(): never {
  throw new Error('test explosion');
}

// Suppress React's console.error for expected errors in this test
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(<ErrorBoundary><p>safe content</p></ErrorBoundary>);
    expect(screen.getByText('safe content')).toBeInTheDocument();
  });

  it('renders error UI when a child throws', () => {
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(screen.getByText(/erreur inattendue/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /réinitialiser/i })).toBeInTheDocument();
  });

  it('resets to children after clicking reset', async () => {
    // Use a stateful parent to swap out the throwing child after reset
    const { rerender } = render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /réinitialiser/i }));
    rerender(<ErrorBoundary><p>recovered</p></ErrorBoundary>);
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/ErrorBoundary.test.tsx
```

Expected: FAIL — `ErrorBoundary` not found.

- [ ] **Step 3: Create `src/components/ErrorBoundary.tsx`**

```tsx
import { Component, ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-12 gap-4 text-center">
          <p className="text-red-400 font-semibold text-lg">
            Une erreur inattendue s'est produite.
          </p>
          <p className="text-gray-400 text-sm font-mono break-all">
            {this.state.error?.message}
          </p>
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
          >
            Réinitialiser
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/ErrorBoundary.test.tsx
```

Expected: 3 tests PASS.

- [ ] **Step 5: Wrap `<ProductionCalculator />` in `App.tsx`**

Add the import at the top of `src/App.tsx`:

```tsx
import { ErrorBoundary } from './components/ErrorBoundary';
```

Then wrap the `<ProductionCalculator />` usage (around line 91):

```tsx
<div className={activeTab === 'industry' ? '' : 'hidden'}>
  <ErrorBoundary>
    <ProductionCalculator />
  </ErrorBoundary>
</div>
```

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: 76 tests pass (73 original + 3 new).

- [ ] **Step 7: Commit**

```bash
git add src/components/ErrorBoundary.tsx src/components/ErrorBoundary.test.tsx src/App.tsx
git commit -m "feat(ui): add ErrorBoundary around ProductionCalculator"
```

---

## Task 3: localStorage plan versioning

**Files:**
- Modify: `src/lib/savedPlans.ts`
- Create: `src/lib/__tests__/savedPlans.test.ts`

- [ ] **Step 1: Write failing tests for migration**

Create `src/lib/__tests__/savedPlans.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to test the private readFromStorage behavior indirectly via getSavedPlans.
// We mock localStorage to inject raw data.

const RAW_PLAN_V0 = {
  id: 'abc-123',
  name: 'Test plan',
  createdAt: 1700000000000,
  // no schemaVersion — this is a v0 plan
  planState: { g: [{ resourceId: 'steel', buildingName: 'steel_mill', inputType: 'buildings', value: 1 }] },
};

describe('savedPlans migration', () => {
  beforeEach(() => {
    localStorage.setItem('soviet-calculator-saved-plans', JSON.stringify([RAW_PLAN_V0]));
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('reads v0 plans and adds schemaVersion 1', async () => {
    const { getSavedPlans } = await import('../savedPlans');
    const plans = getSavedPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0].schemaVersion).toBe(1);
    expect(plans[0].id).toBe('abc-123');
    expect(plans[0].planState.g[0].resourceId).toBe('steel');
  });

  it('accepts plans that already have schemaVersion', async () => {
    localStorage.setItem('soviet-calculator-saved-plans', JSON.stringify([
      { ...RAW_PLAN_V0, schemaVersion: 1 },
    ]));
    const { getSavedPlans } = await import('../savedPlans');
    const plans = getSavedPlans();
    expect(plans[0].schemaVersion).toBe(1);
  });

  it('drops plans with missing required fields', async () => {
    localStorage.setItem('soviet-calculator-saved-plans', JSON.stringify([
      { id: 'bad' }, // missing name, createdAt, planState
    ]));
    const { getSavedPlans } = await import('../savedPlans');
    const plans = getSavedPlans();
    expect(plans).toHaveLength(0);
  });

  it('savePlan writes schemaVersion 1', async () => {
    localStorage.clear();
    const { savePlan, getSavedPlans } = await import('../savedPlans');
    savePlan('my plan', { g: [] });
    const plans = getSavedPlans();
    expect(plans[0].schemaVersion).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/savedPlans.test.ts
```

Expected: FAIL — `schemaVersion` is undefined.

- [ ] **Step 3: Update `src/lib/savedPlans.ts`**

Add the constant and update the `SavedPlan` interface and internal functions:

```ts
const CURRENT_SCHEMA_VERSION = 1;

export interface SavedPlan {
  id: string;
  name: string;
  createdAt: number;
  schemaVersion: number;  // 0 = legacy (field absent), 1 = first versioned schema
  planState: PlanStateSerialized;
}
```

Replace the inline filter in `readFromStorage` with a call to `migratePlan`:

```ts
function migratePlan(raw: unknown): SavedPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (
    typeof p.id !== 'string' ||
    typeof p.name !== 'string' ||
    typeof p.createdAt !== 'number' ||
    !p.planState ||
    !Array.isArray((p.planState as PlanStateSerialized).g)
  ) return null;

  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    schemaVersion: typeof p.schemaVersion === 'number' ? p.schemaVersion : CURRENT_SCHEMA_VERSION,
    planState: p.planState as PlanStateSerialized,
  };
}

function readFromStorage(): SavedPlan[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migratePlan).filter((p): p is SavedPlan => p !== null);
  } catch {
    return [];
  }
}
```

Update `savePlan` to include `schemaVersion`:

```ts
export function savePlan(name: string, planState: PlanStateSerialized): SavedPlan {
  const plans = readFromStorage();
  const plan: SavedPlan = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Sans nom',
    createdAt: Date.now(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    planState,
  };
  plans.push(plan);
  writeToStorage(plans);
  return plan;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/savedPlans.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/savedPlans.ts src/lib/__tests__/savedPlans.test.ts
git commit -m "feat(plans): add schemaVersion field and migration to SavedPlan"
```

---

## Task 4: Fix `profesors` → `professors` typo

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/data/productions.json`
- Modify: `src/lib/productionCalculator.ts`
- Modify: `src/hooks/useCalculationChain.ts`
- Modify: `src/components/ResultSection/ChainTable.tsx`
- Modify: `src/components/ResultSection/ResultSection.tsx`
- Modify: `src/components/ProductionCalculator.tsx`
- Modify: `src/components/BuildingImage.tsx`
- Modify: `src/components/BuildingPicker.tsx`
- Modify: `src/__fixtures__/productionResults.ts`

> ⚠️ **User action required after this task:** One test file references the renamed fields and must be updated manually (per project rules, Claude cannot modify test files):
> - `src/hooks/useCalculationChain.test.ts` — line 61: rename `totalProfesors` → `totalProfessors`

- [ ] **Step 1: Rename in `productions.json`**

```bash
sed -i 's/"profesors":/"professors":/g' src/data/productions.json
```

Verify: `grep -c '"professors"' src/data/productions.json` should print > 0.

- [ ] **Step 2: Rename in all non-test TypeScript source files**

```bash
find src \( -name "*.ts" -o -name "*.tsx" \) \
  ! -name "*.test.ts" ! -name "*.test.tsx" \
  | xargs sed -i 's/Profesors/Professors/g; s/profesors/professors/g'
```

This covers all camelCase variants:
- `totalProfesors` → `totalProfessors`
- `profesorsPerBuilding` → `professorsPerBuilding`
- `maxProfesorsPerBuilding` → `maxProfessorsPerBuilding`
- `profesors:` → `professors:` (object literal keys)
- `.profesors` → `.professors` (property access)
- `profesors >` → `professors >` (comparisons)

- [ ] **Step 3: Verify no old spelling remains in non-test files**

```bash
grep -rn "profesors" src --include="*.ts" --include="*.tsx" ! --include="*.test.*"
```

Expected: no output (zero matches).

- [ ] **Step 4: Build to catch TypeScript errors**

```bash
npx tsc -b --noEmit
```

Expected: exits 0 with no errors (except potentially in test files — that is handled in the next step).

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: **75 tests pass. 1 test fails** — `useCalculationChain.test.ts` will error on `totalProfesors` (renamed field).

- [ ] **Step 6: ⚠️ User manual action — update `src/hooks/useCalculationChain.test.ts`**

Open `src/hooks/useCalculationChain.test.ts` and on line 61 rename:

```ts
// Before
expect(result.current.totalProfesors).toBeGreaterThanOrEqual(0);

// After
expect(result.current.totalProfessors).toBeGreaterThanOrEqual(0);
```

- [ ] **Step 7: Run all tests to confirm green**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/data/types.ts src/data/productions.json \
  src/lib/productionCalculator.ts \
  src/hooks/useCalculationChain.ts \
  src/components/ResultSection/ChainTable.tsx \
  src/components/ResultSection/ResultSection.tsx \
  src/components/ProductionCalculator.tsx \
  src/components/BuildingImage.tsx \
  src/components/BuildingPicker.tsx \
  src/__fixtures__/productionResults.ts \
  src/hooks/useCalculationChain.test.ts
git commit -m "refactor: rename profesors → professors in interfaces and data"
```

---

## Final verification

```bash
npm run lint
npm test
npm run build
```

Expected: lint clean, all tests pass, build succeeds.
