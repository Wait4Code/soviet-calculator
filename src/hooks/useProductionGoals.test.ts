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
