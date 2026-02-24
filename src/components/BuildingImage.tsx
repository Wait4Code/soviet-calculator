import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getBuildingImageUrl, getBuildingImageUrls } from '@/data/buildingIcons';
import type { ProductionRecipe } from '@/data/types';
import { formatNumber } from '@/lib/format';

const isElectricity = (resourceId: string) => resourceId === 'eletric';

/** Unité d'affichage pour la consommation */
function getConsumptionUnit(resourceId: string, forElectricityMWh = false): string {
  if (resourceId === 'eletric') return forElectricityMWh ? 'MWh' : 'MWh/j';
  if (resourceId === 'water' || resourceId === 'usagewater') return 'm³/j';
  return 't/j';
}

/** Consommation variable (par charge) et fixe, séparées pour eau et électricité */
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
  const waterFixed = (fixed.water ?? 0) + (fixed.usagewater ?? 0);
  const electricFixed = fixed.eletric ?? 0;
  return { waterVariable, waterFixed, electricVariable, electricFixed };
}

/** Consommation variable max par bâtiment à 100 % (recipe.consumption uniquement) — pour la liste "Consommation max" */
/** Électricité : valeur en MW, affichage en MWh = MW × 60 */
function getVariableConsumptionPerBuilding(recipe: ProductionRecipe): { resourceId: string; amountPerDay: number; displayAmount: number; unit: string }[] {
  return Object.entries(recipe.consumption)
    .filter(([, qty]) => qty > 0)
    .map(([resId, qty]) => {
      const amountPerDay = isElectricity(resId)
        ? qty
        : recipe.workers > 0
          ? qty * recipe.workers
          : qty;
      const displayAmount = isElectricity(resId) ? amountPerDay * 60 : amountPerDay;
      return { resourceId: resId, amountPerDay, displayAmount, unit: getConsumptionUnit(resId, isElectricity(resId)) };
    });
}

/** Puissance électrique en MW : consumption_fixed.eletric (déjà en MW) */
function getElectricPowerMW(recipe: ProductionRecipe): number | null {
  const fixed = recipe.consumption_fixed ?? {};
  const eletric = fixed.eletric ?? 0;
  if (eletric <= 0) return null;
  return eletric;
}

interface BuildingImageProps {
  recipe: ProductionRecipe;
  /** Taille en pixels (carré) */
  size?: number;
  /** Classe CSS supplémentaire */
  className?: string;
  /** Sélectionné (bordure highlight) */
  selected?: boolean;
  /** Clic pour sélectionner (si plusieurs recettes) */
  onClick?: () => void;
}

export function BuildingImage({ recipe, size = 40, className = '', selected, onClick }: BuildingImageProps) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const displayName = t(`buildings:${recipe.name}`);

  return (
    <div
      className={`relative inline-flex flex-col items-center ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      role={onClick ? 'button' : undefined}
    >
      <div
        className={`flex items-center justify-center overflow-hidden rounded bg-gray-800 flex-shrink-0 ${selected ? 'ring-2 ring-soviet-gold' : ''}`}
        style={{ width: size, height: size }}
      >
        {imgError ? (
          <span className="text-xs text-gray-500 truncate px-1" title={displayName}>
            {displayName.slice(0, 6)}…
          </span>
        ) : (
          <img
            src={getBuildingImageUrl(recipe.name)}
            alt={displayName}
            className="w-full h-full object-contain"
            onError={() => setImgError(true)}
          />
        )}
      </div>
      {onClick && (
        <span className="text-[10px] text-gray-400 mt-0.5 truncate" style={{ maxWidth: size }}>
          {displayName}
        </span>
      )}
      {showTooltip && (
        <div className="absolute z-50 left-full ml-2 top-0 px-3 py-3 text-white bg-gray-900 rounded-lg shadow-xl border border-gray-700">
          <RecipeTooltipContent recipe={recipe} />
        </div>
      )}
    </div>
  );
}

/** Tooltip au survol avec le détail complet */
/** Contenu structuré du tooltip (style aéré comme panneau véhicules) - exporté pour BuildingPicker */
export function RecipeTooltipContent({ recipe }: { recipe: ProductionRecipe }) {
  const { t } = useTranslation();
  const displayName = t(`buildings:${recipe.name}`);
  const workersStr = recipe.workers > 0
    ? `${formatNumber(recipe.workers)} ${t('tooltips.workersBlue')}${recipe.profesors > 0 ? `, ${formatNumber(recipe.profesors)} ${t('tooltips.workersWhite')}` : ''}`
    : '-';
  const maxProd = recipe.requiresVehicles
    ? t('tooltips.variableVehicules')
    : `${formatNumber(recipe.production * recipe.workers)} t/j`;
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
          <p><span className="text-gray-500">{t('tooltips.eauFixe')}:</span> {formatNumber(waterFixed)} m³/j</p>
        )}
        {electricFixed > 0 && (
          <p><span className="text-gray-500">{t('tooltips.electriciteFixe')}:</span> {formatNumber(electricFixed * 60)} MWh</p>
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
                  {t(`resources.${c.resourceId}`)}: {formatNumber(c.displayAmount)} {c.unit}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export function BuildingImageWithTooltip({
  recipe,
  size = 40,
  className = '',
  selected,
  onClick,
}: BuildingImageProps) {
  const { t } = useTranslation();
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const urls = getBuildingImageUrls(recipe.name);
  const currentUrl = urls[currentUrlIndex];
  const allFailed = currentUrlIndex >= urls.length;
  const displayName = t(`buildings:${recipe.name}`);

  const handleError = useCallback(() => {
    setCurrentUrlIndex((i) => i + 1);
  }, []);

  return (
    <div
      className={`relative inline-block ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      role={onClick ? 'button' : undefined}
    >
      <div
        className={`flex items-center justify-center overflow-hidden rounded bg-gray-800 flex-shrink-0 ${selected ? 'ring-2 ring-soviet-gold' : ''}`}
        style={{ width: size, height: size }}
      >
        {allFailed ? (
          <span className="text-xs text-gray-500 truncate px-1" title={displayName}>
            {displayName.slice(0, 6)}…
          </span>
        ) : (
          <img
            src={currentUrl}
            alt={displayName}
            className="w-full h-full object-contain"
            onError={handleError}
          />
        )}
      </div>
      {showTooltip && (
        <div className="absolute z-50 left-full ml-2 top-0 px-3 py-3 text-white bg-gray-900 rounded-lg shadow-xl border border-gray-700">
          <RecipeTooltipContent recipe={recipe} />
        </div>
      )}
    </div>
  );
}
