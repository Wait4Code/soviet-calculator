import { render } from '@testing-library/react';
import { ResultSection } from './ResultSection';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import type { WasteTableData } from '@/hooks/useCalculationChain';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const EMPTY_WASTE_DATA: WasteTableData = {
  rows: [],
  totals: { sewagePerDay: 0, mixedPerDay: 0, hazardousPerDay: 0, mixedComposition: {}, hazardousComposition: {} },
  pollutionMin: undefined, pollutionMax: undefined,
  distanceMin: undefined, distanceMax: undefined,
};

const BASE_PROPS = {
  results: [],
  disabledResources: new Set<string>(),
  hasAnySurplus: false,
  chainYear: 1980,
  effectiveSourceQuality: 50,
  sourceQualityByResource: {},
  buildingByResource: {},
  defaultBuildingByResource: {},
  vehicleConfigByResource: {},
  chargeRatioByResource: {},
  totalWorkers: 0,
  totalProfessors: 0,
  personnelBreakdown: [],
  surplusByResource: new Map<string, number>(),
  primaryResourceIds: new Set<string>(),
  chainHasLivestockBuilding: false,
  defaultVehicleId: 'excavator',
  onChangeYear: () => {},
  onToggleResource: () => {},
  onSetSourceQuality: () => {},
  onSetBuilding: () => {},
  onSetVehicleConfig: () => {},
  onSetChargeRatio: () => {},
  onResetChargeRatio: () => {},
  wasteTableData: EMPTY_WASTE_DATA,
  pollutionDistanceMode: 'q80_min' as const,
};

describe('ResultSection', () => {
  it('ne rend rien si results est vide', () => {
    const { container } = render(
      <ResultSection {...BASE_PROPS} />,
      { wrapper }
    );
    expect(container.firstChild).toBeNull();
  });
});
