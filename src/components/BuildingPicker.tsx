import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getBuildingImageUrls } from '@/data/buildingIcons';
import type { ProductionRecipe } from '@/data/types';
import { RecipeTooltipContent } from '@/components/BuildingImage';
import { Tooltip } from '@/components/Tooltip';

interface BuildingPickerProps {
  recipes: ProductionRecipe[];
  selectedRecipe: ProductionRecipe;
  onSelect: (recipe: ProductionRecipe) => void;
  size?: number;
}

function BuildingImageThumb({ recipe, size }: { recipe: ProductionRecipe; size: number }) {
  const { t } = useTranslation();
  const [currentUrlIndex, setCurrentUrlIndex] = useState(0);
  const urls = getBuildingImageUrls(recipe.name);

  useEffect(() => {
    setCurrentUrlIndex(0);
  }, [recipe.name]);

  const currentUrl = urls[currentUrlIndex];
  const allFailed = currentUrlIndex >= urls.length;
  const displayName = t(`buildings:${recipe.name}`);

  if (allFailed) {
    return (
      <div
        className="flex items-center justify-center rounded bg-gray-700 text-xs text-gray-500"
        style={{ width: size, height: size }}
      >
        {displayName.slice(0, 6)}…
      </div>
    );
  }
  return (
    <img
      src={currentUrl}
      alt={displayName}
      className="w-full h-full object-contain rounded bg-gray-700"
      style={{ width: size, height: size }}
      onError={() => setCurrentUrlIndex((i) => i + 1)}
    />
  );
}

export function BuildingPicker({ recipes, selectedRecipe, onSelect, size = 36 }: BuildingPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = useCallback((recipe: ProductionRecipe) => {
    onSelect(recipe);
    setOpen(false);
  }, [onSelect]);

  const isSingle = recipes.length <= 1;

  return (
    <div
      ref={pickerRef}
      className="relative inline-block"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {isSingle ? (
        <button
          type="button"
          disabled
          className="flex-shrink-0 rounded overflow-hidden bg-gray-800 border-2 border-gray-700 cursor-default"
          style={{ width: size, height: size }}
        >
          <BuildingImageThumb recipe={selectedRecipe} size={size} key={selectedRecipe.name} />
        </button>
      ) : (
        <Tooltip content={t('tooltips.chooseBuilding')}>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex-shrink-0 rounded overflow-hidden bg-gray-800 border-2 border-gray-600 hover:border-soviet-gold cursor-pointer transition-colors"
            style={{ width: size, height: size }}
          >
            <BuildingImageThumb recipe={selectedRecipe} size={size} key={selectedRecipe.name} />
          </button>
        </Tooltip>
      )}
      {showTooltip && (
        <div className="absolute z-50 left-full ml-2 top-0 px-3 py-3 text-white bg-gray-900 rounded-lg shadow-xl border border-gray-700">
          <RecipeTooltipContent recipe={selectedRecipe} />
        </div>
      )}
      {open && !isSingle && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 max-h-64 overflow-y-auto rounded-lg bg-gray-800 border border-gray-600 shadow-xl py-2">
          {recipes.map((r) => (
            <button
              key={r.name}
              type="button"
              onClick={() => handleSelect(r)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-700 transition-colors ${
                r.name === selectedRecipe.name ? 'bg-gray-700/80' : ''
              }`}
            >
              <div className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-gray-700 flex items-center justify-center">
                <BuildingImageThumb recipe={r} size={40} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-white truncate text-sm">{t(`buildings:${r.name}`)}</p>
                <p className="text-xs text-gray-400">
                  {r.workers > 0
                    ? `${r.workers} ${t('tooltips.workersBlue')}${r.profesors > 0 ? `, ${r.profesors} ${t('tooltips.workersWhite')}` : ''}`
                    : t('tooltips.noPersonnel')}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
