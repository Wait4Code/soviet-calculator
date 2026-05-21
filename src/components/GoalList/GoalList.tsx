import { useTranslation } from 'react-i18next';
import type { ProductionGoal, ResourceProduction } from '@/data/types';
import { GoalItem } from './GoalItem';

interface GoalListProps {
  goals: ProductionGoal[];
  allProductions: ResourceProduction[];
  effectiveBuildingByResource: Record<string, string>;
  onAddGoal: () => void;
  onRemoveGoal: (id: string) => void;
  onUpdateGoal: (id: string, patch: Partial<Pick<ProductionGoal, 'resourceId' | 'buildingName' | 'inputType' | 'value'>>) => void;
  onSetGoalResource: (goalId: string, resourceId: string) => void;
}

export function GoalList({
  goals,
  allProductions,
  effectiveBuildingByResource: _effectiveBuildingByResource,
  onAddGoal,
  onRemoveGoal,
  onUpdateGoal,
  onSetGoalResource,
}: GoalListProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      {goals.map((goal) => (
        <GoalItem
          key={goal.id}
          goal={goal}
          allProductions={allProductions}
          onUpdate={(patch) => onUpdateGoal(goal.id, patch)}
          onRemove={() => onRemoveGoal(goal.id)}
          onSetResource={(resourceId) => onSetGoalResource(goal.id, resourceId)}
        />
      ))}
      <button
        type="button"
        onClick={onAddGoal}
        className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-gray-700 border border-gray-600 hover:border-soviet-gold hover:bg-gray-600 transition-colors text-soviet-gold"
      >
        + {t('industry.addGoal')}
      </button>
    </div>
  );
}
