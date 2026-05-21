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
