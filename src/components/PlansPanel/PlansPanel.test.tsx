import { render, screen, fireEvent } from '@testing-library/react';
import { PlansPanel } from './PlansPanel';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import type { SavedPlan } from '@/lib/savedPlans';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const MOCK_PLAN: SavedPlan = {
  id: 'plan-1',
  name: 'Mon plan acier',
  createdAt: Date.now(),
  schemaVersion: 1,
  planState: { g: [], y: 1960 },
};

describe('PlansPanel', () => {
  it('affiche le bouton Nouveau calcul', () => {
    render(
      <PlansPanel
        savedPlansList={[]}
        currentPlanId={null}
        onNewPlan={() => {}}
        onLoadPlan={() => {}}
        onDeletePlan={() => {}}
        onRenamePlan={() => {}}
        onDuplicatePlan={() => {}}
        onSharePlan={() => {}}
      />,
      { wrapper }
    );
    expect(screen.getByRole('button', { name: /nouveau/i })).toBeInTheDocument();
  });

  it('affiche le nom d\'un plan sauvegardé', () => {
    render(
      <PlansPanel
        savedPlansList={[MOCK_PLAN]}
        currentPlanId={null}
        onNewPlan={() => {}}
        onLoadPlan={() => {}}
        onDeletePlan={() => {}}
        onRenamePlan={() => {}}
        onDuplicatePlan={() => {}}
        onSharePlan={() => {}}
      />,
      { wrapper }
    );
    expect(screen.getByText('Mon plan acier')).toBeInTheDocument();
  });

  it('appelle onLoadPlan au clic sur Charger', () => {
    const onLoad = vi.fn();
    render(
      <PlansPanel
        savedPlansList={[MOCK_PLAN]}
        currentPlanId={null}
        onNewPlan={() => {}}
        onLoadPlan={onLoad}
        onDeletePlan={() => {}}
        onRenamePlan={() => {}}
        onDuplicatePlan={() => {}}
        onSharePlan={() => {}}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /charger|load/i }));
    expect(onLoad).toHaveBeenCalledWith('plan-1');
  });

  it('affiche un input de renommage inline au clic sur Renommer', () => {
    render(
      <PlansPanel
        savedPlansList={[MOCK_PLAN]}
        currentPlanId={null}
        onNewPlan={() => {}}
        onLoadPlan={() => {}}
        onDeletePlan={() => {}}
        onRenamePlan={() => {}}
        onDuplicatePlan={() => {}}
        onSharePlan={() => {}}
      />,
      { wrapper }
    );
    fireEvent.click(screen.getByRole('button', { name: /renommer|rename/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
