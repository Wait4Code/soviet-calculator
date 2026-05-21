import { useState, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { productionCalculator } from '@/lib/productionCalculator';
import { getResourceIcon } from '@/data/resourceIcons';
import { getBuildingImageUrls } from '@/data/buildingIcons';
import { getSafetyDistance, type PollutionDistanceMode } from '@/data/pollutionByBuilding';
import { Tooltip } from '@/components/Tooltip';
import type { ProductionResult } from '@/data/types';
import type { WasteTableData } from '@/hooks/useCalculationChain';

export interface PollutionTableProps {
  wasteTableData: WasteTableData;
  results: ProductionResult[];
  pollutionDistanceMode: PollutionDistanceMode;
}

const WASTE_COMPOSITION_LABEL_KEY: Record<string, string> = {
  construction: 'waste_construction',
  metal_scrap: 'waste_steel',
  aluminium_scrap: 'waste_aluminium',
  plastic: 'waste_plastic',
  bio: 'waste_bio',
  fertilizer: 'fertiliser',
  burnable: 'waste_burnable',
  hazardous: 'waste_toxic',
  other: 'waste_other',
  ash: 'waste_ash',
};

/** Column order: Aluminium, Metal, Construction, Plastic, Bio, Fertilizer, Burnable, Hazardous, Other, Ash */
const WASTE_TYPE_ORDER: string[] = ['aluminium_scrap', 'metal_scrap', 'construction', 'plastic', 'bio', 'fertilizer', 'burnable', 'hazardous', 'other', 'ash'];

const WASTE_TOTAL_ROW_KEY = '__total__';

function sortWasteTypes(types: string[]): string[] {
  return types.slice().sort((a, b) => {
    const i = WASTE_TYPE_ORDER.indexOf(a);
    const j = WASTE_TYPE_ORDER.indexOf(b);
    if (i === -1 && j === -1) return a.localeCompare(b);
    if (i === -1) return 1;
    if (j === -1) return -1;
    return i - j;
  });
}

export function PollutionTable({ wasteTableData, results, pollutionDistanceMode }: PollutionTableProps) {
  const { t } = useTranslation();
  const [expandedWasteRows, setExpandedWasteRows] = useState<Set<string>>(new Set());

  if (wasteTableData.rows.length === 0) return null;

  const sdValues = wasteTableData.rows
    .map((r) => r.safetyDistance != null ? getSafetyDistance(r.safetyDistance, pollutionDistanceMode) : null)
    .filter((v): v is number => v != null);
  const distanceMin = sdValues.length > 0 ? Math.min(...sdValues) : undefined;
  const distanceMax = sdValues.length > 0 ? Math.max(...sdValues) : undefined;

  const hasTotalDetail =
    Object.keys(wasteTableData.totals.mixedComposition).length > 0 ||
    Object.keys(wasteTableData.totals.hazardousComposition).length > 0;
  const allTypesForTotal = sortWasteTypes(
    Array.from(
      new Set([
        ...Object.keys(wasteTableData.totals.mixedComposition),
        ...Object.keys(wasteTableData.totals.hazardousComposition),
      ])
    )
  );

  const renderCompositionTable = (
    mixedComp: Record<string, number>,
    hazardousComp: Record<string, number>,
    types: string[]
  ) => {
    const sortedTypes = sortWasteTypes(types);
    const mixedTotal = sortedTypes.reduce((s, k) => s + (mixedComp[k] ?? 0), 0);
    const hazardousTotal = sortedTypes.reduce((s, k) => s + (hazardousComp[k] ?? 0), 0);
    const columnTotals = sortedTypes.map((k) => (mixedComp[k] ?? 0) + (hazardousComp[k] ?? 0));
    const grandTotal = mixedTotal + hazardousTotal;
    return (
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-gray-500 border-b border-gray-600">
            <th className="py-1 pr-3 text-left font-normal w-24" />
            {sortedTypes.map((typeKey) => {
              const iconId = WASTE_COMPOSITION_LABEL_KEY[typeKey] ?? typeKey;
              const icon = getResourceIcon(iconId);
              return (
                <th key={typeKey} className="py-1 px-2 text-right font-normal">
                  <span className="inline-flex items-center justify-end gap-1">
                    {icon && <img src={icon} alt="" className="w-4 h-4 object-contain" />}
                    {t(`resources.${iconId}`)}
                  </span>
                </th>
              );
            })}
            <th className="py-1 px-2 text-right font-medium text-gray-400 border-l-2 border-gray-500">
              {t('industry.wasteTableTotal')}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-700/50">
            <td className="py-1 pr-3 text-gray-400">
              <span className="inline-flex items-center gap-1">
                {getResourceIcon('waste_mixed') && (
                  <img src={getResourceIcon('waste_mixed')!} alt="" className="w-4 h-4 object-contain" />
                )}
                {t('industry.wasteCategoryMixed')}
              </span>
            </td>
            {sortedTypes.map((typeKey) => (
              <td key={typeKey} className="py-1 px-2 text-right font-mono text-gray-300">
                {(mixedComp[typeKey] ?? 0) > 0
                  ? `${productionCalculator.formatValue(mixedComp[typeKey])} ${t('units.t_day')}`
                  : '—'}
              </td>
            ))}
            <td className="py-1 px-2 text-right font-mono font-medium text-gray-300 border-l-2 border-gray-500">
              {mixedTotal > 0 ? `${productionCalculator.formatValue(mixedTotal)} ${t('units.t_day')}` : '—'}
            </td>
          </tr>
          <tr className="border-b border-gray-700/50">
            <td className="py-1 pr-3 text-gray-400">
              <span className="inline-flex items-center gap-1">
                {getResourceIcon('waste_toxic') && (
                  <img src={getResourceIcon('waste_toxic')!} alt="" className="w-4 h-4 object-contain" />
                )}
                {t('industry.wasteCategoryHazardous')}
              </span>
            </td>
            {sortedTypes.map((typeKey) => (
              <td key={typeKey} className="py-1 px-2 text-right font-mono text-gray-300">
                {(hazardousComp[typeKey] ?? 0) > 0
                  ? `${productionCalculator.formatValue(hazardousComp[typeKey])} ${t('units.t_day')}`
                  : '—'}
              </td>
            ))}
            <td className="py-1 px-2 text-right font-mono font-medium text-gray-300 border-l-2 border-gray-500">
              {hazardousTotal > 0 ? `${productionCalculator.formatValue(hazardousTotal)} ${t('units.t_day')}` : '—'}
            </td>
          </tr>
          <tr className="border-t-2 border-gray-500 font-medium text-gray-300">
            <td className="py-1 pr-3 border-t-2 border-gray-500">{t('industry.wasteTableTotal')}</td>
            {columnTotals.map((tot, i) => (
              <td key={sortedTypes[i]} className="py-1 px-2 text-right font-mono border-t-2 border-gray-500">
                {tot > 0 ? `${productionCalculator.formatValue(tot)} ${t('units.t_day')}` : '—'}
              </td>
            ))}
            <td className="py-1 px-2 text-right font-mono border-t-2 border-l-2 border-gray-500">
              {grandTotal > 0 ? `${productionCalculator.formatValue(grandTotal)} ${t('units.t_day')}` : '—'}
            </td>
          </tr>
        </tbody>
      </table>
    );
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h3 className="text-lg font-semibold text-soviet-gold mb-4">{t('industry.wasteAndSewageTitle')}</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-600 text-left text-gray-300 text-sm">
              <th className="py-2 px-3 font-medium w-8" aria-hidden />
              <th className="py-2 px-3 font-medium">{t('industry.wasteTableBuilding')}</th>
              <th className="py-2 px-3 text-right font-medium">
                <span className="inline-flex items-center justify-end gap-1">
                  {getResourceIcon('sewage') && (
                    <img src={getResourceIcon('sewage')!} alt="" className="w-5 h-5 object-contain" />
                  )}
                  {t('resources.sewage')}
                </span>
              </th>
              <th className="py-2 px-3 text-right font-medium">
                <span className="inline-flex items-center justify-end gap-1">
                  {getResourceIcon('waste_mixed') && (
                    <img src={getResourceIcon('waste_mixed')!} alt="" className="w-5 h-5 object-contain" />
                  )}
                  {t('resources.waste_mixed')}
                </span>
              </th>
              <th className="py-2 px-3 text-right font-medium">
                <span className="inline-flex items-center justify-end gap-1">
                  {getResourceIcon('waste_toxic') && (
                    <img src={getResourceIcon('waste_toxic')!} alt="" className="w-5 h-5 object-contain" />
                  )}
                  {t('resources.waste_toxic')}
                </span>
              </th>
              <th className="py-2 px-3 text-right font-medium">
                <span className="inline-flex items-center justify-end gap-1">
                  {getResourceIcon('pollution') && (
                    <img src={getResourceIcon('pollution')!} alt="" className="w-5 h-5 object-contain" />
                  )}
                  {t('industry.wasteTablePollution')}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {wasteTableData.rows.map((row) => {
              const rowKey = `${row.sourceResourceId}|${row.buildingName}`;
              const chainResult = results.find(
                (r) => r.resourceId === row.sourceResourceId && r.buildingName === row.buildingName
              );
              const isExpanded = expandedWasteRows.has(rowKey);
              const toggle = () =>
                setExpandedWasteRows((prev) => {
                  const next = new Set(prev);
                  if (next.has(rowKey)) next.delete(rowKey);
                  else next.add(rowKey);
                  return next;
                });
              const hasDetail =
                Object.keys(row.mixedComposition).length > 0 ||
                Object.keys(row.hazardousComposition).length > 0;
              const allTypes = Array.from(
                new Set([
                  ...Object.keys(row.mixedComposition),
                  ...Object.keys(row.hazardousComposition),
                ])
              );
              const buildingUrls = getBuildingImageUrls(row.buildingName);
              return (
                <Fragment key={rowKey}>
                  <tr className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="py-2 px-1">
                      {hasDetail ? (
                        <button
                          type="button"
                          onClick={toggle}
                          className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-soviet-gold transition-colors text-xs"
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                      ) : null}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {buildingUrls.length > 0 && (
                          <img
                            src={buildingUrls[0]}
                            alt=""
                            className="w-6 h-6 object-contain flex-shrink-0 bg-gray-700 rounded"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                        <span className="text-gray-200">{t(`buildings:${row.buildingName}`)}</span>
                        {chainResult != null && (
                          <span className="text-gray-400 font-mono text-sm">
                            ×{chainResult.buildingCount} ({Math.round((chainResult.chargeRatio ?? 0) * 100)} %)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sm text-gray-300">
                      {row.sewagePerDay > 0
                        ? `${productionCalculator.formatValue(row.sewagePerDay)} ${t('units.m3_day')}`
                        : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sm text-gray-300">
                      {row.mixedPerDay > 0
                        ? `${productionCalculator.formatValue(row.mixedPerDay)} ${t('units.t_day')}`
                        : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sm text-gray-300">
                      {row.hazardousPerDay > 0
                        ? `${productionCalculator.formatValue(row.hazardousPerDay)} ${t('units.t_day')}`
                        : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-sm text-gray-300">
                      {row.pollutionTPerYear != null || row.safetyDistance != null ? (
                        <span className="block text-right">
                          {row.pollutionTPerYear != null && (
                            <span>
                              {productionCalculator.formatValue(row.pollutionTPerYear)}{' '}
                              {t('units.t_year_building')}
                            </span>
                          )}
                          {row.safetyDistance != null && (
                            <span className="block mt-0.5">
                              <Tooltip content={t('industry.safetyDistanceTooltip')}>
                                <span className="text-gray-500 text-xs">
                                  {getSafetyDistance(row.safetyDistance, pollutionDistanceMode)}{' '}
                                  {t('units.m')}
                                </span>
                              </Tooltip>
                            </span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                  {isExpanded && hasDetail && (
                    <tr className="bg-gray-800/80">
                      <td colSpan={6} className="py-2 px-4 pl-8">
                        <div className="overflow-x-auto">
                          {renderCompositionTable(row.mixedComposition, row.hazardousComposition, allTypes)}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            <tr className="border-t-2 border-gray-600 font-medium text-gray-200">
              <td className="py-2 px-1">
                {hasTotalDetail ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedWasteRows((prev) => {
                        const next = new Set(prev);
                        if (next.has(WASTE_TOTAL_ROW_KEY)) next.delete(WASTE_TOTAL_ROW_KEY);
                        else next.add(WASTE_TOTAL_ROW_KEY);
                        return next;
                      })
                    }
                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-soviet-gold transition-colors text-xs"
                    aria-expanded={expandedWasteRows.has(WASTE_TOTAL_ROW_KEY)}
                  >
                    {expandedWasteRows.has(WASTE_TOTAL_ROW_KEY) ? '▼' : '▶'}
                  </button>
                ) : null}
              </td>
              <td className="py-2 px-3">{t('industry.wasteTableTotal')}</td>
              <td className="py-2 px-3 text-right font-mono text-sm">
                {wasteTableData.totals.sewagePerDay > 0
                  ? `${productionCalculator.formatValue(wasteTableData.totals.sewagePerDay)} ${t('units.m3_day')}`
                  : '—'}
              </td>
              <td className="py-2 px-3 text-right font-mono text-sm">
                {wasteTableData.totals.mixedPerDay > 0
                  ? `${productionCalculator.formatValue(wasteTableData.totals.mixedPerDay)} ${t('units.t_day')}`
                  : '—'}
              </td>
              <td className="py-2 px-3 text-right font-mono text-sm">
                {wasteTableData.totals.hazardousPerDay > 0
                  ? `${productionCalculator.formatValue(wasteTableData.totals.hazardousPerDay)} ${t('units.t_day')}`
                  : '—'}
              </td>
              <td className="py-2 px-3 text-right font-mono text-sm">
                {wasteTableData.pollutionMin != null || distanceMin != null ? (
                  <span className="block text-right">
                    {wasteTableData.pollutionMin != null && wasteTableData.pollutionMax != null && (
                      <span>
                        {productionCalculator.formatValue(wasteTableData.pollutionMin)} –{' '}
                        {productionCalculator.formatValue(wasteTableData.pollutionMax)}{' '}
                        {t('units.t_year_building')}
                      </span>
                    )}
                    {distanceMin != null && distanceMax != null && (
                      <span className="block mt-0.5">
                        <Tooltip content={t('industry.safetyDistanceTooltip')}>
                          <span className="text-gray-500 text-xs">
                            {distanceMin} – {distanceMax} {t('units.m')}
                          </span>
                        </Tooltip>
                      </span>
                    )}
                  </span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
            {expandedWasteRows.has(WASTE_TOTAL_ROW_KEY) && hasTotalDetail && (
              <tr className="bg-gray-800/80">
                <td colSpan={6} className="py-2 px-4 pl-8">
                  <div className="overflow-x-auto">
                    {renderCompositionTable(
                      wasteTableData.totals.mixedComposition,
                      wasteTableData.totals.hazardousComposition,
                      allTypesForTotal
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
