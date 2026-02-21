import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/stores/useStore';
import { vehicles, getVehicle, formatVehicleSkills } from '@/data/vehicles';
import { productionCalculator } from '@/lib/productionCalculator';
import { getResourceIcon } from '@/data/resourceIcons';
import { BuildingPicker } from '@/components/BuildingPicker';

const BASE = import.meta.env.BASE_URL;
const VEHICLE_PLACEHOLDER = `${BASE}vehicles/excavator.svg`;
const SIDE_EAST = `${BASE}sides/east.png`;
const SIDE_WEST = `${BASE}sides/west.png`;

const BLOC_EAST_ORIGINS = new Set([
  'Union soviétique',
  'Tchécoslovaquie',
  'Roumanie',
  'Allemagne de l\'Est',
  'Pologne',
  'Hongrie',
  'Bulgarie',
  'RDA',
]);

function getVehicleImageSrc(vehicle: { image?: string }): string {
  return vehicle?.image ? `${BASE}${vehicle.image}` : VEHICLE_PLACEHOLDER;
}

function getBlocForOrigin(origin: string): 'east' | 'west' {
  return BLOC_EAST_ORIGINS.has(origin) ? 'east' : 'west';
}

function OriginWithBloc({
  origin,
  years,
  className = '',
  altEast,
  altWest,
}: {
  origin: string;
  years?: string;
  className?: string;
  altEast: string;
  altWest: string;
}) {
  const bloc = getBlocForOrigin(origin);
  const src = bloc === 'east' ? SIDE_EAST : SIDE_WEST;
  const alt = bloc === 'east' ? altEast : altWest;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <img src={src} alt={alt} className="w-4 h-4 flex-shrink-0" aria-hidden />
      <span>{years ? `${origin} · ${years}` : origin}</span>
    </span>
  );
}

export function Settings() {
  const { t } = useTranslation();
  const sourceQuality = useStore((state) => state.sourceQuality);
  const setSourceQuality = useStore((state) => state.setSourceQuality);
  const year = useStore((state) => state.year);
  const setYear = useStore((state) => state.setYear);
  const defaultVehicleId = useStore((state) => state.defaultVehicleId);
  const setDefaultVehicleId = useStore((state) => state.setDefaultVehicleId);
  const defaultBuildingByResource = useStore((state) => state.defaultBuildingByResource);
  const setDefaultBuilding = useStore((state) => state.setDefaultBuilding);

  const productionsWithMultipleRecipes = productionCalculator
    .getAllProductions()
    .filter((p) => p.recipes.length > 1);

  const selectedVehicle = getVehicle(defaultVehicleId) ?? Array.from(vehicles.values())[0];
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false);
  const vehiclePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (vehiclePickerRef.current && !vehiclePickerRef.current.contains(e.target as Node)) {
        setVehiclePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-2xl font-bold mb-4 text-soviet-red">{t('settings.title')}</h2>

        <div className="space-y-6">
          {/* Qualité de source */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('settings.sourceQualityLabel')}
            </label>
            <p className="text-sm text-gray-400 mb-3">
              {t('settings.sourceQualityHint')}
              <br />
              <span className="text-xs text-gray-500">
                {t('settings.sourceQualityExample')}
              </span>
            </p>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={sourceQuality}
              onChange={(e) => setSourceQuality(parseFloat(e.target.value) || 50)}
              className="w-full md:w-64 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
          </div>

          {/* Année par défaut */}
          <div>
            <label className="block text-sm font-medium mb-2">
              {t('settings.defaultYearLabel')}
            </label>
            <p className="text-sm text-gray-400 mb-3">
              {t('settings.defaultYearHint')}
            </p>
            <input
              type="number"
              min="1960"
              max="2100"
              step="1"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10) || 1960)}
              className="w-full md:w-32 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
            />
          </div>

          {/* Véhicule par défaut */}
          <div ref={vehiclePickerRef} className="relative">
            <label className="block text-sm font-medium mb-2">
              {t('settings.defaultVehicleLabel')}
            </label>
            <p className="text-sm text-gray-400 mb-3">
              {t('settings.defaultVehicleHint')}
              <br />
              <span className="text-xs text-gray-500">
                {t('settings.defaultVehicleNote')}
              </span>
            </p>
            <div className="flex flex-wrap gap-4 items-start">
              <button
                type="button"
                onClick={() => setVehiclePickerOpen((o) => !o)}
                className="flex-shrink-0 w-28 h-28 rounded-lg overflow-hidden bg-gray-700 border-2 border-gray-600 hover:border-soviet-gold focus:outline-none focus:ring-2 focus:ring-soviet-gold focus:ring-offset-2 focus:ring-offset-gray-800 transition-colors"
                aria-label={t('settings.changeVehicle')}
              >
                <img
                  src={getVehicleImageSrc(selectedVehicle!)}
                  alt=""
                  className="w-full h-full object-contain p-1"
                />
              </button>
              <div className="flex-1 min-w-[200px] space-y-1 text-sm">
                <p className="font-semibold text-white">{selectedVehicle?.name}</p>
                <p className="text-gray-400">
                  <OriginWithBloc
                    origin={selectedVehicle!.origin}
                    years={selectedVehicle!.productionYears}
                    altEast={t('settings.blocEast')}
                    altWest={t('settings.blocWest')}
                  />
                </p>
                <p className="text-gray-400">{selectedVehicle?.maxSpeed} · {selectedVehicle?.emptyWeight} · {selectedVehicle?.enginePower} · {selectedVehicle?.length}</p>
                <p className="text-soviet-gold">{formatVehicleSkills(selectedVehicle!)}</p>
              </div>
            </div>
            {vehiclePickerOpen && (
              <div className="absolute left-0 top-full mt-2 z-50 w-full max-w-md max-h-80 overflow-y-auto rounded-lg bg-gray-800 border border-gray-600 shadow-xl py-2">
                {Array.from(vehicles.values()).map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setDefaultVehicleId(v.id);
                      setVehiclePickerOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-700 transition-colors ${v.id === defaultVehicleId ? 'bg-gray-700/80' : ''}`}
                  >
                    <div className="flex-shrink-0 w-12 h-12 rounded overflow-hidden bg-gray-700 flex items-center justify-center">
                      <img src={getVehicleImageSrc(v)} alt="" className="w-full h-full object-contain p-0.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white truncate">{v.name}</p>
                      <p className="text-xs text-gray-400">
                        <span className="inline-flex items-center gap-1.5">
                          <img
                            src={getBlocForOrigin(v.origin) === 'east' ? SIDE_EAST : SIDE_WEST}
                            alt={getBlocForOrigin(v.origin) === 'east' ? t('settings.blocEast') : t('settings.blocWest')}
                            className="w-3 h-3 flex-shrink-0"
                            aria-hidden
                          />
                          <span>{v.origin} · {formatVehicleSkills(v)}</span>
                        </span>
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Bâtiment par défaut par ressource (plusieurs recettes) */}
          {productionsWithMultipleRecipes.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('settings.defaultBuildingLabel')}
              </label>
              <p className="text-sm text-gray-400 mb-3">
                {t('settings.defaultBuildingHint')}
              </p>
              <div className="space-y-3">
                {productionsWithMultipleRecipes.map((production) => {
                  const selectedName = defaultBuildingByResource[production.resourceId] ?? production.recipes[0].name;
                  const selectedRecipe = production.recipes.find((r) => r.name === selectedName) ?? production.recipes[0];
                  return (
                    <div key={production.resourceId} className="flex flex-wrap items-center gap-3">
                      {getResourceIcon(production.resourceId) && (
                        <img
                          src={getResourceIcon(production.resourceId)}
                          alt=""
                          className="w-5 h-5 object-contain flex-shrink-0"
                        />
                      )}
                      <span className="text-sm text-gray-300 min-w-[140px]">{t(`resources.${production.resourceId}`)}</span>
                      <BuildingPicker
                        recipes={production.recipes}
                        selectedRecipe={selectedRecipe}
                        onSelect={(r) => setDefaultBuilding(production.resourceId, r.name)}
                        size={40}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
