import { render, screen } from '@testing-library/react';
import { ChainTableProvider, useChainTableContext } from './ChainTableContext';
import type { MineVehicleConfig } from '@/lib/productionCalculator';

function Consumer() {
  const { chainYear } = useChainTableContext();
  return <span data-testid="year">{chainYear}</span>;
}

const MINIMAL_CONTEXT = {
  chainYear: 1975,
  effectiveSourceQuality: 50,
  sourceQualityByResource: {},
  buildingByResource: {},
  defaultBuildingByResource: {},
  vehicleConfigByResource: {} as Record<string, MineVehicleConfig>,
  chargeRatioByResource: {},
  totalWorkers: 0,
  totalProfessors: 0,
  personnelBreakdown: [],
  defaultVehicleId: 'e-10011d',
  chainHasLivestockBuilding: false,
  onChangeYear: () => {},
  onToggleResource: () => {},
  onSetSourceQuality: () => {},
  onSetBuilding: () => {},
  onSetVehicleConfig: () => {},
  onSetChargeRatio: () => {},
  onResetChargeRatio: () => {},
};

describe('ChainTableContext', () => {
  it('provides context values to consumers', () => {
    render(
      <ChainTableProvider value={MINIMAL_CONTEXT}>
        <Consumer />
      </ChainTableProvider>
    );
    expect(screen.getByTestId('year').textContent).toBe('1975');
  });

  it('throws when useChainTableContext is used outside provider', () => {
    // Suppress React error boundary noise
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow();
    spy.mockRestore();
  });
});
