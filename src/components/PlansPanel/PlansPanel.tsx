import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SavedPlan } from '@/lib/savedPlans';
import { Tooltip } from '@/components/Tooltip';

type PlansSort = { field: 'date' | 'name'; order: 'asc' | 'desc' };

interface PlansPanelProps {
  savedPlansList: SavedPlan[];
  currentPlanId: string | null;
  onNewPlan: () => void;
  onLoadPlan: (id: string) => void;
  onDeletePlan: (id: string) => void;
  onRenamePlan: (id: string, name: string) => void;
  onDuplicatePlan: (id: string) => void;
  onSharePlan?: (id: string) => void;
}

export function PlansPanel({
  savedPlansList,
  currentPlanId,
  onNewPlan,
  onLoadPlan,
  onDeletePlan,
  onRenamePlan,
  onDuplicatePlan,
}: PlansPanelProps) {
  const { t } = useTranslation();
  const [renamePlanId, setRenamePlanId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [plansSort, setPlansSort] = useState<PlansSort>({ field: 'date', order: 'desc' });

  const sortedPlansList = useMemo(() => {
    const list = [...savedPlansList];
    if (plansSort.field === 'name') {
      const cmp = (a: SavedPlan, b: SavedPlan) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      return plansSort.order === 'asc' ? list.sort(cmp) : list.sort((a, b) => -cmp(a, b));
    }
    const cmp = (a: SavedPlan, b: SavedPlan) => a.createdAt - b.createdAt;
    return plansSort.order === 'asc' ? list.sort(cmp) : list.sort((a, b) => -cmp(a, b));
  }, [savedPlansList, plansSort]);

  const toggleSort = (field: 'date' | 'name') => {
    setPlansSort((prev) =>
      prev.field === field
        ? { ...prev, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : { field, order: field === 'date' ? 'desc' : 'asc' }
    );
  };

  const startRename = (plan: SavedPlan) => {
    setRenamePlanId(plan.id);
    setRenameValue(plan.name);
  };

  const submitRename = () => {
    if (renamePlanId && renameValue.trim()) {
      onRenamePlan(renamePlanId, renameValue.trim());
    }
    setRenamePlanId(null);
    setRenameValue('');
  };

  return (
    <aside className="w-80 shrink-0 flex flex-col bg-gray-800 rounded-lg shadow-lg overflow-hidden">
      <div className="p-4 border-b border-gray-600">
        <h3 className="text-lg font-semibold text-soviet-gold">{t('industry.myCalculations')}</h3>
        <button
          type="button"
          onClick={onNewPlan}
          className="mt-3 w-full py-2 rounded-lg bg-soviet-red hover:bg-red-700 text-white text-sm font-medium transition-colors"
        >
          + {t('industry.newCalculation')}
        </button>
      </div>
      {savedPlansList.length > 1 && (
        <div className="flex justify-end gap-3 px-3 pt-1 pb-0.5 border-b border-gray-700/50">
          <Tooltip content={plansSort.order === 'desc' ? t('industry.sortDateDesc') : t('industry.sortDateAsc')}>
            <button
              type="button"
              onClick={() => toggleSort('date')}
              className="text-xs text-gray-500 hover:text-soviet-gold transition-colors underline-offset-2 hover:underline"
            >
              {t('industry.sortDate')} {plansSort.field === 'date' ? (plansSort.order === 'desc' ? '↓' : '↑') : ''}
            </button>
          </Tooltip>
          <Tooltip content={plansSort.field === 'name' && plansSort.order === 'asc' ? t('industry.sortNameAZ') : t('industry.sortNameZA')}>
            <button
              type="button"
              onClick={() => toggleSort('name')}
              className="text-xs text-gray-500 hover:text-soviet-gold transition-colors underline-offset-2 hover:underline"
            >
              {t('industry.sortName')} {plansSort.field === 'name' ? (plansSort.order === 'asc' ? '↑' : '↓') : ''}
            </button>
          </Tooltip>
        </div>
      )}
      <ul className="flex-1 overflow-y-auto p-2 space-y-1">
        {sortedPlansList.map((plan) => (
          <li
            key={plan.id}
            className={`rounded-lg transition-colors ${
              plan.id === currentPlanId
                ? 'ring-1 ring-soviet-gold bg-gray-700/80'
                : 'bg-gray-700/50 hover:bg-gray-700/70'
            }`}
          >
            <div className="p-2 flex flex-col gap-1">
              {renamePlanId === plan.id ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={submitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename();
                    if (e.key === 'Escape') {
                      setRenamePlanId(null);
                      setRenameValue('');
                    }
                  }}
                  autoFocus
                  className="w-full bg-gray-600 border border-gray-500 rounded px-2 py-1 text-sm text-white"
                />
              ) : (
                <span className="text-sm text-white truncate cursor-default">
                  {plan.name}
                </span>
              )}
              <span className="text-xs text-gray-500">
                {new Date(plan.createdAt).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                <button
                  type="button"
                  onClick={() => onLoadPlan(plan.id)}
                  className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-soviet-gold hover:text-gray-900 text-gray-200 transition-colors"
                >
                  {t('industry.load')}
                </button>
                <Tooltip content={t('industry.duplicate')}>
                  <button
                    type="button"
                    onClick={() => onDuplicatePlan(plan.id)}
                    className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-gray-200 transition-colors"
                  >
                    {t('industry.duplicate')}
                  </button>
                </Tooltip>
                <Tooltip content={t('industry.rename')}>
                  <button
                    type="button"
                    onClick={() => startRename(plan)}
                    className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-gray-200 transition-colors"
                  >
                    {t('industry.rename')}
                  </button>
                </Tooltip>
                <Tooltip content={t('industry.delete')}>
                  <button
                    type="button"
                    onClick={() => onDeletePlan(plan.id)}
                    className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-red-600 text-gray-200 transition-colors"
                  >
                    {t('industry.delete')}
                  </button>
                </Tooltip>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {savedPlansList.length === 0 && (
        <p className="p-4 text-sm text-gray-500">{t('industry.noCalculations')}</p>
      )}
    </aside>
  );
}
