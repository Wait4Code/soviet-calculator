import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { productionCalculator } from '@/lib/productionCalculator';
import { sortProductionChain } from '@/lib/chainSort';
import { ProductionResult } from '@/data/types';
import type { CalculationConfig, MineVehicleConfig } from '@/lib/productionCalculator';
import { migrateVehicleConfig } from '@/lib/productionCalculator';
import { useStore } from '@/stores/useStore';
import { getPlanStateFromUrl, setPlanStateInUrl, type PlanStateSerialized } from '@/lib/planUrl';
import { getSavedPlans, savePlan, updatePlan, deletePlan, getPlanState, type SavedPlan } from '@/lib/savedPlans';
import { formatNumber } from '@/lib/format';
import { getResourceIcon } from '@/data/resourceIcons';
import { vehicles, getVehicle, formatVehicleSkills } from '@/data/vehicles';
import { BuildingPicker } from '@/components/BuildingPicker';
import { ResourcePicker } from '@/components/ResourcePicker';

export interface ProductionGoal {
  id: string;
  resourceId: string;
  buildingName: string;
  inputType: 'buildings' | 'output_per_day' | 'output_per_year';
  value: number;
}

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

function getVehicleImageSrc(vehicle: { image?: string } | undefined): string {
  return vehicle?.image ? `${BASE}${vehicle.image}` : VEHICLE_PLACEHOLDER;
}

function getBlocForOrigin(origin: string): 'east' | 'west' {
  return BLOC_EAST_ORIGINS.has(origin) ? 'east' : 'west';
}

// Composant Tooltip simple
function Tooltip({ children, content }: { children: React.ReactNode; content: string }) {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setShow(true);
    }, 100); // Délai court de 100ms
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setShow(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {show && (
        <div className="absolute z-50 px-2 py-1 text-xs text-white bg-gray-900 rounded shadow-lg whitespace-nowrap bottom-full right-0 mb-1">
          {content}
          <div className="absolute top-full right-4 border-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
}

function getDefaultVehicleConfig(recipe: { maxVehicles?: number }, defaultVehicleId: string): MineVehicleConfig {
  const maxV = recipe.maxVehicles ?? 0;
  return {
    vehicleSlots: Array(maxV).fill(defaultVehicleId),
    allowPersonnel: false,
  };
}

function createInitialGoal(resourceId: string, defaultBuildingByResource: Record<string, string>): ProductionGoal {
  const production = productionCalculator.getProduction(resourceId);
  const recipes = production?.recipes ?? [];
  const defaultName = defaultBuildingByResource[resourceId];
  const buildingName = defaultName && recipes.some((r) => r.name === defaultName)
    ? defaultName
    : recipes[0]?.name ?? '';
  return {
    id: crypto.randomUUID(),
    resourceId,
    buildingName,
    inputType: 'buildings',
    value: 1,
  };
}

function goalsFromPlan(planGoals: { resourceId: string; buildingName: string; inputType: 'buildings' | 'output_per_day' | 'output_per_year'; value: number }[]): ProductionGoal[] {
  return planGoals.map((g) => {
    const production = productionCalculator.getProduction(g.resourceId);
    const recipes = production?.recipes ?? [];
    const buildingName = recipes.some((r) => r.name === g.buildingName) ? g.buildingName : (recipes[0]?.name ?? g.buildingName);
    return {
      id: crypto.randomUUID(),
      resourceId: g.resourceId,
      buildingName,
      inputType: g.inputType,
      value: Number.isFinite(g.value) && g.value > 0 ? g.value : 1,
    };
  });
}

/** Génère un nom à partir des ressources en objectif (pour sauvegarde auto). */
function generatePlanName(state: PlanStateSerialized, t: (key: string) => string): string {
  if (!state.g?.length) return t('industry.unnamed');
  const names = state.g
    .map((g) => t(`resources.${g.resourceId}`))
    .filter(Boolean);
  return [...new Set(names)].join(', ') || t('industry.unnamed');
}

export function ProductionCalculator() {
  const { t } = useTranslation();
  const sourceQuality = useStore((state) => state.sourceQuality);
  const defaultYear = useStore((state) => state.year);
  const defaultVehicleId = useStore((state) => state.defaultVehicleId);
  const defaultBuildingByResource = useStore((state) => state.defaultBuildingByResource);

  const planFromUrl = useRef<ReturnType<typeof getPlanStateFromUrl>>(null);
  if (planFromUrl.current === null) planFromUrl.current = getPlanStateFromUrl();
  const saved = planFromUrl.current;

  const [productionGoals, setProductionGoals] = useState<ProductionGoal[]>(() => {
    if (saved?.g?.length) {
      return goalsFromPlan(saved.g);
    }
    return [createInitialGoal('steel', defaultBuildingByResource)];
  });
  const [disabledResources, setDisabledResources] = useState<Set<string>>(() => new Set(saved?.d ?? []));
  const [manuallyDisabledResources, setManuallyDisabledResources] = useState<Set<string>>(new Set());
  const [initialDisabledResources, setInitialDisabledResources] = useState<Set<string>>(new Set());
  const [chainYear, setChainYear] = useState<number>(saved?.y ?? defaultYear);
  const [sourceQualityFromPlan, setSourceQualityFromPlan] = useState<number | null>(() => (saved?.sq != null ? saved.sq : null));
  const [sourceQualityByResource, setSourceQualityByResource] = useState<Record<string, number>>(() => saved?.sqr ?? {});
  const [buildingByResource, setBuildingByResource] = useState<Record<string, string>>(() => saved?.br ?? {});
  const [vehicleConfigByResource, setVehicleConfigByResource] = useState<Record<string, MineVehicleConfig>>(() => {
    if (!saved?.vc || typeof saved.vc !== 'object') return {};
    const out: Record<string, MineVehicleConfig> = {};
    for (const [rid, v] of Object.entries(saved.vc)) {
      if (v && Array.isArray(v.vehicleSlots) && typeof v.allowPersonnel === 'boolean') {
        out[rid] = { vehicleSlots: v.vehicleSlots, allowPersonnel: v.allowPersonnel };
      }
    }
    return out;
  });
  const [chargeRatioByResource, setChargeRatioByResource] = useState<Record<string, number>>(() => saved?.cr ?? {});
  const [vehicleSlotPickerOpen, setVehicleSlotPickerOpen] = useState<{ resourceId: string; slotIndex: number } | null>(null);
  const vehicleSlotPickerRef = useRef<HTMLDivElement | null>(null);

  const allProductions = useMemo(
    () =>
      [...productionCalculator.getAllProductions()].sort((a, b) =>
        t(`resources.${a.resourceId}`).localeCompare(t(`resources.${b.resourceId}`))
      ),
    [t]
  );

  // Fermer le picker véhicule au clic extérieur
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

  const updateGoal = (goalId: string, updates: Partial<Pick<ProductionGoal, 'resourceId' | 'buildingName' | 'inputType' | 'value'>>) => {
    setProductionGoals((prev) =>
      prev.map((g) =>
        g.id === goalId ? { ...g, ...updates } : g
      )
    );
  };

  const addGoal = () => {
    const firstProduction = allProductions[0];
    if (!firstProduction) return;
    setProductionGoals((prev) => [
      ...prev,
      createInitialGoal(firstProduction.resourceId, defaultBuildingByResource),
    ]);
  };

  const removeGoal = (goalId: string) => {
    setProductionGoals((prev) => (prev.length > 1 ? prev.filter((g) => g.id !== goalId) : prev));
  };

  const setGoalResource = (goalId: string, resourceId: string) => {
    const production = productionCalculator.getProduction(resourceId);
    const recipes = production?.recipes ?? [];
    const defaultName = defaultBuildingByResource[resourceId];
    const buildingName = defaultName && recipes.some((r) => r.name === defaultName)
      ? defaultName
      : recipes[0]?.name ?? '';
    updateGoal(goalId, { resourceId, buildingName });
  };

  // Qualité de source effective : plan (URL) > paramètre global
  const effectiveSourceQuality = sourceQualityFromPlan ?? sourceQuality;

  // Bâtiments effectifs : config par défaut + surcharges locales (chaîne en cours)
  const effectiveBuildingByResource = useMemo(
    () => ({ ...defaultBuildingByResource, ...buildingByResource }),
    [defaultBuildingByResource, buildingByResource]
  );

  // Calculer la chaîne complète (sans désactivation) pour tous les objectifs combinés
  const fullChainResults = useMemo(() => {
    const validGoals = productionGoals.filter((g) => g.resourceId && g.buildingName && g.value > 0);
    if (validGoals.length === 0) return [];

    const allChains: ProductionResult[] = [];
    for (const goal of validGoals) {
      const config: CalculationConfig = {
        resourceId: goal.resourceId,
        buildingName: effectiveBuildingByResource[goal.resourceId] ?? goal.buildingName,
        inputType: goal.inputType,
        value: goal.value,
        disabledResources: new Set(),
        sourceQuality: effectiveSourceQuality,
        sourceQualityByResource,
        defaultVehicleId,
        defaultBuildingByResource: effectiveBuildingByResource,
        year: chainYear,
        vehicleConfigByResource: Object.keys(vehicleConfigByResource).length > 0 ? vehicleConfigByResource : undefined,
        chargeRatioByResource: Object.keys(chargeRatioByResource).length > 0 ? chargeRatioByResource : undefined,
      };
      const chain = productionCalculator.calculateProductionChain(config);
      allChains.push(...chain);
    }
    return productionCalculator.aggregateResults(allChains);
  }, [productionGoals, effectiveSourceQuality, sourceQualityByResource, chainYear, defaultVehicleId, effectiveBuildingByResource, vehicleConfigByResource, chargeRatioByResource]);

  // Réinitialiser les ressources désactivées uniquement quand la ressource cible change (pas l'année ni le bâtiment)
  useEffect(() => {
    setInitialDisabledResources(new Set());
    setManuallyDisabledResources(new Set());
    setDisabledResources(new Set());
  }, [productionGoals.length, productionGoals.map((g) => g.resourceId).join(',')]);

  // État de plan sérialisé courant (pour URL et sauvegarde locale)
  const currentPlanState = useMemo((): PlanStateSerialized | null => {
    const goals = productionGoals
      .filter((g) => g.resourceId && g.buildingName)
      .map((g) => ({ resourceId: g.resourceId, buildingName: g.buildingName, inputType: g.inputType, value: g.value }));
    if (goals.length === 0) return null;
    const vc: Record<string, { vehicleSlots: (string | null)[]; allowPersonnel: boolean }> = {};
    Object.entries(vehicleConfigByResource).forEach(([rid, cfg]) => {
      vc[rid] = { vehicleSlots: cfg.vehicleSlots, allowPersonnel: cfg.allowPersonnel };
    });
    return {
      g: goals,
      y: chainYear,
      sq: effectiveSourceQuality,
      sqr: Object.keys(sourceQualityByResource).length ? sourceQualityByResource : undefined,
      br: Object.keys(buildingByResource).length ? buildingByResource : undefined,
      vc: Object.keys(vc).length ? vc : undefined,
      cr: Object.keys(chargeRatioByResource).length ? chargeRatioByResource : undefined,
      d: disabledResources.size ? Array.from(disabledResources) : undefined,
    };
  }, [productionGoals, chainYear, effectiveSourceQuality, sourceQualityByResource, buildingByResource, vehicleConfigByResource, chargeRatioByResource, disabledResources]);

  // Sauvegarder l'état dans l'URL pour partage (debounce)
  const saveToUrlTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveToUrlTimeoutRef.current) clearTimeout(saveToUrlTimeoutRef.current);
    saveToUrlTimeoutRef.current = setTimeout(() => {
      saveToUrlTimeoutRef.current = null;
      setPlanStateInUrl(currentPlanState);
    }, 600);
    return () => {
      if (saveToUrlTimeoutRef.current) clearTimeout(saveToUrlTimeoutRef.current);
    };
  }, [currentPlanState]);

  // Appliquer un état de plan chargé (sauvegarde locale ou URL)
  const applyPlanState = (plan: PlanStateSerialized) => {
    setProductionGoals(goalsFromPlan(plan.g));
    setDisabledResources(new Set(plan.d ?? []));
    setManuallyDisabledResources(new Set());
    setInitialDisabledResources(new Set());
    setChainYear(plan.y ?? defaultYear);
    setSourceQualityFromPlan(plan.sq ?? null);
    setSourceQualityByResource(plan.sqr ?? {});
    setBuildingByResource(plan.br ?? {});
    const vc: Record<string, MineVehicleConfig> = {};
    if (plan.vc && typeof plan.vc === 'object') {
      for (const [rid, v] of Object.entries(plan.vc)) {
        if (v && Array.isArray(v.vehicleSlots) && typeof v.allowPersonnel === 'boolean') {
          vc[rid] = { vehicleSlots: v.vehicleSlots, allowPersonnel: v.allowPersonnel };
        }
      }
    }
    setVehicleConfigByResource(vc);
    setChargeRatioByResource(plan.cr ?? {});
    setPlanStateInUrl(plan);
  };

  // Calculs sauvegardés : panneau latéral, sauvegarde auto, courant
  const [savedPlansList, setSavedPlansList] = useState<SavedPlan[]>(() => getSavedPlans());
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [renamePlanId, setRenamePlanId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  type PlansSort = { field: 'date' | 'name'; order: 'asc' | 'desc' };
  const [plansSort, setPlansSort] = useState<PlansSort>({ field: 'date', order: 'desc' });
  const hasInitialPlanRef = useRef(false);
  const refreshSavedPlans = () => setSavedPlansList(getSavedPlans());

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

  // Premier calcul : si aucun plan en base, en créer un depuis l'état courant (URL ou défaut)
  useEffect(() => {
    if (hasInitialPlanRef.current) return;
    const plans = getSavedPlans();
    if (plans.length === 0 && currentPlanState) {
      hasInitialPlanRef.current = true;
      const plan = savePlan(generatePlanName(currentPlanState, t), currentPlanState);
      setCurrentPlanId(plan.id);
      refreshSavedPlans();
    }
  }, [currentPlanState]);

  // Sauvegarde automatique du calcul courant (nom généré + état), debounce
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!currentPlanId || !currentPlanState) return;
    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveTimeoutRef.current = null;
      updatePlan(currentPlanId, { planState: currentPlanState });
      refreshSavedPlans();
    }, 600);
    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
    };
  }, [currentPlanId, currentPlanState]);

  const handleLoadPlan = (id: string) => {
    const plan = getPlanState(id);
    if (plan) {
      applyPlanState(plan);
      setCurrentPlanId(id);
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
    const plan = savePlan(generatePlanName(defaultState, t), defaultState);
    setCurrentPlanId(plan.id);
    applyPlanState(defaultState);
    refreshSavedPlans();
  };
  const handleDuplicatePlan = (id: string) => {
    const plan = savedPlansList.find((p) => p.id === id);
    if (!plan) return;
    const newPlan = savePlan(t('industry.copyOf', { name: plan.name }), plan.planState);
    setCurrentPlanId(newPlan.id);
    applyPlanState(plan.planState);
    refreshSavedPlans();
  };
  const startRename = (plan: SavedPlan) => {
    setRenamePlanId(plan.id);
    setRenameValue(plan.name);
  };
  const submitRename = () => {
    if (renamePlanId && renameValue.trim()) {
      updatePlan(renamePlanId, { name: renameValue.trim() });
      refreshSavedPlans();
    }
    setRenamePlanId(null);
    setRenameValue('');
  };
  const handleDeletePlan = (id: string) => {
    deletePlan(id);
    if (id === currentPlanId) setCurrentPlanId(null);
    refreshSavedPlans();
  };

  // Calculer en direct les résultats avec les ressources désactivées
  const resultsWithMeta = useMemo(() => {
    const validGoals = productionGoals.filter((g) => g.resourceId && g.buildingName && g.value > 0);
    const primaryIds = new Set(validGoals.map((g) => g.resourceId));
    if (validGoals.length === 0) return { results: [] as ProductionResult[], surplusByResource: new Map<string, number>(), hasAnySurplus: false };

    const allChains: ProductionResult[] = [];
    for (const goal of validGoals) {
      const config: CalculationConfig = {
        resourceId: goal.resourceId,
        buildingName: effectiveBuildingByResource[goal.resourceId] ?? goal.buildingName,
        inputType: goal.inputType,
        value: goal.value,
        disabledResources,
        sourceQuality: effectiveSourceQuality,
        sourceQualityByResource,
        defaultVehicleId,
        defaultBuildingByResource: effectiveBuildingByResource,
        year: chainYear,
        vehicleConfigByResource: Object.keys(vehicleConfigByResource).length > 0 ? vehicleConfigByResource : undefined,
        chargeRatioByResource: Object.keys(chargeRatioByResource).length > 0 ? chargeRatioByResource : undefined,
      };
      const chain = productionCalculator.calculateProductionChain(config);
      allChains.push(...chain);
    }
    const aggregated = productionCalculator.aggregateResults(allChains);
    
    // Créer un map pour accès rapide
    const aggregatedMap = new Map<string, ProductionResult>();
    aggregated.forEach((result) => {
      aggregatedMap.set(result.resourceId, result);
    });
    
    // Trouver les dépendances à retirer (dépendances exclusives des ressources désactivées)
    const resourcesToRemove = new Set<string>();
    
    // Créer un map des ressources qui utilisent chaque ressource
    const usedByMap = new Map<string, Set<string>>();
    fullChainResults.forEach((fullResult) => {
      fullResult.inputsPerSecond.forEach((_, inputResourceId) => {
        if (!usedByMap.has(inputResourceId)) {
          usedByMap.set(inputResourceId, new Set());
        }
        usedByMap.get(inputResourceId)!.add(fullResult.resourceId);
      });
    });
    
    // Ressources à retirer : uniquement utilisées par des ressources désactivées
    const toRemove = productionCalculator.findDependentResources(disabledResources, fullChainResults);
    toRemove.forEach((depId) => resourcesToRemove.add(depId));
    
    // Consommation totale par ressource : uniquement des bâtiments actifs (ni retirés ni désactivés)
    // Les ressources désactivées = importées → on ne produit pas → on ne compte pas leur consommation
    const totalConsumptionPerResource = new Map<string, number>();
    fullChainResults.forEach((result) => {
      if (
        !resourcesToRemove.has(result.resourceId) &&
        !disabledResources.has(result.resourceId)
      ) {
        result.inputsPerSecond.forEach((amount, inputResourceId) => {
          if (!resourcesToRemove.has(inputResourceId)) {
            const current = totalConsumptionPerResource.get(inputResourceId) || 0;
            totalConsumptionPerResource.set(inputResourceId, current + amount);
          }
        });
      }
    });
    
    // Construire les résultats finaux en gardant l'ordre de la chaîne complète
    const finalResults: ProductionResult[] = [];
    const addedResources = new Set<string>();
    
    // Collecter toutes les ressources non produisibles depuis les résultats calculés
    const nonProducibleResults = new Map<string, ProductionResult>();
    aggregated.forEach((result) => {
      if (result.disabled && result.buildingName === 'Import') {
        nonProducibleResults.set(result.resourceId, result);
      }
    });
    
    // Parcourir la chaîne complète pour garder l'ordre
    fullChainResults.forEach((fullResult) => {
      const resourceId = fullResult.resourceId;
      
      // Si c'est une dépendance à retirer, on la saute
      if (resourcesToRemove.has(resourceId)) {
        return;
      }
      
      // Si la ressource est désactivée, on l'ajoute depuis la chaîne complète
      if (disabledResources.has(resourceId)) {
        if (!addedResources.has(resourceId)) {
          const totalConsumption = totalConsumptionPerResource.get(resourceId);
          if (totalConsumption !== undefined && totalConsumption > 0) {
            const resultWithConsumption: ProductionResult = {
              ...fullResult,
              outputsPerSecond: new Map([[resourceId, totalConsumption]]),
            };
            finalResults.push(resultWithConsumption);
          } else {
            finalResults.push(fullResult);
          }
          addedResources.add(resourceId);
        }
        return;
      }
      
      // Sinon, on prend le résultat calculé (ou celui de la chaîne complète si pas calculé)
      const calculatedResult = aggregatedMap.get(resourceId);
      if (calculatedResult && !addedResources.has(resourceId)) {
        const totalConsumption = totalConsumptionPerResource.get(resourceId);
        const production = calculatedResult.outputsPerSecond.get(resourceId) ?? 0;
        const hasSurplus = production > (totalConsumption ?? 0);
        if (totalConsumption !== undefined && totalConsumption > 0 && !hasSurplus) {
          const resultWithConsumption: ProductionResult = {
            ...calculatedResult,
            outputsPerSecond: new Map([[resourceId, totalConsumption]]),
          };
          finalResults.push(resultWithConsumption);
        } else {
          finalResults.push(calculatedResult);
        }
        addedResources.add(resourceId);
      } else if (!addedResources.has(resourceId)) {
        // Vérifier si c'est une ressource non produisible (eau, électricité, etc.)
        const producingRecipes = productionCalculator.findRecipesProducing(resourceId);
        const isNonProducible = producingRecipes.length === 0;
        
        if (isNonProducible) {
          // Pour les ressources non produisibles, vérifier qu'elles sont consommées par au moins une ressource active
          const users = usedByMap.get(resourceId);
          const hasActiveUser = users && Array.from(users).some(userId => 
            !disabledResources.has(userId) && !resourcesToRemove.has(userId)
          );
          
          // Ne l'ajouter que si elle est consommée par au moins une ressource active
          if (hasActiveUser) {
            // Utiliser la consommation totale pour les ressources non produisibles
            const totalConsumption = totalConsumptionPerResource.get(resourceId);
            if (totalConsumption !== undefined) {
              const resultWithConsumption: ProductionResult = {
                ...fullResult,
                outputsPerSecond: new Map([[resourceId, totalConsumption]]),
              };
              finalResults.push(resultWithConsumption);
            } else {
              finalResults.push(fullResult);
            }
            addedResources.add(resourceId);
          }
        } else {
          // Pour les ressources produisibles : utiliser production si > consommation (surplus)
          const totalConsumption = totalConsumptionPerResource.get(resourceId);
          const production = fullResult.outputsPerSecond.get(resourceId) ?? 0;
          const hasSurplus = production > (totalConsumption ?? 0);
          if (totalConsumption !== undefined && totalConsumption > 0 && !hasSurplus) {
            const resultWithConsumption: ProductionResult = {
              ...fullResult,
              outputsPerSecond: new Map([[resourceId, totalConsumption]]),
            };
            finalResults.push(resultWithConsumption);
          } else {
            finalResults.push(fullResult);
          }
          addedResources.add(resourceId);
        }
      }
    });
    
    // Séparer les ressources en groupes : normales, eau, électricité
    const normalResources: ProductionResult[] = [];
    let waterResource: ProductionResult | null = null;
    let electricityResource: ProductionResult | null = null;
    
    // Séparer les ressources déjà dans finalResults
    finalResults.forEach(result => {
      if (productionCalculator.isElectricity(result.resourceId)) {
        electricityResource = result;
      } else if (productionCalculator.isWater(result.resourceId)) {
        waterResource = result;
      } else {
        normalResources.push(result);
      }
    });
    
    // Ajouter les ressources non produisibles (eau, électricité, etc.) qui ne sont pas encore ajoutées
    // Mais seulement si elles sont consommées par des ressources actives
    nonProducibleResults.forEach((nonProducibleResult, resourceId) => {
      if (!addedResources.has(resourceId)) {
        // Vérifier si cette ressource non produisible est consommée par au moins une ressource active
        const users = usedByMap.get(resourceId);
        const hasActiveUser = users && Array.from(users).some(userId => 
          !disabledResources.has(userId) && !resourcesToRemove.has(userId)
        );
        
        // Ne l'ajouter que si elle est consommée par au moins une ressource active
        if (hasActiveUser) {
          // Utiliser la consommation totale pour les ressources non produisibles
          const totalConsumption = totalConsumptionPerResource.get(resourceId);
          const resultToAdd = totalConsumption !== undefined
            ? { ...nonProducibleResult, outputsPerSecond: new Map([[resourceId, totalConsumption]]) }
            : nonProducibleResult;
          
          if (productionCalculator.isElectricity(resourceId)) {
            electricityResource = resultToAdd;
          } else if (productionCalculator.isWater(resourceId)) {
            waterResource = resultToAdd;
          } else {
            normalResources.push(resultToAdd);
          }
          addedResources.add(resourceId);
        }
      }
    });
    
    // Construire le tableau final : ressources normales, puis eau, puis électricité
    const sortedResults: ProductionResult[] = [];
    
    // Ajouter toutes les ressources normales
    normalResources.forEach(result => {
      sortedResults.push(result);
    });
    
    // Ajouter l'eau en avant-dernière
    if (waterResource) {
      sortedResults.push(waterResource);
    }
    
    // Ajouter l'électricité en dernière
    if (electricityResource) {
      sortedResults.push(electricityResource);
    }
    
    // Tri selon sort.md : groupes par dépendance, produit final → matières premières
    const results = sortProductionChain(sortedResults);
    // Surplus et visibilité colonne : calculés depuis les mêmes données (aggregated) que l'affichage
    const surplusByResource = productionCalculator.computeSurplusByResource(aggregated);
    const hasAnySurplus = results.some((r) => {
      const surplusPerSec = primaryIds.has(r.resourceId) ? 0 : (surplusByResource.get(r.resourceId) ?? 0);
      const surplusPerDay = surplusPerSec * (24 * 60 * 60);
      const amountPerDay = (r.outputsPerSecond.get(r.resourceId) ?? 0) * (24 * 60 * 60);
      const surplusToShow = r.isCoProduct ? amountPerDay : surplusPerDay;
      return surplusToShow > 0.01;
    });
    return { results, surplusByResource, hasAnySurplus };
  }, [productionGoals, disabledResources, fullChainResults, effectiveSourceQuality, sourceQualityByResource, chainYear, defaultVehicleId, effectiveBuildingByResource, vehicleConfigByResource, chargeRatioByResource]);

  const results = resultsWithMeta.results;
  const surplusByResource = resultsWithMeta.surplusByResource;
  const hasAnySurplus = resultsWithMeta.hasAnySurplus;

  const primaryResourceIds = useMemo(() => new Set(productionGoals.map((g) => g.resourceId)), [productionGoals]);

  const toggleResourceDisabled = (resourceId: string) => {
    if (!productionCalculator.canDisableResource(resourceId)) return;

    const newDisabled = new Set(disabledResources);
    const newManuallyDisabled = new Set(manuallyDisabledResources);
    const wasDisabled = newDisabled.has(resourceId);
    
    if (wasDisabled) {
      // Réactivation : retirer de la liste désactivée
      newDisabled.delete(resourceId);
      
      // Si elle était désactivée manuellement, on la retire de la liste manuelle
      if (newManuallyDisabled.has(resourceId)) {
        newManuallyDisabled.delete(resourceId);
      }
      
      // Réactiver toutes les dépendances qui ont été désactivées automatiquement
      // Trouver les ressources qui n'alimentent que la ressource réactivée (à réactiver aussi)
      const dependentResources = productionCalculator.findDependentResources(new Set([resourceId]), fullChainResults);
      
      // Parcourir toutes les ressources désactivées pour trouver celles qui sont des dépendances
      newDisabled.forEach((disabledResourceId) => {
        // Si cette ressource désactivée est une dépendance de la ressource qu'on réactive
        if (dependentResources.has(disabledResourceId)) {
          // Et qu'elle n'était pas désactivée manuellement ni initialement
          const wasManuallyDisabled = newManuallyDisabled.has(disabledResourceId);
          const wasInitiallyDisabled = initialDisabledResources.has(disabledResourceId);
          
          if (!wasManuallyDisabled && !wasInitiallyDisabled) {
            newDisabled.delete(disabledResourceId);
            newManuallyDisabled.delete(disabledResourceId);
          }
        }
      });
    } else {
      // Désactivation : ajouter à la liste désactivée et manuelle
      newDisabled.add(resourceId);
      newManuallyDisabled.add(resourceId);
      
      // Désactiver automatiquement les dépendances exclusives
      const dependentResources = productionCalculator.findDependentResources(new Set([resourceId]), fullChainResults);
      dependentResources.forEach((depId) => {
        if (productionCalculator.canDisableResource(depId)) {
          newDisabled.add(depId);
          // Les dépendances automatiques ne sont pas marquées comme manuelles
        }
      });
    }
    
    setDisabledResources(newDisabled);
    setManuallyDisabledResources(newManuallyDisabled);
  };

  const totalWorkers = useMemo(
    () => {
      // Exclure les travailleurs des ressources désactivées
      const activeResults = results.filter(r => !disabledResources.has(r.resourceId));
      return Math.ceil(productionCalculator.calculateTotalWorkers(activeResults));
    },
    [results, disabledResources]
  );
  const totalProfesors = useMemo(
    () => {
      // Exclure les professeurs des ressources désactivées
      const activeResults = results.filter(r => !disabledResources.has(r.resourceId));
      return Math.ceil(productionCalculator.calculateTotalProfesors(activeResults));
    },
    [results, disabledResources]
  );

  return (
    <div className="flex gap-4">
      <div className="flex-1 min-w-0 space-y-6">
      <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-2xl font-bold mb-4 text-soviet-red">{t('industry.title')}</h2>

        <div className="space-y-3">
          <label className="block text-sm font-medium">{t('industry.productionGoals')}</label>
          <p className="text-sm text-gray-400 mb-2">
            {t('industry.productionGoalsHint')}
          </p>
          <div className="space-y-2">
            {productionGoals.map((goal) => {
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
                <div
                  key={goal.id}
                  className="flex flex-wrap items-center gap-3 bg-gray-700/50 rounded-lg px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => removeGoal(goal.id)}
                    className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center text-red-400 hover:bg-gray-600 transition-colors"
                    title={t('industry.removeGoalTitle')}
                  >
                    ✕
                  </button>
                  <ResourcePicker
                    productions={allProductions}
                    selectedResourceId={goal.resourceId}
                    onSelect={(resourceId) => setGoalResource(goal.id, resourceId)}
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
                        updateGoal(goal.id, { inputType: 'buildings', value: v });
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
                        updateGoal(goal.id, { inputType: 'output_per_day', value: v });
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
                        updateGoal(goal.id, { inputType: 'output_per_year', value: v });
                      }}
                      className="w-28 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={addGoal}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-gray-700 border border-gray-600 hover:border-soviet-gold hover:bg-gray-600 transition-colors text-soviet-gold"
          >
            + {t('industry.addGoal')}
          </button>
        </div>
      </div>

      {/* Résultats */}
      {results.length > 0 && (() => {
        const hasAnyMine = results.some((r) => productionCalculator.isMineResult(r.resourceId, r.buildingName));
        const hasAnyVehicleMine = results.some((r) => productionCalculator.isVehicleMineResult(r.resourceId, r.buildingName));
        const setSourceQualityForResource = (rid: string, value: number) => {
          setSourceQualityByResource((prev) => ({ ...prev, [rid]: Math.max(0, Math.min(100, value)) }));
        };
        const setBuildingForResource = (rid: string, buildingName: string) => {
          setBuildingByResource((prev) => ({ ...prev, [rid]: buildingName }));
        };
        return (
        <>
          {/* Tableau de la chaîne de production */}
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
                  onChange={(e) => setChainYear(parseInt(e.target.value, 10) || 1960)}
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
                    const amountPerYear = productionCalculator.floor(amountPerDay * 365);
                    const isWater = productionCalculator.isWater(resourceId);
                    const isElectricity = productionCalculator.isElectricity(resourceId);
                    const unitYear = isElectricity ? 'MWh/an' : isWater ? 'm³/an' : 't/an';

                    const formattedPerYear = isElectricity
                      ? `${productionCalculator.formatInteger(amountPerDay * 60 * 365)} ${unitYear}`
                      : `${productionCalculator.formatInteger(amountPerYear)} ${unitYear}`;

                    const workersPerBuilding = result.workersPerBuilding || 0;
                    const profesorsPerBuilding = result.profesorsPerBuilding || 0;
                    const hasVehiclePersonnelEnabled = result.hasVehiclePersonnelEnabled === true;
                    const hasNoPersonnel = workersPerBuilding === 0 && profesorsPerBuilding === 0;
                    const showCharge = !hasNoPersonnel || hasVehiclePersonnelEnabled;

                    const hasInvalidConfig = result.invalidConfig === true;
                    const nextIsCoProduct = results[index + 1]?.isCoProduct === true;
                    const isSameBuildingBlock = result.isCoProduct || nextIsCoProduct;
                    return (
                      <tr
                        key={`${result.resourceId}-${result.buildingName}-${index}`}
                        className={`h-[53px] ${nextIsCoProduct ? 'border-b-0' : 'border-b border-gray-700'} ${hasInvalidConfig ? 'border-2 border-red-500 bg-red-950/30 hover:bg-red-950/40' : 'hover:bg-gray-700/50'}`}
                      >
                        <td className="py-3 px-4 align-middle">
                          <div className="flex items-center gap-2">
                            {getResourceIcon(result.resourceId) && (
                              canDisable ? (
                                <button
                                  type="button"
                                  onClick={() => toggleResourceDisabled(result.resourceId)}
                                  className={`flex-shrink-0 p-0.5 rounded transition-opacity ${isDisabled ? 'opacity-40' : 'opacity-100'}`}
                                  title={isDisabled ? t('industry.enableResource') : t('industry.disableResource')}
                                >
                                  <img
                                    src={getResourceIcon(result.resourceId)}
                                    alt=""
                                    className="w-6 h-6 object-contain"
                                  />
                                </button>
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
                              <span
                                className="text-red-400"
                                title={t('industry.quarryNoVehicleOrPersonnel')}
                              >
                                ⚠
                              </span>
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
                              return (
                                <span>0 {isWater ? 'm³' : isElectricity ? 'MWh' : 't'}</span>
                              );
                            }
                            const formattedRequired = isElectricity
                              ? `${productionCalculator.formatInteger(requiredPerDay * 60)} MWh`
                              : `${productionCalculator.formatValue(requiredPerDay)} ${isWater ? 'm³' : 't'}`;
                            const tooltipContent = formattedPerYear;
                            return (
                              <Tooltip content={tooltipContent}>
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
                                ? `${productionCalculator.formatInteger(surplusToShow * 60)} MWh`
                                : `${productionCalculator.formatValue(surplusToShow)} ${isWater ? 'm³' : 't'}`;
                              const surplusPerYearFormatted = isElectricity
                                ? `${productionCalculator.formatInteger(surplusToShow * 60 * 365)} ${unitYear}`
                                : `${productionCalculator.formatInteger(surplusToShow * 365)} ${unitYear}`;
                              return (
                                <Tooltip content={surplusPerYearFormatted}>
                                  <span className="text-soviet-gold">+ {surplusFormatted}</span>
                                </Tooltip>
                              );
                            })()}
                          </td>
                        )}
                        <td
                          className={`py-3 px-4 text-gray-400 align-middle ${isSameBuildingBlock ? 'border-l border-gray-600' : ''} ${result.isCoProduct ? 'border-t-0 pt-0' : ''} ${!result.isCoProduct && nextIsCoProduct ? 'border-b-0 pb-0' : ''}`}
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
                                    onSelect={(r) => setBuildingForResource(result.resourceId, r.name)}
                                    size={36}
                                  />
                                )}
                                {showCharge ? (
                                  <span className="flex items-center gap-1 flex-wrap">
                                    <Tooltip content={`${formatNumber(workersPerBuilding)} ${t('tooltips.workersBlue')}${profesorsPerBuilding > 0 ? `, ${formatNumber(profesorsPerBuilding)} ${t('tooltips.workersWhite')}` : ''}`}>
                                      <span> x {formatNumber(result.buildingCount)} - {formatNumber(chargePercentage)} %</span>
                                    </Tooltip>
                                    {!isImported && (
                                      <span className="flex items-center gap-1">
                                        {chargePercentage < 100 && (
                                          <button
                                            type="button"
                                            onClick={() => setChargeRatioByResource((prev) => ({ ...prev, [result.resourceId]: 1 }))}
                                            title={t('industry.chargeTo100')}
                                            className="text-xs px-1.5 py-0.5 rounded bg-gray-700 hover:bg-soviet-gold hover:text-gray-900 text-soviet-gold"
                                          >
                                            ➞100 %
                                          </button>
                                        )}
                                        {chargeRatioByResource[result.resourceId] !== undefined && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const { [result.resourceId]: _, ...rest } = chargeRatioByResource;
                                              setChargeRatioByResource(rest);
                                            }}
                                            title={t('industry.resetCharge')}
                                            className="text-xs px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-500 text-gray-400"
                                          >
                                            ✕
                                          </button>
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
                            className={`py-3 px-4 text-right align-middle ${result.isCoProduct ? 'border-t-0 pt-0' : ''} ${!result.isCoProduct && results[index + 1]?.isCoProduct ? 'border-b-0 pb-0' : ''}`}
                          >
                            {result.isCoProduct ? null : (
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {!isImported && productionCalculator.isMineResult(result.resourceId, result.buildingName) && (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={sourceQualityByResource[result.resourceId] ?? effectiveSourceQuality}
                                    onChange={(e) => setSourceQualityForResource(result.resourceId, parseFloat(e.target.value) || 50)}
                                    className="w-14 h-6 bg-gray-700 border border-gray-600 rounded px-2 text-sm text-white text-right"
                                    title={t('industry.qualitySource')}
                                  />
                                  <span className="text-gray-400 text-xs">%</span>
                                </div>
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
                                      <button
                                        type="button"
                                        onClick={() => setVehicleConfigByResource((prev) => ({
                                          ...prev,
                                          [result.resourceId]: {
                                            ...cfg,
                                            allowPersonnel: !allowPersonnel,
                                          },
                                        }))}
                                        title={allowPersonnel ? t('tooltips.personnelOn') : t('tooltips.personnelOff')}
                                        className={`flex-shrink-0 w-8 h-8 rounded overflow-hidden flex items-center justify-center transition-opacity ${allowPersonnel ? 'opacity-100' : 'opacity-40'}`}
                                      >
                                        <img src={workersIcon} alt="" className="w-full h-full object-contain invert" />
                                      </button>
                                    )}
                                    {/* Emplacements véhicules : image par slot, clic ouvre picker */}
                                    {Array.from({ length: maxVehicles }, (_, slotIdx) => {
                                      const vehicleId = slots[slotIdx] ?? null;
                                      const vehicle = vehicleId ? getVehicle(vehicleId) : undefined;
                                      const isPickerOpen = vehicleSlotPickerOpen?.resourceId === result.resourceId && vehicleSlotPickerOpen?.slotIndex === slotIdx;
                                      return (
                                        <div key={slotIdx} ref={vehicleSlotPickerRef} className="relative">
                                          <button
                                            type="button"
                                            onClick={() => setVehicleSlotPickerOpen((o) =>
                                              o?.resourceId === result.resourceId && o?.slotIndex === slotIdx
                                                ? null
                                                : { resourceId: result.resourceId, slotIndex: slotIdx }
                                            )}
                                            className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-gray-700 border-2 border-gray-600 hover:border-soviet-gold flex items-center justify-center transition-colors"
                                            title={vehicle ? vehicle.name : t('tooltips.chooseVehicle')}
                                          >
                                            <img
                                              src={vehicle ? getVehicleImageSrc(vehicle) : VEHICLE_PLACEHOLDER}
                                              alt=""
                                              className={`w-full h-full object-contain p-0.5 ${!vehicle ? 'opacity-50' : ''}`}
                                            />
                                          </button>
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
                                                  setVehicleConfigByResource((prev) => ({ ...prev, [result.resourceId]: { ...cfg, vehicleSlots: next } }));
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
                                                    setVehicleConfigByResource((prev) => ({ ...prev, [result.resourceId]: { ...cfg, vehicleSlots: next } }));
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
                                                        {v.origin} · {formatVehicleSkills(v)}
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
                    );
                  })}
                  
                  {/* Ligne Personnels */}
                  <tr className="border-b border-gray-700 hover:bg-gray-700/50 h-[53px]">
                    <td className="py-3 px-4 align-middle">
                      <div className="flex items-center gap-2">
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
                      <Tooltip content={`${formatNumber(totalWorkers)} ${t('tooltips.workersBlue')}, ${formatNumber(totalProfesors)} ${t('tooltips.workersWhite')}`}>
                        <span>{formatNumber(totalWorkers + totalProfesors)}</span>
                      </Tooltip>
                    </td>
                    <td className="py-3 px-4 text-gray-400 align-middle">
                      {/* Vide - Bâtiment */}
                    </td>
                    {(hasAnyMine || hasAnyVehicleMine) && <td className="py-3 px-4 text-gray-400 align-middle" />}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
        );
      })()}
      </div>

      {/* Panneau latéral : mes calculs */}
      <aside className="w-80 shrink-0 flex flex-col bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        <div className="p-4 border-b border-gray-600">
          <h3 className="text-lg font-semibold text-soviet-gold">{t('industry.myCalculations')}</h3>
          <button
            type="button"
            onClick={handleNewPlan}
            className="mt-3 w-full py-2 rounded-lg bg-soviet-red hover:bg-red-700 text-white text-sm font-medium transition-colors"
          >
            + {t('industry.newCalculation')}
          </button>
        </div>
        {savedPlansList.length > 1 && (
          <div className="flex justify-end gap-3 px-3 pt-1 pb-0.5 border-b border-gray-700/50">
            <button
              type="button"
              onClick={() => toggleSort('date')}
              className="text-xs text-gray-500 hover:text-soviet-gold transition-colors underline-offset-2 hover:underline"
              title={plansSort.order === 'desc' ? t('industry.sortDateDesc') : t('industry.sortDateAsc')}
            >
              {t('industry.sortDate')} {plansSort.field === 'date' ? (plansSort.order === 'desc' ? '↓' : '↑') : ''}
            </button>
            <button
              type="button"
              onClick={() => toggleSort('name')}
              className="text-xs text-gray-500 hover:text-soviet-gold transition-colors underline-offset-2 hover:underline"
              title={plansSort.field === 'name' && plansSort.order === 'asc' ? t('industry.sortNameAZ') : t('industry.sortNameZA')}
            >
              {t('industry.sortName')} {plansSort.field === 'name' ? (plansSort.order === 'asc' ? '↑' : '↓') : ''}
            </button>
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
                  <span
                    className="text-sm text-white truncate cursor-default"
                    title={plan.name}
                  >
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
                    onClick={() => handleLoadPlan(plan.id)}
                    className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-soviet-gold hover:text-gray-900 text-gray-200 transition-colors"
                  >
                    {t('industry.load')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDuplicatePlan(plan.id)}
                    className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-gray-200 transition-colors"
                    title={t('industry.duplicate')}
                  >
                    {t('industry.duplicate')}
                  </button>
                  <button
                    type="button"
                    onClick={() => startRename(plan)}
                    className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-gray-500 text-gray-200 transition-colors"
                    title={t('industry.rename')}
                  >
                    {t('industry.rename')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePlan(plan.id)}
                    className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-red-600 text-gray-200 transition-colors"
                    title={t('industry.delete')}
                  >
                    {t('industry.delete')}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        {savedPlansList.length === 0 && (
          <p className="p-4 text-sm text-gray-500">{t('industry.noCalculations')}</p>
        )}
      </aside>
    </div>
  );
}
