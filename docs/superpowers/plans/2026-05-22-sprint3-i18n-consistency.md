# Sprint 3 — i18n Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make language switching work correctly end-to-end — numbers use the active locale's separator, and resource names are never hardcoded in French in the engine.

**Architecture:** Two independent changes. (1) `formatNumber` becomes locale-aware: a pure function `formatNumber(value, locale)` + a `useFormatNumber()` hook for components. (2) `ProductionResult.resourceName` becomes optional; the engine stops populating it; UI components use `t('resources.' + resourceId)` directly. `getResourceName` is kept as a non-i18n fallback.

**Tech Stack:** React, i18next, TypeScript, Vitest

**Prerequisite:** Sprint 1 completed (typo fix done — `professors` spelling applies throughout). Sprint 2 is independent — can run in parallel.

---

## Task 1: Localize `formatNumber`

**Files:**
- Modify: `src/lib/format.ts`
- Create: `src/hooks/useFormatNumber.ts`
- Create: `src/lib/__tests__/format.test.ts`

- [ ] **Step 1: Write failing tests for the new `formatNumber` signature**

Create `src/lib/__tests__/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatNumber } from '../format';

describe('formatNumber', () => {
  it('formats with fr-FR separators when locale is fr', () => {
    // In fr-FR, 3000 → "3 000" (narrow no-break space)
    const result = formatNumber(3000, 'fr');
    expect(result.replace(/\s/g, ' ')).toBe('3 000');
  });

  it('formats with en-US separators when locale is en', () => {
    // In en-US, 3000 → "3,000"
    expect(formatNumber(3000, 'en')).toBe('3,000');
  });

  it('applies significant digits (3 sig figs)', () => {
    expect(formatNumber(1234567, 'fr')).not.toBe('1 234 567'); // rounded to 3 sig figs
    expect(formatNumber(1.2345, 'en')).toBe('1.23');
  });

  it('falls back gracefully for unknown locale', () => {
    // Should not throw; returns some string
    expect(() => formatNumber(42, 'zz')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/format.test.ts
```

Expected: FAIL — `formatNumber` does not accept a second argument.

- [ ] **Step 3: Update `src/lib/format.ts`**

Replace the entire file:

```ts
/**
 * Locale-aware number formatter.
 * useGrouping: true, maximumSignificantDigits: 3
 */

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string): Intl.NumberFormat {
  if (!formatterCache.has(locale)) {
    formatterCache.set(
      locale,
      new Intl.NumberFormat(locale, {
        useGrouping: true,
        maximumSignificantDigits: 3,
      })
    );
  }
  return formatterCache.get(locale)!;
}

export function formatNumber(value: number, locale: string): string {
  return getFormatter(locale).format(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/format.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Create `src/hooks/useFormatNumber.ts`**

```ts
import { useTranslation } from 'react-i18next';
import { formatNumber as _formatNumber } from '@/lib/format';

/**
 * Returns a formatNumber function bound to the current i18n locale.
 * Use this in all React components instead of calling formatNumber directly.
 */
export function useFormatNumber(): (value: number) => string {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  return (value: number) => _formatNumber(value, locale);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/format.ts src/lib/__tests__/format.test.ts src/hooks/useFormatNumber.ts
git commit -m "feat(i18n): make formatNumber locale-aware and add useFormatNumber hook"
```

---

## Task 2: Update component call sites to use `useFormatNumber`

**Files:**
- Modify: `src/components/ResultSection/ChainTable.tsx`
- Modify: `src/components/BuildingImage.tsx`
- Modify: `src/components/BuildingPicker.tsx`
- Modify: `src/lib/productionCalculator.ts` (4 formatNumber calls inside the class)

> There are **~15 call sites** across these files. The pattern is the same in each: replace `import { formatNumber }` with `useFormatNumber`, call the hook inside the component, and use the returned function.

- [ ] **Step 1: Update `src/components/ResultSection/ChainTable.tsx`**

Replace:
```ts
import { formatNumber } from '@/lib/format';
```
With:
```ts
import { useFormatNumber } from '@/hooks/useFormatNumber';
```

Inside the `ChainTable` function body (before the return), add:
```ts
const formatNumber = useFormatNumber();
```

No other changes needed — all `formatNumber(...)` calls now use the locale-bound version.

- [ ] **Step 2: Update `src/components/BuildingImage.tsx`**

Same pattern:
```ts
// Remove:
import { formatNumber } from '@/lib/format';

// Add at top of file:
import { useFormatNumber } from '@/hooks/useFormatNumber';
```

Inside `BuildingImage` function (or whichever component calls formatNumber), add:
```ts
const formatNumber = useFormatNumber();
```

- [ ] **Step 3: Update `src/components/BuildingPicker.tsx`**

Same pattern as above — replace the import and add `const formatNumber = useFormatNumber();` inside the component.

- [ ] **Step 4: Update `src/lib/productionCalculator.ts`**

The 4 `formatNumber` calls in `productionCalculator.ts` are inside formatting helper methods (`formatResourceValue`, etc.) at the bottom of the file (lines ~1415–1460). These are NOT React components — they cannot use a hook.

Replace the 4 usages with a hardcoded locale (`'fr'`) call as a temporary measure — these methods produce strings used in tooltips that are already locale-independent (units like "MWh/jour"):

```ts
import { formatNumber } from '@/lib/format';

// Usage: formatNumber(value, 'fr')  ← explicit locale, not hook
```

Add a `// TODO(sprint-3): pass locale through CalculationConfig if these strings become user-facing` comment. This is acceptable — these methods produce internal display strings that were already always in French.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/ResultSection/ChainTable.tsx \
  src/components/BuildingImage.tsx \
  src/components/BuildingPicker.tsx \
  src/lib/productionCalculator.ts
git commit -m "feat(i18n): migrate all components to useFormatNumber hook"
```

---

## Task 3: Make `ProductionResult.resourceName` optional

**Files:**
- Modify: `src/data/types.ts`
- Modify: `src/lib/productionCalculator.ts`
- Modify: `src/hooks/useCalculationChain.ts`
- Modify: `src/__fixtures__/productionResults.ts`

- [ ] **Step 1: Make `resourceName` optional in `types.ts`**

In `src/data/types.ts`, change the `ProductionResult` interface:

```ts
// Before
resourceName: string;

// After
resourceName?: string;  // Deprecated: use t('resources.' + resourceId) in UI components
```

- [ ] **Step 2: Run TypeScript check to identify what breaks**

```bash
npx tsc -b --noEmit
```

Expected: no errors (making a required field optional is backward compatible; all existing code that reads `resourceName` now gets `string | undefined` — this is fine since existing usages all check it exists or use it in template literals where `undefined` would just render as "undefined").

- [ ] **Step 3: Stop populating `resourceName` in `productionCalculator.ts`**

In `productionCalculator.ts`, find the 14 calls to `getResourceName(...)` that assign `resourceName:` in `ProductionResult` objects. Remove or comment out each `resourceName:` assignment. The field is now optional, so omitting it is valid TypeScript.

Run this to find all sites:
```bash
grep -n "resourceName:" src/lib/productionCalculator.ts
```

For each hit, remove the `resourceName: getResourceName(someId),` line from the object literal.

- [ ] **Step 4: Stop populating `resourceName` in `useCalculationChain.ts`**

Same as above for the 3 synthetic results in `useCalculationChain.ts` (sewage, waste_mixed, waste_toxic):

```bash
grep -n "resourceName:" src/hooks/useCalculationChain.ts
```

Remove those assignments.

- [ ] **Step 5: Update fixture to remove resourceName**

In `src/__fixtures__/productionResults.ts`, remove the `resourceName` fields from all fixture objects. Since the field is now optional, this is valid.

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/data/types.ts src/lib/productionCalculator.ts src/hooks/useCalculationChain.ts src/__fixtures__/productionResults.ts
git commit -m "refactor(i18n): make ProductionResult.resourceName optional, stop populating it in engine"
```

---

## Task 4: Update UI to use `t('resources.X')` everywhere

**Files:**
- Modify: `src/components/ResultSection/ChainTable.tsx`
- Modify: `src/components/ResultSection/PollutionTable.tsx`
- Modify: `src/hooks/useCalculationChain.ts` (the `getResourceName` import can be removed)

- [ ] **Step 1: Audit all usages of `result.resourceName` in UI**

```bash
grep -rn "\.resourceName\b" src --include="*.tsx" --include="*.ts" | grep -v "\.test\."
```

For each hit, replace `result.resourceName` with `t('resources.' + result.resourceId)`.

- [ ] **Step 2: Update `ChainTable.tsx`**

The `useTranslation` hook is already imported. For each place where `result.resourceName` is read, use:

```tsx
// Before
{result.resourceName}

// After
{t(`resources.${result.resourceId}`)}
```

- [ ] **Step 3: Update `PollutionTable.tsx`**

Same pattern. Verify `useTranslation` is imported and `t` is available.

- [ ] **Step 4: Remove the unused `getResourceName` import from `useCalculationChain.ts`**

After removing `resourceName` assignments in Task 3, `getResourceName` should no longer be used in `useCalculationChain.ts`. Remove the import:

```bash
grep -n "getResourceName" src/hooks/useCalculationChain.ts
```

If the count is 0, remove the import line. If still used, leave it.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Final verification — switch language in the app**

```bash
npm run dev
```

Open `http://localhost:5173/soviet-calculator/` in a browser. Switch between French and English using the language buttons. Verify that:
- Resource names update immediately (no page reload)
- Numbers use comma separator (`3,000`) in English and space separator (`3 000`) in French

- [ ] **Step 7: Commit**

```bash
git add src/components/ResultSection/ChainTable.tsx \
  src/components/ResultSection/PollutionTable.tsx \
  src/hooks/useCalculationChain.ts
git commit -m "feat(i18n): replace resourceName usages with t('resources.X') in UI components"
```

---

## Final verification

```bash
npm run lint
npm test
npm run build
```

Expected: lint clean, all tests pass, build succeeds.
