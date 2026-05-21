import { useState, useEffect, useRef, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { productionCalculator, migrateVehicleConfig } from '@/lib/productionCalculator';
import { formatNumber } from '@/lib/format';
import { getResourceIcon } from '@/data/resourceIcons';
import { Tooltip } from '@/components/Tooltip';
import { BuildingPicker } from '@/components/BuildingPicker';
import { vehicles, getVehicle, formatVehicleSkills, ORIGIN_TO_KEY } from '@/data/vehicles';
import type { ProductionResult } from '@/data/types';
import type { MineVehicleConfig } from '@/lib/productionCalculator';

const BASE = import.meta.env.BASE_URL;
const VEHICLE_PLACEHOLDER = `${BASE}vehicles/excavator.svg`;
const SIDE_EAST = `${BASE}sides/east.png`;
const SIDE_WEST = `${BASE}sides/west.png`;

const BLOC_EAST_ORIGINS = new Set([
  'Union soviétique', 'Tchécoslovaquie', 'Roumanie', 'Allemagne de l\'Est',
  'Pologne', 'Hongrie', 'Bulgarie', 'RDA',
]);

function getVehicleImageSrc(vehicle: { image?: string } | undefined): string {
  return vehicle?.image ? `${BASE}${vehicle.image}` : VEHICLE_PLACEHOLDER;
}

function getBlocForOrigin(origin: string): 'east' | 'west' {
  return BLOC_EAST_ORIGINS.has(origin) ? 'east' : 'west';
}

function getDefaultVehicleConfig(recipe: { maxVehicles?: number }, defaultVehicleId: string): MineVehicleConfig {
  const maxV = recipe.maxVehicles ?? 0;
  return {
    vehicleSlots: Array(maxV).fill(defaultVehicleId),
    allowPersonnel: false,
  };
}

export interface ChainTableProps {
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
  totalProfesors: number;
  personnelBreakdown: Array<{ sourceResourceId: string; buildingName: string; workers: number; profesors: number }>;
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
}

export function ChainTable({
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
  totalProfesors,
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
}: ChainTableProps) {
  const { t } = useTranslation();
  const [expandedChainRows, setExpandedChainRows] = useState<Set<string>>(new Set());
  const [vehicleSlotPickerOpen, setVehicleSlotPickerOpen] = useState<{ resourceId: string; slotIndex: number } | null>(null);
  const vehicleSlotPickerRef = useRef<HTMLDivElement | null>(null);

  const hasAnyMine = results.some((r) => productionCalculator.isMineResult(r.resourceId, r.buildingName));
  const hasAnyVehicleMine = results.some((r) => productionCalculator.isVehicleMineResult(r.resourceId, r.buildingName));

  useEffect(() => {
    if (!vehicleSlotPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const picker = document.querySelector('[data-vehicle-slot-picker]');
      if (picker?.contains(target)) return;
      setVehicleSlotPickerOpen(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [vehicleSlotPickerOpen]);

  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h3 className="text-xl font-bold text-soviet-gold">{t('industry.chainTitle')}</h3>
        <div className="flex items-center gap-2">
          <label htmlFor="chain-year" className="text-sm text-gray-400">{t('industry.year')}</label>
          <input
            id="chain-year"
            type="number"
            min="1960"
            max="2100"
            value={chainYear}
            onChange={(e) => onChangeYear(parseInt(e.target.value, 10) || 1960)}
            className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-3 px-4 font-semibold text-gray-300">{t('industry.resource')}</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-300 w-44">{t('industry.quantityPerDay')}</th>
              {hasAnySurplus && (
                <th className="text-right py-3 px-4 font-semibold text-gray-300 w-44">{t('industry.surplusPerDay')}</th>
              )}
              <th className="text-left py-3 px-4 font-semibold text-gray-300">{t('industry.building')}</th>
              {(hasAnyMine || hasAnyVehicleMine) && (
                <th className="text-right py-3 px-4 font-semibold text-gray-300">{t('industry.config')}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {results.map((result, index) => {
              // Les ressources non produisibles sont toujours considérées comme importées
              const isNonProducible = result.buildingName === 'Import' && result.disabled;
              const isDisabled = disabledResources.has(result.resourceId);
              const canDisable = productionCalculator.canDisableResource(result.resourceId) && !isNonProducible;
              const isImported = isNonProducible || isDisabled;

              // Convertir de par seconde à par jour
              const outputsPerDay = new Map<string, number>();
              result.outputsPerSecond.forEach((amount, resourceId) => {
                outputsPerDay.set(resourceId, amount * 24 * 60 * 60);
              });

              // Utiliser le ratio de charge réel stocké dans le résultat
              const chargePercentage = result.chargeRatio !== undefined
                ? Math.round(result.chargeRatio * 100)
                : 100;

              // Obtenir les quantités de production
              const outputEntries = Array.from(outputsPerDay.entries());
              const mainOutput = outputEntries[0];
              if (!mainOutput) return null;

              const [resourceId, amountPerDay] = mainOutput;
              const isWater = productionCalculator.isWater(resourceId);
              const isSewage = productionCalculator.isSewage(resourceId);
              const isElectricity = productionCalculator.isElectricity(resourceId);
              const isVolume = isWater || isSewage;
              const unitYearKey = isElectricity ? 'units.MWh_year' : isVolume ? 'units.m3_year' : 'units.t_year';
              const unitYear = t(unitYearKey);
              const unitShort = isElectricity ? t('units.MWh') : isVolume ? t('units.m3') : t('units.t');
              const workersPerBuilding = result.workersPerBuilding || 0;
              const profesorsPerBuilding = result.profesorsPerBuilding || 0;
              const hasVehiclePersonnelEnabled = result.hasVehiclePersonnelEnabled === true;
              const hasNoPersonnel = workersPerBuilding === 0 && profesorsPerBuilding === 0;
              const showCharge = !hasNoPersonnel || hasVehiclePersonnelEnabled;

              const hasInvalidConfig = result.invalidConfig === true;
              const nextIsCoProduct = results[index + 1]?.isCoProduct === true;
              const nextResult = results[index + 1];
              const prevResult = results[index - 1];
              // Grouper visuellement uniquement quand la ligne précédente ou suivante est du même bâtiment (vrai couple produit principal + coproduit)
              const isSameBuildingBlock =
                (result.isCoProduct && index > 0 && prevResult?.buildingName === result.buildingName) ||
                (nextIsCoProduct && nextResult?.buildingName === result.buildingName);
              const isCoProductGroupedWithPrev = result.isCoProduct && index > 0 && prevResult?.buildingName === result.buildingName;
              const rowKey = `${result.resourceId}-${result.buildingName}-${index}`;
              const hasCoproductDetail = !!(result.coproductBreakdown && result.coproductBreakdown.length > 0) || !!(result.consumptionBreakdown && result.consumptionBreakdown.length > 0);
              const isRowExpanded = expandedChainRows.has(rowKey);
              const toggleRowExpanded = () => setExpandedChainRows((prev) => {
                const next = new Set(prev);
                if (next.has(rowKey)) next.delete(rowKey);
                else next.add(rowKey);
                return next;
              });
              const chainTableColCount = 3 + (hasAnySurplus ? 1 : 0) + ((hasAnyMine || hasAnyVehicleMine) ? 1 : 0);
              return (
                <Fragment key={rowKey}>
                <tr
                  className={`h-[53px] ${nextIsCoProduct && nextResult?.buildingName === result.buildingName ? 'border-b-0' : 'border-b border-gray-700'} ${hasInvalidConfig ? 'border-2 border-red-500 bg-red-950/30 hover:bg-red-950/40' : 'hover:bg-gray-700/50'}`}
                >
                  <td className="py-3 px-4 align-middle">
                    <div className="flex items-center gap-2">
                      {hasCoproductDetail && (
                          <Tooltip content={t('industry.coproductsByBuilding')} placement="right">
                            <button
                              type="button"
                              onClick={toggleRowExpanded}
                              className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-soviet-gold transition-colors"
                              aria-expanded={isRowExpanded}
                            >
                              <span className="text-xs">{isRowExpanded ? '▼' : '▶'}</span>
                            </button>
                          </Tooltip>
                      )}
                      {getResourceIcon(result.resourceId) && (
                        canDisable ? (
                          <Tooltip content={isDisabled ? t('industry.enableResource') : t('industry.disableResource')} placement="right">
                            <button
                              type="button"
                              onClick={() => onToggleResource(result.resourceId)}
                              className={`flex-shrink-0 p-0.5 rounded transition-opacity ${isDisabled ? 'opacity-40' : 'opacity-100'}`}
                            >
                            <img
                              src={getResourceIcon(result.resourceId)}
                              alt=""
                              className="w-6 h-6 object-contain"
                            />
                          </button>
                          </Tooltip>
                        ) : (
                          <img
                            src={getResourceIcon(result.resourceId)}
                            alt=""
                            className={`w-6 h-6 object-contain flex-shrink-0 ${isDisabled ? 'opacity-40' : ''}`}
                          />
                        )
                      )}
                      <span className={isImported ? 'text-gray-400' : 'font-medium'}>
                        {t(`resources.${result.resourceId}`)}
                      </span>
                      {hasInvalidConfig && (
                        <Tooltip content={t('industry.quarryNoVehicleOrPersonnel')} placement="right">
                          <span className="text-red-400">
                            ⚠
                          </span>
                        </Tooltip>
                      )}
                      {chainHasLivestockBuilding && productionCalculator.isWater(result.resourceId) && (
                        <Tooltip content={t('industry.waterLivestockWarning')} placement="right">
                          <span className="text-amber-400" aria-label={t('industry.waterLivestockWarning')}>
                            ⚠
                          </span>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                  <td className={`py-3 px-4 text-right font-mono align-middle ${isNonProducible ? 'text-gray-400' : ''}`}>
                    {(() => {
                      const isPrimaryResource = primaryResourceIds.has(result.resourceId);
                      const surplusPerSec = isPrimaryResource ? 0 : (surplusByResource.get(result.resourceId) ?? 0);
                      const surplusPerDay = surplusPerSec * (24 * 60 * 60);
                      const requiredPerDay = Math.max(0, amountPerDay - surplusPerDay);
                      if (result.isCoProduct) {
                        return <span className="text-gray-500">—</span>;
                      }
                      if (requiredPerDay <= 0 && surplusPerDay > 0.01) {
                        return <span className="text-gray-500">—</span>;
                      }
                      const formattedRequired = isElectricity
                        ? `${productionCalculator.formatInteger(requiredPerDay * 60)} ${unitShort}`
                        : `${productionCalculator.formatValue(requiredPerDay)} ${unitShort}`;
                      const requiredPerYear = productionCalculator.floor(requiredPerDay * 365);
                      const tooltipContent = isElectricity
                        ? `${productionCalculator.formatInteger(requiredPerDay * 60 * 365)} ${unitYear}`
                        : `${productionCalculator.formatInteger(requiredPerYear)} ${unitYear}`;
                      return (
                        <Tooltip content={tooltipContent} placement="top">
                          <span>{formattedRequired}</span>
                        </Tooltip>
                      );
                    })()}
                  </td>
                  {hasAnySurplus && (
                    <td className="py-3 px-4 text-right font-mono align-middle">
                      {(() => {
                        const isPrimaryResource = primaryResourceIds.has(result.resourceId);
                        const surplusPerSec = isPrimaryResource ? 0 : (surplusByResource.get(result.resourceId) ?? 0);
                        const surplusPerDay = surplusPerSec * (24 * 60 * 60);
                        const surplusToShow = result.isCoProduct ? amountPerDay : surplusPerDay;
                        if (surplusToShow <= 0.01) return <span className="text-gray-500">—</span>;
                        const surplusFormatted = isElectricity
                          ? `${productionCalculator.formatInteger(surplusToShow * 60)} ${unitShort}`
                          : `${productionCalculator.formatValue(surplusToShow)} ${unitShort}`;
                        const surplusPerYearFormatted = isElectricity
                          ? `${productionCalculator.formatInteger(surplusToShow * 60 * 365)} ${unitYear}`
                          : `${productionCalculator.formatInteger(surplusToShow * 365)} ${unitYear}`;
                        return (
                          <Tooltip content={surplusPerYearFormatted} placement="top">
                            <span className="text-soviet-gold">+ {surplusFormatted}</span>
                          </Tooltip>
                        );
                      })()}
                    </td>
                  )}
                  <td
                    className={`py-3 px-4 text-gray-400 align-middle ${isSameBuildingBlock ? 'border-l border-gray-600' : ''} ${isCoProductGroupedWithPrev ? 'border-t-0 pt-0' : ''} ${!result.isCoProduct && nextIsCoProduct && nextResult?.buildingName === result.buildingName ? 'border-b-0 pb-0' : ''}`}
                  >
                    {result.isCoProduct ? null : (isImported ? '' : (() => {
                      const recipesForResource = productionCalculator.findRecipesProducing(result.resourceId);
                      const rawLabel = buildingByResource[result.resourceId] ?? defaultBuildingByResource[result.resourceId] ?? result.buildingName;
                      const names = recipesForResource.map((r) => r.name);
                      const buildingLabel = names.includes(rawLabel) ? rawLabel : result.buildingName;
                      const selectedRecipe = recipesForResource.find((r) => r.name === buildingLabel) ?? recipesForResource[0];
                      return (
                        <div className="flex items-center gap-2 flex-wrap">
                          {selectedRecipe && (
                            <BuildingPicker
                              recipes={recipesForResource}
                              selectedRecipe={selectedRecipe}
                              onSelect={(r) => onSetBuilding(result.resourceId, r.name)}
                              size={36}
                            />
                          )}
                          {showCharge ? (
                            <span className="flex items-center gap-1 flex-wrap">
                              <Tooltip content={`${formatNumber(workersPerBuilding)} ${t('tooltips.workersBlue')}${profesorsPerBuilding > 0 ? `, ${formatNumber(profesorsPerBuilding)} ${t('tooltips.workersWhite')}` : ''}`} placement="top">
                                <span> x {formatNumber(result.buildingCount)} - {formatNumber(chargePercentage)} %</span>
                              </Tooltip>
                              {!isImported && (
                                <span className="flex items-center gap-1">
                                  {chargePercentage < 100 && (
                                    <Tooltip content={t('industry.chargeTo100')} placement="top">
                                      <button
                                        type="button"
                                        onClick={() => onSetChargeRatio(result.resourceId, 1)}
                                        className="text-xs px-1.5 py-0.5 rounded bg-gray-700 hover:bg-soviet-gold hover:text-gray-900 text-soviet-gold"
                                      >
                                        ➞100 %
                                      </button>
                                    </Tooltip>
                                  )}
                                  {chargeRatioByResource[result.resourceId] !== undefined && (
                                    <Tooltip content={t('industry.resetCharge')} placement="top">
                                      <button
                                        type="button"
                                        onClick={() => onResetChargeRatio(result.resourceId)}
                                        className="text-xs px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-500 text-gray-400"
                                      >
                                        ✕
                                      </button>
                                    </Tooltip>
                                  )}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span> x {formatNumber(result.buildingCount)}</span>
                          )}
                        </div>
                      );
                    })())}
                  </td>
                  {(hasAnyMine || hasAnyVehicleMine) && (
                    <td
                      className={`py-3 px-4 text-right align-middle ${isCoProductGroupedWithPrev ? 'border-t-0 pt-0' : ''} ${!result.isCoProduct && nextIsCoProduct && nextResult?.buildingName === result.buildingName ? 'border-b-0 pb-0' : ''}`}
                    >
                      {result.isCoProduct ? null : (
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {!isImported && productionCalculator.isMineResult(result.resourceId, result.buildingName) && (
                          <Tooltip content={t('industry.qualitySource')} placement="top">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={sourceQualityByResource[result.resourceId] ?? effectiveSourceQuality}
                              onChange={(e) => onSetSourceQuality(result.resourceId, parseFloat(e.target.value) || 50)}
                              className="w-14 h-6 bg-gray-700 border border-gray-600 rounded px-2 text-sm text-white text-right"
                            />
                            <span className="text-gray-400 text-xs">%</span>
                          </div>
                          </Tooltip>
                        )}
                        {!isImported && productionCalculator.isVehicleMineResult(result.resourceId, result.buildingName) && (() => {
                          const recipe = productionCalculator.getRecipe(result.resourceId, result.buildingName);
                          if (!recipe) return null;
                          const maxVehicles = recipe.maxVehicles ?? 0;
                          const skill = recipe.vehicleSkill ?? 'excavator';
                          const excavatorVehicles = Array.from(vehicles.values()).filter((v) => (v.skills[skill] ?? 0) > 0);
                          const rawCfg = vehicleConfigByResource[result.resourceId] ?? getDefaultVehicleConfig(recipe, defaultVehicleId);
                          const cfg = migrateVehicleConfig(rawCfg, maxVehicles, defaultVehicleId);
                          const slots = cfg.vehicleSlots;
                          const allowPersonnel = cfg.allowPersonnel;
                          const workersIcon = getResourceIcon('workers');
                          return (
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {/* Toggle personnel : icône cliquable, grisée si non coché */}
                              {workersIcon && (
                                <Tooltip content={allowPersonnel ? t('tooltips.personnelOn') : t('tooltips.personnelOff')} placement="top">
                                  <button
                                    type="button"
                                    onClick={() => onSetVehicleConfig(result.resourceId, {
                                      ...cfg,
                                      allowPersonnel: !allowPersonnel,
                                    })}
                                    className={`flex-shrink-0 w-8 h-8 rounded overflow-hidden flex items-center justify-center transition-opacity ${allowPersonnel ? 'opacity-100' : 'opacity-40'}`}
                                  >
                                    <img src={workersIcon} alt="" className="w-full h-full object-contain invert" />
                                  </button>
                                </Tooltip>
                              )}
                              {/* Emplacements véhicules : image par slot, clic ouvre picker */}
                              {Array.from({ length: maxVehicles }, (_, slotIdx) => {
                                const vehicleId = slots[slotIdx] ?? null;
                                const vehicle = vehicleId ? getVehicle(vehicleId) : undefined;
                                const isPickerOpen = vehicleSlotPickerOpen?.resourceId === result.resourceId && vehicleSlotPickerOpen?.slotIndex === slotIdx;
                                return (
                                  <div key={slotIdx} ref={vehicleSlotPickerRef} className="relative">
                                    <Tooltip content={vehicle ? vehicle.name : t('tooltips.chooseVehicle')} placement="top">
                                    <button
                                      type="button"
                                      onClick={() => setVehicleSlotPickerOpen((o) =>
                                        o?.resourceId === result.resourceId && o?.slotIndex === slotIdx
                                          ? null
                                          : { resourceId: result.resourceId, slotIndex: slotIdx }
                                      )}
                                      className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-gray-700 border-2 border-gray-600 hover:border-soviet-gold flex items-center justify-center transition-colors"
                                    >
                                      <img
                                        src={vehicle ? getVehicleImageSrc(vehicle) : VEHICLE_PLACEHOLDER}
                                        alt=""
                                        className={`w-full h-full object-contain p-0.5 ${!vehicle ? 'opacity-50' : ''}`}
                                      />
                                    </button>
                                    </Tooltip>
                                    {isPickerOpen && (
                                      <div
                                        data-vehicle-slot-picker
                                        className="absolute right-0 top-full mt-1 z-50 w-72 max-h-64 overflow-y-auto rounded-lg bg-gray-800 border border-gray-600 shadow-xl py-2"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const next = [...(cfg.vehicleSlots ?? slots)];
                                            next[slotIdx] = null;
                                            onSetVehicleConfig(result.resourceId, { ...cfg, vehicleSlots: next });
                                            setVehicleSlotPickerOpen(null);
                                          }}
                                          className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-700 transition-colors text-gray-400"
                                        >
                                          <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-gray-700 flex items-center justify-center">
                                            <span className="text-xs">{t('industry.emptySlot')}</span>
                                          </div>
                                          <span>{t('industry.emptySlot')}</span>
                                        </button>
                                        {excavatorVehicles.map((v) => (
                                          <button
                                            key={v.id}
                                            type="button"
                                            onClick={() => {
                                              const next = [...(cfg.vehicleSlots ?? slots)];
                                              next[slotIdx] = v.id;
                                              onSetVehicleConfig(result.resourceId, { ...cfg, vehicleSlots: next });
                                              setVehicleSlotPickerOpen(null);
                                            }}
                                            className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-700 transition-colors ${v.id === vehicleId ? 'bg-gray-700/80' : ''}`}
                                          >
                                            <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-gray-700 flex items-center justify-center">
                                              <img src={getVehicleImageSrc(v)} alt="" className="w-full h-full object-contain p-0.5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <p className="font-medium text-white truncate text-sm">{v.name}</p>
                                              <p className="text-xs text-gray-400">
                                                <span className="inline-flex items-center gap-1">
                                                  <img src={getBlocForOrigin(v.origin) === 'east' ? SIDE_EAST : SIDE_WEST} alt="" className="w-3 h-3" />
                                                  {ORIGIN_TO_KEY[v.origin] ? t(`origins.${ORIGIN_TO_KEY[v.origin]}`) : v.origin} · {formatVehicleSkills(v)}
                                                </span>
                                              </p>
                                            </div>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                      )}
                    </td>
                  )}
                </tr>
                {isRowExpanded && hasCoproductDetail && (result.coproductBreakdown || result.consumptionBreakdown) && (
                  <tr className="border-b border-gray-700 bg-gray-800/80">
                    <td colSpan={chainTableColCount} className="py-2 px-4 pl-12 text-sm text-gray-300">
                      <div>
                        <p className="text-gray-500 font-medium mb-1">{t('industry.coproductsByBuilding')}</p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {result.coproductBreakdown?.map((entry, i) => (
                            <li key={`co-${entry.sourceResourceId}-${entry.buildingName}-${i}`}>
                              {t(`resources.${entry.sourceResourceId}`)} ({t(`buildings:${entry.buildingName}`)}): {productionCalculator.formatValue(entry.amountPerSecond * 24 * 60 * 60)} {t('units.m3_day')}
                            </li>
                          ))}
                          {result.consumptionBreakdown?.map((entry, i) => {
                            const isElec = result.resourceId === 'eletric';
                            const amountPerDay = entry.amountPerSecond * 24 * 60 * 60;
                            const unitKey = isElec ? 'units.MWh_day' : 'units.m3_day';
                            return (
                              <li key={`cons-${entry.sourceResourceId}-${entry.buildingName}-${i}`}>
                                {t(`resources.${entry.sourceResourceId}`)} ({t(`buildings:${entry.buildingName}`)}): {isElec ? productionCalculator.formatInteger(amountPerDay) : productionCalculator.formatValue(amountPerDay)} {t(unitKey)}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}

            {/* Ligne Personnels */}
            {(() => {
              const personnelRowKey = 'personnel';
              const isPersonnelExpanded = expandedChainRows.has(personnelRowKey);
              const togglePersonnelExpanded = () => setExpandedChainRows((prev) => {
                const next = new Set(prev);
                if (next.has(personnelRowKey)) next.delete(personnelRowKey);
                else next.add(personnelRowKey);
                return next;
              });
              const personnelColCount = 3 + (hasAnySurplus ? 1 : 0) + ((hasAnyMine || hasAnyVehicleMine) ? 1 : 0);
              return (
                <Fragment key={personnelRowKey}>
                  <tr className="border-b border-gray-700 hover:bg-gray-700/50 h-[53px]">
                    <td className="py-3 px-4 align-middle">
                      <div className="flex items-center gap-2">
                        {(personnelBreakdown?.length ?? 0) > 0 && (
                          <Tooltip content={t('industry.coproductsByBuilding')} placement="right">
                            <button
                              type="button"
                              onClick={togglePersonnelExpanded}
                              className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-soviet-gold transition-colors"
                              aria-expanded={isPersonnelExpanded}
                            >
                              <span className="text-xs">{isPersonnelExpanded ? '▼' : '▶'}</span>
                            </button>
                          </Tooltip>
                        )}
                        {getResourceIcon('workers') && (
                          <img
                            src={getResourceIcon('workers')}
                            alt=""
                            className="w-6 h-6 object-contain flex-shrink-0 invert"
                          />
                        )}
                        <span className="text-gray-400">{t('tooltips.personnels')}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-400 align-middle">
                      <Tooltip content={`${formatNumber(totalWorkers)} ${t('tooltips.workersBlue')}, ${formatNumber(totalProfesors)} ${t('tooltips.workersWhite')}`} placement="top">
                        <span>{formatNumber(totalWorkers + totalProfesors)}</span>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-4 text-gray-400 align-middle">
                      {/* Vide - Bâtiment */}
                    </td>
                    {(hasAnyMine || hasAnyVehicleMine) && <td className="py-3 px-4 text-gray-400 align-middle" />}
                  </tr>
                  {isPersonnelExpanded && (personnelBreakdown?.length ?? 0) > 0 && (
                    <tr className="border-b border-gray-700 bg-gray-800/80">
                      <td colSpan={personnelColCount} className="py-2 px-4 pl-12 text-sm text-gray-300">
                        <div>
                          <p className="text-gray-500 font-medium mb-1">{t('industry.coproductsByBuilding')}</p>
                          <ul className="list-disc list-inside space-y-0.5">
                            {(personnelBreakdown ?? []).map((entry, i) => (
                              <li key={`personnel-${entry.sourceResourceId}-${entry.buildingName}-${i}`}>
                                {t(`resources.${entry.sourceResourceId}`)} ({t(`buildings:${entry.buildingName}`)}): {formatNumber(entry.workers)} {t('tooltips.workersBlue')}{entry.profesors > 0 ? `, ${formatNumber(entry.profesors)} ${t('tooltips.workersWhite')}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}
