import { useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/stores/useStore';
import { productionCalculator } from '@/lib/productionCalculator';
import { useProductionGoals, goalsFromPlan, createInitialGoal } from '@/hooks/useProductionGoals';
import { useChainSettings, settingsFromPlan } from '@/hooks/useChainSettings';
import { useSavedPlans } from '@/hooks/useSavedPlans';
import { useUrlSync } from '@/hooks/useUrlSync';
import { useCalculationChain } from '@/hooks/useCalculationChain';
import type { PlanStateSerialized } from '@/lib/planUrl';
import { GoalList } from '@/components/GoalList/GoalList';
import { PlansPanel } from '@/components/PlansPanel/PlansPanel';
import { ResultSection } from '@/components/ResultSection/ResultSection';
import type { ResourceProduction } from '@/data/types';

export type { ProductionGoal } from '@/data/types';

// Helper: build serialized plan state from current hooks state
function buildPlanState(
  goals: ReturnType<typeof useProductionGoals>['goals'],
  settings: ReturnType<typeof useChainSettings>,
  store: { year: number; sourceQuality: number }
): PlanStateSerialized {
  const g = goals
    .filter((goal) => goal.resourceId && goal.buildingName)
    .map((goal) => ({
      resourceId: goal.resourceId,
      buildingName: goal.buildingName,
      inputType: goal.inputType,
      value: goal.value,
    }));
  if (g.length === 0) return { g };
  const vc: Record<string, { vehicleSlots: (string | null)[]; allowPersonnel: boolean }> = {};
  Object.entries(settings.vehicleConfigByResource).forEach(([rid, cfg]) => {
    vc[rid] = { vehicleSlots: cfg.vehicleSlots, allowPersonnel: cfg.allowPersonnel };
  });
  const effectiveSourceQuality = settings.sourceQualityFromPlan ?? store.sourceQuality;
  return {
    g,
    y: settings.chainYear,
    sq: effectiveSourceQuality,
    sqr: Object.keys(settings.sourceQualityByResource).length ? settings.sourceQualityByResource : undefined,
    br: Object.keys(settings.buildingByResource).length ? settings.buildingByResource : undefined,
    vc: Object.keys(vc).length ? vc : undefined,
    cr: Object.keys(settings.chargeRatioByResource).length ? settings.chargeRatioByResource : undefined,
    d: settings.disabledResources.size ? Array.from(settings.disabledResources) : undefined,
  };
}

function generatePlanName(
  state: PlanStateSerialized,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, opts?: any) => string
): string {
  if (!state.g?.length) return t('industry.unnamed');
  const names = state.g.map((g) => t(`resources.${g.resourceId}`)).filter(Boolean);
  return [...new Set(names)].join(', ') || t('industry.unnamed');
}

export function ProductionCalculator() {
  const { t, i18n } = useTranslation();
  const sourceQuality = useStore((state) => state.sourceQuality);
  const defaultYear = useStore((state) => state.year);
  const defaultVehicleId = useStore((state) => state.defaultVehicleId);
  const defaultBuildingByResource = useStore((state) => state.defaultBuildingByResource);
  const pollutionDistanceMode = useStore((state) => state.pollutionDistanceMode);

  const goals = useProductionGoals(defaultBuildingByResource);
  const settings = useChainSettings(defaultYear);
  const plans = useSavedPlans(i18n.language);

  const effectiveBuildingByResource = useMemo(
    () => ({ ...defaultBuildingByResource, ...settings.buildingByResource }),
    [defaultBuildingByResource, settings.buildingByResource]
  );

  const effectiveSourceQuality = settings.sourceQualityFromPlan ?? sourceQuality;

  const currentPlanState = useMemo(
    () => buildPlanState(goals.goals, settings, { year: defaultYear, sourceQuality }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      goals.goals,
      settings.chainYear,
      settings.disabledResources,
      settings.sourceQualityByResource,
      settings.buildingByResource,
      settings.vehicleConfigByResource,
      settings.chargeRatioByResource,
      settings.sourceQualityFromPlan,
      defaultYear,
      sourceQuality,
    ]
  );

  const { initialPlanState } = useUrlSync(currentPlanState);

  const chain = useCalculationChain(goals.goals, settings, {
    sourceQuality,
    defaultVehicleId,
    defaultBuildingByResource,
  });

  // Initialise from URL on first mount
  const hasInitRef = useRef(false);
  useEffect(() => {
    if (hasInitRef.current) return;
    hasInitRef.current = true;
    if (initialPlanState) {
      goals.setGoals(goalsFromPlan(initialPlanState.g));
      settings.loadSettings(settingsFromPlan(initialPlanState));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Create initial plan if none exists
  const hasCreatedInitialPlanRef = useRef(false);
  useEffect(() => {
    if (hasCreatedInitialPlanRef.current) return;
    if (plans.savedPlansList.length === 0 && currentPlanState.g.length > 0) {
      hasCreatedInitialPlanRef.current = true;
      plans.saveCurrentPlan(generatePlanName(currentPlanState, t), currentPlanState);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlanState]);

  // Debounced autosave
  useEffect(() => {
    plans.autosave(currentPlanState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlanState]);

  // Reset disabled resources when base goals change
  const goalsKey = goals.goals.map((g) => g.resourceId).join(',');
  const prevGoalsKeyRef = useRef(goalsKey);
  useEffect(() => {
    if (prevGoalsKeyRef.current !== goalsKey) {
      prevGoalsKeyRef.current = goalsKey;
      settings.resetSettings(settings.chainYear);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalsKey]);

  const allProductions = useMemo(
    () =>
      (productionCalculator.getAllProductions() as ResourceProduction[]).sort((a, b) =>
        t(`resources.${a.resourceId}`).localeCompare(t(`resources.${b.resourceId}`))
      ),
    [t]
  );

  const handleLoadPlan = (id: string) => {
    const planState = plans.loadPlan(id);
    if (planState) {
      goals.setGoals(goalsFromPlan(planState.g));
      settings.loadSettings(settingsFromPlan(planState));
    }
  };

  const handleNewPlan = () => {
    const defaultGoal = createInitialGoal('steel', defaultBuildingByResource);
    const defaultState: PlanStateSerialized = {
      g: [
        {
          resourceId: defaultGoal.resourceId,
          buildingName: defaultGoal.buildingName,
          inputType: defaultGoal.inputType,
          value: defaultGoal.value,
        },
      ],
      y: defaultYear,
    };
    plans.handleNewPlan(defaultState, (s) => generatePlanName(s, t));
    goals.setGoals(goalsFromPlan(defaultState.g));
    settings.resetSettings(defaultYear);
  };

  const handleDuplicatePlan = (id: string) => {
    const planState = plans.duplicatePlan(id, (name) => t('industry.copyOf', { name }));
    if (planState) {
      goals.setGoals(goalsFromPlan(planState.g));
      settings.loadSettings(settingsFromPlan(planState));
    }
  };

  // Primary resource IDs (needed by ResultSection/ChainTable for surplus display)
  const primaryResourceIds = useMemo(
    () =>
      new Set(
        goals.goals
          .filter((g) => g.resourceId && g.buildingName)
          .map((g) => g.resourceId)
      ),
    [goals.goals]
  );

  // Detect livestock buildings in the chain
  const chainHasLivestockBuilding = useMemo(
    () =>
      chain.results.some(
        (r) => r.buildingName === 'animal_farm' || r.buildingName === 'slaughterhouse'
      ),
    [chain.results]
  );

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0 space-y-6">
        <GoalList
          goals={goals.goals}
          allProductions={allProductions}
          effectiveBuildingByResource={effectiveBuildingByResource}
          onAddGoal={() => {
            const first = allProductions[0];
            if (first) goals.addGoal(first.resourceId);
          }}
          onRemoveGoal={goals.removeGoal}
          onUpdateGoal={goals.updateGoal}
          onSetGoalResource={(goalId, resourceId) =>
            goals.setGoalResource(goalId, resourceId, effectiveBuildingByResource)
          }
        />

        {chain.results.length > 0 && (
          <ResultSection
            results={chain.results}
            disabledResources={settings.disabledResources}
            hasAnySurplus={chain.hasAnySurplus}
            chainYear={settings.chainYear}
            effectiveSourceQuality={effectiveSourceQuality}
            sourceQualityByResource={settings.sourceQualityByResource}
            buildingByResource={settings.buildingByResource}
            defaultBuildingByResource={defaultBuildingByResource}
            vehicleConfigByResource={settings.vehicleConfigByResource}
            chargeRatioByResource={settings.chargeRatioByResource}
            totalWorkers={chain.totalWorkers}
            totalProfesors={chain.totalProfesors}
            personnelBreakdown={chain.personnelBreakdown}
            wasteTableData={chain.wasteTableData}
            pollutionDistanceMode={pollutionDistanceMode}
            surplusByResource={chain.surplusByResource}
            primaryResourceIds={primaryResourceIds}
            chainHasLivestockBuilding={chainHasLivestockBuilding}
            defaultVehicleId={defaultVehicleId}
            onChangeYear={settings.setChainYear}
            onToggleResource={(id) => settings.toggleResource(id, chain.fullChainResults)}
            onSetSourceQuality={settings.setSourceQuality}
            onSetBuilding={settings.setBuilding}
            onSetVehicleConfig={settings.setVehicleConfig}
            onSetChargeRatio={settings.setChargeRatio}
            onResetChargeRatio={(id) => settings.setChargeRatio(id, 1.0)}
          />
        )}
      </div>

      <PlansPanel
        savedPlansList={plans.savedPlansList}
        currentPlanId={plans.currentPlanId}
        onNewPlan={handleNewPlan}
        onLoadPlan={handleLoadPlan}
        onDeletePlan={plans.deletePlan}
        onRenamePlan={plans.renamePlan}
        onDuplicatePlan={handleDuplicatePlan}
      />
    </div>
  );
}
