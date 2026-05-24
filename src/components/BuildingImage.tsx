import { useTranslation } from 'react-i18next';
import type { ProductionRecipe } from '@/data/types';
import { useFormatNumber } from '@/hooks/useFormatNumber';

const isElectricity = (resourceId: string) => resourceId === 'eletric';

/** Clé i18n pour l'unité d'affichage de la consommation (utiliser avec t()). */
function getConsumptionUnitKey(resourceId: string, forElectricityMWh = false): string {
  if (resourceId === 'eletric') return forElectricityMWh ? 'units.MWh' : 'units.MWh_day';
  if (resourceId === 'water' || resourceId === 'usagewater') return 'units.m3_day';
  return 'units.t_day';
}

/** Consommation variable (par charge) et eau travailleurs (0,02 u./travailleur/jour), électricité fixe */
function getWaterAndElectricConsumption(recipe: ProductionRecipe): {
  waterVariable: number;
  waterFixed: number;
  electricVariable: number;
  electricFixed: number;
} {
  let waterVariable = 0;
  let electricVariable = 0;
  Object.entries(recipe.consumption).filter(([, qty]) => qty > 0).forEach(([resId, qty]) => {
    const amountPerDay = isElectricity(resId)
      ? qty
      : recipe.workers > 0
        ? qty * recipe.workers
        : qty;
    if (resId === 'water' || resId === 'usagewater') waterVariable += amountPerDay;
    if (resId === 'eletric') electricVariable += amountPerDay;
  });
  const fixed = recipe.consumption_fixed ?? {};
  const waterFixed = recipe.workers > 0 ? 0.02 * recipe.workers : 0;
  const electricFixed = fixed.eletric ?? 0;
  return { waterVariable, waterFixed, electricVariable, electricFixed };
}

/** Consommation variable max par bâtiment à 100 % (recipe.consumption uniquement) — pour la liste "Consommation max" */
/** Électricité : valeur en MW, affichage en MWh = MW × 60 */
function getVariableConsumptionPerBuilding(recipe: ProductionRecipe): { resourceId: string; amountPerDay: number; displayAmount: number; unitKey: string }[] {
  return Object.entries(recipe.consumption)
    .filter(([, qty]) => qty > 0)
    .map(([resId, qty]) => {
      const amountPerDay = isElectricity(resId)
        ? qty
        : recipe.workers > 0
          ? qty * recipe.workers
          : qty;
      const displayAmount = isElectricity(resId) ? amountPerDay * 60 : amountPerDay;
      return { resourceId: resId, amountPerDay, displayAmount, unitKey: getConsumptionUnitKey(resId, isElectricity(resId)) };
    });
}

/** Puissance électrique en MW : consumption_fixed.eletric (déjà en MW) */
function getElectricPowerMW(recipe: ProductionRecipe): number | null {
  const fixed = recipe.consumption_fixed ?? {};
  const eletric = fixed.eletric ?? 0;
  if (eletric <= 0) return null;
  return eletric;
}

/** Contenu structuré du tooltip (style aéré comme panneau véhicules) - exporté pour BuildingPicker */
export function RecipeTooltipContent({ recipe }: { recipe: ProductionRecipe }) {
  const { t } = useTranslation();
  const formatNumber = useFormatNumber();
  const displayName = t(`buildings:${recipe.name}`);
  const workersStr = recipe.workers > 0
    ? `${formatNumber(recipe.workers)} ${t('tooltips.workersBlue')}${recipe.profesors > 0 ? `, ${formatNumber(recipe.profesors)} ${t('tooltips.workersWhite')}` : ''}`
    : '-';
  const maxProd = recipe.requiresVehicles
    ? t('tooltips.variableVehicules')
    : `${formatNumber(recipe.production * recipe.workers)} ${t('units.t_day')}`;
  const variableConsumptions = getVariableConsumptionPerBuilding(recipe);
  const { waterFixed, electricFixed } = getWaterAndElectricConsumption(recipe);
  const powerMW = getElectricPowerMW(recipe);

  return (
    <div className="space-y-2 min-w-[220px]">
      <p className="font-medium text-white text-sm">{displayName}</p>
      <div className="space-y-1 text-xs text-gray-300">
        <p><span className="text-gray-500">{t('tooltips.travailleursMax')}:</span> {workersStr}</p>
        <p><span className="text-gray-500">{t('tooltips.productionMax')}:</span> {maxProd}</p>
        {waterFixed > 0 && (
          <p><span className="text-gray-500">{t('tooltips.eauTravailleurs')}:</span> {formatNumber(waterFixed)} {t('units.m3_day')}</p>
        )}
        {electricFixed > 0 && (
          <p><span className="text-gray-500">{t('tooltips.electriciteFixe')}:</span> {formatNumber(electricFixed * 60)} {t('units.MWh')}</p>
        )}
        {powerMW != null && powerMW > 0 && (
          <p>
            <span className="text-gray-500">{t('tooltips.puissance')}:</span>{' '}
            {powerMW < 1 ? `${formatNumber(powerMW * 1000)} kW` : `${formatNumber(powerMW)} MW`}
          </p>
        )}
        {variableConsumptions.length > 0 && (
          <div>
            <p className="text-gray-500">{t('tooltips.consommationMax')}:</p>
            <ul className="list-disc list-inside pl-1 space-y-0.5">
              {variableConsumptions.map((c) => (
                <li key={c.resourceId}>
                  {t(`resources.${c.resourceId}`)}: {formatNumber(c.displayAmount)} {t(c.unitKey)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
