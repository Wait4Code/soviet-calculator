import { useTranslation } from 'react-i18next';
import { productionCalculator } from '@/lib/productionCalculator';
import type { ProductionGoal, ResourceProduction } from '@/data/types';
import { Tooltip } from '@/components/Tooltip';
import { ResourcePicker } from '@/components/ResourcePicker';

interface GoalItemProps {
  goal: ProductionGoal;
  allProductions: ResourceProduction[];
  onUpdate: (patch: Partial<Pick<ProductionGoal, 'resourceId' | 'buildingName' | 'inputType' | 'value'>>) => void;
  onRemove: () => void;
  onSetResource: (resourceId: string) => void;
}

export function GoalItem({
  goal,
  allProductions,
  onUpdate,
  onRemove,
  onSetResource,
}: GoalItemProps) {
  const { t } = useTranslation();

  const recipe = productionCalculator.getRecipe(goal.resourceId, goal.buildingName);
  const prodPerBuildingPerDay = recipe ? recipe.production * recipe.workers : 0;
  const displayBuildings = goal.inputType === 'buildings'
    ? goal.value
    : prodPerBuildingPerDay > 0
      ? (goal.inputType === 'output_per_year' ? goal.value / 365 : goal.value) / prodPerBuildingPerDay
      : 0;
  const displayPerDay = goal.inputType === 'output_per_day'
    ? goal.value
    : goal.inputType === 'output_per_year'
      ? goal.value / 365
      : prodPerBuildingPerDay * goal.value;
  const displayPerYear = goal.inputType === 'output_per_year'
    ? goal.value
    : displayPerDay * 365;

  return (
    <div className="flex flex-wrap items-center gap-3 bg-gray-700/50 rounded-lg px-3 py-2">
      <Tooltip content={t('industry.removeGoalTitle')}>
        <button
          type="button"
          onClick={onRemove}
          className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center text-red-400 hover:bg-gray-600 transition-colors"
        >
          ✕
        </button>
      </Tooltip>
      <ResourcePicker
        productions={allProductions}
        selectedResourceId={goal.resourceId}
        onSelect={onSetResource}
        size={40}
      />
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-400">{t('industry.buildings')}:</label>
        <input
          type="number"
          min="0.01"
          step="0.1"
          value={displayBuildings}
          onChange={(e) => {
            const v = parseFloat(e.target.value) || 0;
            onUpdate({ inputType: 'buildings', value: v });
          }}
          className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-400">{t('industry.perDay')}:</label>
        <input
          type="number"
          min="0"
          step="0.1"
          value={displayPerDay.toFixed(2)}
          onChange={(e) => {
            const v = parseFloat(e.target.value) || 0;
            onUpdate({ inputType: 'output_per_day', value: v });
          }}
          className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-400">{t('industry.perYear')}:</label>
        <input
          type="number"
          min="0"
          step="0.1"
          value={displayPerYear.toFixed(1)}
          onChange={(e) => {
            const v = parseFloat(e.target.value) || 0;
            onUpdate({ inputType: 'output_per_year', value: v });
          }}
          className="w-28 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
        />
      </div>
    </div>
  );
}
