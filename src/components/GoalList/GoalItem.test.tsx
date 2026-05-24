import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { GoalItem } from './GoalItem';
import { productionCalculator } from '@/lib/productionCalculator';

const ALL_PRODUCTIONS = productionCalculator.getAllProductions();

const DEFAULT_GOAL = {
  id: 'goal-1',
  resourceId: 'steel',
  buildingName: 'steel_mill_v2',
  inputType: 'buildings' as const,
  value: 1,
};

function renderGoalItem(overrides: Partial<React.ComponentProps<typeof GoalItem>> = {}) {
  return render(
    <I18nextProvider i18n={i18n}>
      <GoalItem
        goal={DEFAULT_GOAL}
        allProductions={ALL_PRODUCTIONS}
        onRemove={vi.fn()}
        onUpdate={vi.fn()}
        onSetResource={vi.fn()}
        {...overrides}
      />
    </I18nextProvider>
  );
}

describe('GoalItem', () => {
  it('renders the remove button and resource picker', () => {
    renderGoalItem();
    // When the dropdown is closed, exactly 2 buttons are rendered:
    // the remove button (✕) and the ResourcePicker toggle button
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(2);
    // Remove button is identifiable by its label
    expect(screen.getByRole('button', { name: '✕' })).toBeInTheDocument();
    // ResourcePicker toggle button has no text label (shows an icon)
    const pickerButton = buttons.find((b) => b.textContent !== '✕');
    expect(pickerButton).toBeInTheDocument();
  });

  it('calls onUpdate when value changes', async () => {
    const onUpdate = vi.fn();
    renderGoalItem({ onUpdate });
    const user = userEvent.setup();
    // There are 3 spinbuttons: buildings, perDay, perYear — use the first one (buildings)
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs.length).toBe(3);
    await user.click(inputs[0]);
    await user.keyboard('{Control>}a{/Control}5');
    expect(onUpdate).toHaveBeenLastCalledWith({ inputType: 'buildings', value: 5 });
  });

  it('calls onRemove when remove button is clicked', async () => {
    const onRemove = vi.fn();
    renderGoalItem({ onRemove });
    const user = userEvent.setup();
    const removeBtn = screen.getByRole('button', { name: '✕' });
    await user.click(removeBtn);
    expect(onRemove).toHaveBeenCalled();
  });
});
