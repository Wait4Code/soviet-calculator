import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { PollutionTable } from './PollutionTable';
import type { WasteTableData } from '@/hooks/useCalculationChain';
import { STEEL_CHAIN_RESULTS } from '@/__fixtures__/productionResults';

const [STEEL_RESULT] = STEEL_CHAIN_RESULTS;

const EMPTY_WASTE: WasteTableData = {
  rows: [],
  totals: { sewagePerDay: 0, mixedPerDay: 0, hazardousPerDay: 0, mixedComposition: {}, hazardousComposition: {} },
  pollutionMin: undefined,
  pollutionMax: undefined,
};

const WASTE_WITH_ROW: WasteTableData = {
  rows: [{
    sourceResourceId: 'steel',
    buildingName: 'steel_mill_v2',
    sewagePerDay: 10,
    mixedPerDay: 5,
    hazardousPerDay: 0,
    mixedComposition: {},
    hazardousComposition: {},
    pollutionTPerYear: undefined,
    safetyDistance: undefined,
  }],
  totals: { sewagePerDay: 10, mixedPerDay: 5, hazardousPerDay: 0, mixedComposition: {}, hazardousComposition: {} },
  pollutionMin: undefined,
  pollutionMax: undefined,
};

function renderPollutionTable(props: React.ComponentProps<typeof PollutionTable>) {
  return render(
    <I18nextProvider i18n={i18n}>
      <PollutionTable {...props} />
    </I18nextProvider>
  );
}

describe('PollutionTable', () => {
  it('renders rows when waste data is present', () => {
    renderPollutionTable({
      wasteTableData: WASTE_WITH_ROW,
      results: [STEEL_RESULT],
      pollutionDistanceMode: 'q80_min',
    });
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
  });

  it('renders nothing when waste data is empty', () => {
    const { container } = renderPollutionTable({
      wasteTableData: EMPTY_WASTE,
      results: [],
      pollutionDistanceMode: 'q80_min',
    });
    // PollutionTable returns null for empty rows
    expect(container.firstChild).toBeNull();
  });
});
