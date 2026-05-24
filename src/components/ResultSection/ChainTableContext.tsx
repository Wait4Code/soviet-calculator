import { createContext, useContext, type ReactNode } from 'react';
import type { MineVehicleConfig } from '@/lib/productionCalculator';

export interface ChainTableContextValue {
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
  defaultVehicleId: string;
  chainHasLivestockBuilding: boolean;
  onChangeYear: (year: number) => void;
  onToggleResource: (resourceId: string) => void;
  onSetSourceQuality: (resourceId: string, value: number) => void;
  onSetBuilding: (resourceId: string, buildingName: string) => void;
  onSetVehicleConfig: (resourceId: string, cfg: MineVehicleConfig) => void;
  onSetChargeRatio: (resourceId: string, value: number) => void;
  onResetChargeRatio: (resourceId: string) => void;
}

const ChainTableContext = createContext<ChainTableContextValue | null>(null);

export function ChainTableProvider({
  value,
  children,
}: {
  value: ChainTableContextValue;
  children: ReactNode;
}) {
  return (
    <ChainTableContext.Provider value={value}>
      {children}
    </ChainTableContext.Provider>
  );
}

export function useChainTableContext(): ChainTableContextValue {
  const ctx = useContext(ChainTableContext);
  if (!ctx) throw new Error('useChainTableContext must be used inside ChainTableProvider');
  return ctx;
}
