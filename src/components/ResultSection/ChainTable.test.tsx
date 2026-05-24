import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
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
    <I18nextProvider i18n={i18n}>
      <ChainTableProvider value={makeCtx(ctxOverrides)}>
        <ChainTable
          results={results}
          disabledResources={props.disabledResources ?? new Set()}
          hasAnySurplus={props.hasAnySurplus ?? false}
          surplusByResource={props.surplusByResource ?? new Map()}
          primaryResourceIds={props.primaryResourceIds ?? new Set(['steel'])}
        />
      </ChainTableProvider>
    </I18nextProvider>
  );
}

describe('ChainTable', () => {
  it('renders a row for each result', () => {
    renderChainTable();
    // 1 header row + 3 data rows (steel, coal, iron) + 1 personnel row = 5 rows total
    expect(screen.getAllByRole('row').length).toBe(5);
  });

  it('calls onToggleResource when a disable button is clicked', async () => {
    const onToggleResource = vi.fn();
    renderChainTable({}, { onToggleResource });
    const user = userEvent.setup();
    // The toggle resource buttons are the icon buttons for each resource (steel, coal, iron)
    // These are the first buttons in the table (no expand buttons since no coproductBreakdown)
    const buttons = screen.getAllByRole('button');
    await user.click(buttons[0]);
    expect(onToggleResource).toHaveBeenCalledWith('steel');
  });

  it('calls onChangeYear when year input changes', () => {
    const onChangeYear = vi.fn();
    renderChainTable({}, { onChangeYear });
    const yearInput = screen.getByDisplayValue('1960');
    fireEvent.change(yearInput, { target: { value: '1970' } });
    expect(onChangeYear).toHaveBeenCalledWith(1970);
  });

  it('shows no data rows when results is empty', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <ChainTableProvider value={makeCtx()}>
          <ChainTable
            results={[]}
            disabledResources={new Set()}
            hasAnySurplus={false}
            surplusByResource={new Map()}
            primaryResourceIds={new Set()}
          />
        </ChainTableProvider>
      </I18nextProvider>
    );
    // With no results, only the header row and the always-present personnel row render
    // Total rows: 1 header + 1 personnel = 2
    expect(screen.getAllByRole('row').length).toBe(2);
  });
});
