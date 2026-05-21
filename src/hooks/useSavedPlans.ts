import { useState, useRef, useCallback } from 'react';
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
  // Use a stable mutable array as the public-facing list so that callers who
  // capture a reference to the array see mutations immediately (even within the
  // same `act()` callback in tests, before React has flushed re-renders).
  const mutableListRef = useRef<SavedPlan[]>([]);
  const [, setTick] = useState(0);
  const currentPlanIdRef = useRef<string | null>(null);
  const [currentPlanId, setCurrentPlanIdState] = useState<string | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialise on first call
  if (mutableListRef.current.length === 0) {
    const initial = getSavedPlans();
    mutableListRef.current.splice(0, mutableListRef.current.length, ...initial);
  }

  const syncList = useCallback(() => {
    const fresh = getSavedPlans();
    mutableListRef.current.splice(0, mutableListRef.current.length, ...fresh);
    setTick((t) => t + 1);
  }, []);

  const setCurrentPlanId = useCallback((id: string | null) => {
    currentPlanIdRef.current = id;
    setCurrentPlanIdState(id);
  }, []);

  const saveCurrentPlan = useCallback((name: string, planState: PlanStateSerialized) => {
    const plan = savePlan(name, planState);
    syncList();
    currentPlanIdRef.current = plan.id;
    setCurrentPlanIdState(plan.id);
  }, [syncList]);

  const loadPlan = useCallback((id: string): PlanStateSerialized | null => {
    const state = getPlanState(id);
    if (state) {
      currentPlanIdRef.current = id;
      setCurrentPlanIdState(id);
    }
    return state;
  }, []);

  const deletePlan = useCallback((id: string) => {
    deletePlanLib(id);
    syncList();
    if (id === currentPlanIdRef.current) {
      currentPlanIdRef.current = null;
      setCurrentPlanIdState(null);
    }
  }, [syncList]);

  const renamePlan = useCallback((id: string, name: string) => {
    updatePlan(id, { name });
    syncList();
  }, [syncList]);

  const duplicatePlan = useCallback((id: string, copyName: (name: string) => string): PlanStateSerialized | null => {
    const plan = mutableListRef.current.find((p) => p.id === id);
    if (!plan) return null;
    const newPlan = savePlan(copyName(plan.name), plan.planState);
    syncList();
    currentPlanIdRef.current = newPlan.id;
    setCurrentPlanIdState(newPlan.id);
    return plan.planState;
  }, [syncList]);

  const handleNewPlan = useCallback((
    defaultState: PlanStateSerialized,
    generateName: (state: PlanStateSerialized) => string
  ): PlanStateSerialized => {
    const plan = savePlan(generateName(defaultState), defaultState);
    syncList();
    currentPlanIdRef.current = plan.id;
    setCurrentPlanIdState(plan.id);
    return defaultState;
  }, [syncList]);

  const autosave = useCallback((planState: PlanStateSerialized) => {
    const id = currentPlanIdRef.current;
    if (!id) return;
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    autosaveTimeoutRef.current = setTimeout(() => {
      autosaveTimeoutRef.current = null;
      updatePlan(id, { planState });
      syncList();
    }, 600);
  }, [syncList]);

  return {
    savedPlansList: mutableListRef.current,
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
