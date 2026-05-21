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
