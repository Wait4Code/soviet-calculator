import type { ProductionResult } from '@/data/types';
import type { MineVehicleConfig } from '@/lib/productionCalculator';
import type { PollutionDistanceMode } from '@/data/pollutionByBuilding';
import type { WasteTableData } from '@/hooks/useCalculationChain';
import { ChainTable } from './ChainTable';
import { PollutionTable } from './PollutionTable';
import { ChainTableProvider, type ChainTableContextValue } from './ChainTableContext';

export interface ResultSectionProps {
  // ChainTable props
  results: ProductionResult[];
  disabledResources: Set<string>;
  hasAnySurplus: boolean;
  chainYear: number;
  effectiveSourceQuality: number;
  sourceQualityByResource: Record<string, number>;
  buildingByResource: Record<string, string>;
  defaultBuildingByResource: Record<string, string>;
  vehicleConfigByResource: Record<string, MineVehicleConfig>;
  chargeRatioByResource: Record<string, number>;
  totalWorkers: number;
  totalProfessors: number;
  personnelBreakdown: Array<{ sourceResourceId: string; buildingName: string; workers: number; professors: number }>;
  surplusByResource: Map<string, number>;
  primaryResourceIds: Set<string>;
  chainHasLivestockBuilding: boolean;
  defaultVehicleId: string;
  onChangeYear: (year: number) => void;
  onToggleResource: (resourceId: string) => void;
  onSetSourceQuality: (resourceId: string, value: number) => void;
  onSetBuilding: (resourceId: string, buildingName: string) => void;
  onSetVehicleConfig: (resourceId: string, cfg: MineVehicleConfig) => void;
  onSetChargeRatio: (resourceId: string, value: number) => void;
  onResetChargeRatio: (resourceId: string) => void;
  // PollutionTable props
  wasteTableData: WasteTableData;
  pollutionDistanceMode: PollutionDistanceMode;
}

export function ResultSection(props: ResultSectionProps) {
  if (props.results.length === 0) return null;

  const {
    results,
    disabledResources,
    hasAnySurplus,
    chainYear,
    effectiveSourceQuality,
    sourceQualityByResource,
    buildingByResource,
    defaultBuildingByResource,
    vehicleConfigByResource,
    chargeRatioByResource,
    totalWorkers,
    totalProfessors,
    personnelBreakdown,
    surplusByResource,
    primaryResourceIds,
    chainHasLivestockBuilding,
    defaultVehicleId,
    onChangeYear,
    onToggleResource,
    onSetSourceQuality,
    onSetBuilding,
    onSetVehicleConfig,
    onSetChargeRatio,
    onResetChargeRatio,
    wasteTableData,
    pollutionDistanceMode,
  } = props;

  const showPollutionTable = wasteTableData.rows.length > 0;

  const chainTableCtx: ChainTableContextValue = {
    chainYear,
    effectiveSourceQuality,
    sourceQualityByResource,
    buildingByResource,
    defaultBuildingByResource,
    vehicleConfigByResource,
    chargeRatioByResource,
    totalWorkers,
    totalProfessors,
    personnelBreakdown,
    defaultVehicleId,
    chainHasLivestockBuilding,
    onChangeYear,
    onToggleResource,
    onSetSourceQuality,
    onSetBuilding,
    onSetVehicleConfig,
    onSetChargeRatio,
    onResetChargeRatio,
  };

  return (
    <>
      <ChainTableProvider value={chainTableCtx}>
        <ChainTable
          results={results}
          disabledResources={disabledResources}
          hasAnySurplus={hasAnySurplus}
          surplusByResource={surplusByResource}
          primaryResourceIds={primaryResourceIds}
        />
      </ChainTableProvider>
      {showPollutionTable && (
        <PollutionTable
          wasteTableData={wasteTableData}
          results={results}
          pollutionDistanceMode={pollutionDistanceMode}
        />
      )}
    </>
  );
}
