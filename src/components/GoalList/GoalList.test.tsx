import { render, screen, fireEvent } from '@testing-library/react';
import { GoalList } from './GoalList';
import { STEEL_GOAL } from '@/__fixtures__/productionResults';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe('GoalList', () => {
  const mockAllProductions = [
    { resourceId: 'steel', resourceName: 'Acier', recipes: [{ name: 'steel_mill_v2', production: 1, workers: 200, profesors: 0, consumption: {} }] },
  ];

  it('affiche un objectif', () => {
    render(
      <GoalList
        goals={[STEEL_GOAL]}
        allProductions={mockAllProductions as never}
        effectiveBuildingByResource={{}}
        onAddGoal={() => {}}
        onRemoveGoal={() => {}}
        onUpdateGoal={() => {}}
        onSetGoalResource={() => {}}
      />,
      { wrapper }
    );
    expect(screen.getByRole('button', { name: /ajouter/i })).toBeInTheDocument();
  });

  it('appelle onAddGoal au clic sur le bouton ajouter', () => {
    const onAdd = vi.fn();
    render(
      <GoalList
        goals={[STEEL_GOAL]}
        allProductions={mockAllProductions as never}
        effectiveBuildingByResource={{}}
        onAddGoal={onAdd}
        onRemoveGoal={() => {}}
        onUpdateGoal={() => {}}
        onSetGoalResource={() => {}}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /ajouter/i }));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
