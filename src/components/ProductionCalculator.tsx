import { useState, useMemo, useEffect, useRef, Fragment } from 'react';
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
import { getResourceName } from '@/data/productions';
import { Tooltip } from '@/components/Tooltip';
import { vehicles, getVehicle, formatVehicleSkills, ORIGIN_TO_KEY } from '@/data/vehicles';
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
  const [expandedChainRows, setExpandedChainRows] = useState<Set<string>>(new Set());
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
          const outputs = new Map(calculatedResult.outputsPerSecond);
          outputs.set(resourceId, totalConsumption);
          const resultWithConsumption: ProductionResult = {
            ...calculatedResult,
            outputsPerSecond: outputs,
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
            const outputs = new Map(fullResult.outputsPerSecond);
            outputs.set(resourceId, totalConsumption);
            const resultWithConsumption: ProductionResult = {
              ...fullResult,
              outputsPerSecond: outputs,
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
    
    // Total sewage (coproduit : 1 m³ eau consommée → 1 m³ sewage), à afficher sur une ligne dédiée
    let totalSewagePerSecond = 0;
    finalResults.forEach(result => {
      totalSewagePerSecond += result.outputsPerSecond.get('sewage') ?? 0;
    });

    // Séparer les ressources déjà dans finalResults
    finalResults.forEach(result => {
      if (productionCalculator.isElectricity(result.resourceId)) {
        electricityResource = result;
      } else if (productionCalculator.isWater(result.resourceId)) {
        waterResource = result;
      } else if (productionCalculator.isSewage(result.resourceId)) {
        // Ne pas ajouter une ligne sewage venue des données : on utilise la ligne synthétique ci-dessous
      } else if (productionCalculator.isWasteOutput(result.resourceId)) {
        // Idem pour déchets mixtes / dangereux : lignes synthétiques ci-dessous
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
    
    // Détail par bâtiment pour la ligne sewage (coproduit commun à plusieurs bâtiments) — exclure les ressources désactivées
    const sewageBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number }> = [];
    let totalWasteMixedPerSecond = 0;
    let totalWasteToxicPerSecond = 0;
    const wasteMixedBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number; workerWasteTPerDay?: number }> = [];
    const wasteToxicBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number }> = [];
    finalResults.forEach(result => {
      if (disabledResources.has(result.resourceId)) return;
      const amt = result.outputsPerSecond.get('sewage') ?? 0;
      if (amt > 0) {
        sewageBreakdown.push({ sourceResourceId: result.resourceId, buildingName: result.buildingName, amountPerSecond: amt });
      }
      const wasteMixedAmt = result.outputsPerSecond.get('waste_mixed') ?? 0;
      if (wasteMixedAmt > 0) {
        totalWasteMixedPerSecond += wasteMixedAmt;
        const recipe = productionCalculator.getRecipe(result.resourceId, result.buildingName);
        const workerWasteTPerDay = recipe?.worker_waste_kg_per_day != null && result.totalWorkers > 0
          ? (result.totalWorkers * recipe.worker_waste_kg_per_day) / 1000
          : undefined;
        wasteMixedBreakdown.push({
          sourceResourceId: result.resourceId,
          buildingName: result.buildingName,
          amountPerSecond: wasteMixedAmt,
          ...(workerWasteTPerDay != null && workerWasteTPerDay > 0 ? { workerWasteTPerDay } : {}),
        });
      }
      const wasteToxicAmt = result.outputsPerSecond.get('waste_toxic') ?? 0;
      if (wasteToxicAmt > 0) {
        totalWasteToxicPerSecond += wasteToxicAmt;
        wasteToxicBreakdown.push({ sourceResourceId: result.resourceId, buildingName: result.buildingName, amountPerSecond: wasteToxicAmt });
      }
    });

    // Détail par bâtiment pour eau et électricité (consommation) — exclure les ressources désactivées
    const waterConsumptionBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number }> = [];
    const electricityConsumptionBreakdown: Array<{ sourceResourceId: string; buildingName: string; amountPerSecond: number }> = [];
    finalResults.forEach(result => {
      if (disabledResources.has(result.resourceId)) return;
      const waterAmt = (result.inputsPerSecond.get('water') ?? 0) + (result.inputsPerSecond.get('usagewater') ?? 0);
      if (waterAmt > 0) {
        waterConsumptionBreakdown.push({ sourceResourceId: result.resourceId, buildingName: result.buildingName, amountPerSecond: waterAmt });
      }
      const elecAmt = result.inputsPerSecond.get('eletric') ?? 0;
      if (elecAmt > 0) {
        electricityConsumptionBreakdown.push({ sourceResourceId: result.resourceId, buildingName: result.buildingName, amountPerSecond: elecAmt });
      }
    });

    // Attacher les breakdowns aux lignes eau et électricité
    if (waterResource && waterConsumptionBreakdown.length > 0) {
      waterResource = Object.assign({}, waterResource, { consumptionBreakdown: waterConsumptionBreakdown });
    }
    if (electricityResource && electricityConsumptionBreakdown.length > 0) {
      electricityResource = Object.assign({}, electricityResource, { consumptionBreakdown: electricityConsumptionBreakdown });
    }

    // Construire le tableau final : trier uniquement les ressources normales, puis ajouter eau et électricité en fin de chaîne
    const sortedResults: ProductionResult[] = [];
    normalResources.forEach(result => {
      sortedResults.push(result);
    });
    // Ne pas inclure eau/électricité dans le tri : ils n'ont pas de dépendances et se retrouveraient au milieu (ex. eau entre bauxite et raw bauxite)
    const sortedNormals = sortProductionChain(sortedResults);
    const results = [
      ...sortedNormals,
      ...(waterResource ? [waterResource] : []),
      ...(electricityResource ? [electricityResource] : []),
    ];
    // Surplus et visibilité colonne : calculés depuis les mêmes données (aggregated) que l'affichage
    const surplusByResource = productionCalculator.computeSurplusByResource(aggregated);
    const hasAnySurplus = results.some((r) => {
      const surplusPerSec = primaryIds.has(r.resourceId) ? 0 : (surplusByResource.get(r.resourceId) ?? 0);
      const surplusPerDay = surplusPerSec * (24 * 60 * 60);
      const amountPerDay = (r.outputsPerSecond.get(r.resourceId) ?? 0) * (24 * 60 * 60);
      const surplusToShow = r.isCoProduct ? amountPerDay : surplusPerDay;
      return surplusToShow > 0.01;
    }) || totalSewagePerSecond > 0;
    // Détail par bâtiment pour la ligne Personnels — exclure les ressources désactivées
    const personnelBreakdown = results
      .filter((r) => !disabledResources.has(r.resourceId) && (r.totalWorkers + r.totalProfesors) > 0)
      .map((r) => ({ sourceResourceId: r.resourceId, buildingName: r.buildingName, workers: r.totalWorkers, profesors: r.totalProfesors }));
    // Ligne sewage en fin de chaîne (après le personnel), jamais triée avec les autres
    const sewageResult: ProductionResult | null = totalSewagePerSecond > 0 ? {
      resourceId: 'sewage',
      resourceName: getResourceName('sewage'),
      buildingName: 'Coproduct',
      buildingCount: 0,
      inputsPerSecond: new Map(),
      outputsPerSecond: new Map([['sewage', totalSewagePerSecond]]),
      totalWorkers: 0,
      totalProfesors: 0,
      isCoProduct: true,
      coproductBreakdown: sewageBreakdown,
    } : null;

    const wasteMixedResult: ProductionResult | null = totalWasteMixedPerSecond > 0 ? {
      resourceId: 'waste_mixed',
      resourceName: getResourceName('waste_mixed'),
      buildingName: 'Coproduct',
      buildingCount: 0,
      inputsPerSecond: new Map(),
      outputsPerSecond: new Map([['waste_mixed', totalWasteMixedPerSecond]]),
      totalWorkers: 0,
      totalProfesors: 0,
      isCoProduct: true,
      coproductBreakdown: wasteMixedBreakdown,
    } : null;

    const wasteToxicResult: ProductionResult | null = totalWasteToxicPerSecond > 0 ? {
      resourceId: 'waste_toxic',
      resourceName: getResourceName('waste_toxic'),
      buildingName: 'Coproduct',
      buildingCount: 0,
      inputsPerSecond: new Map(),
      outputsPerSecond: new Map([['waste_toxic', totalWasteToxicPerSecond]]),
      totalWorkers: 0,
      totalProfesors: 0,
      isCoProduct: true,
      coproductBreakdown: wasteToxicBreakdown,
    } : null;

    return { results, surplusByResource, hasAnySurplus, sewageResult, wasteMixedResult, wasteToxicResult, personnelBreakdown };
  }, [productionGoals, disabledResources, fullChainResults, effectiveSourceQuality, sourceQualityByResource, chainYear, defaultVehicleId, effectiveBuildingByResource, vehicleConfigByResource, chargeRatioByResource]);

  const results = resultsWithMeta.results;
  const surplusByResource = resultsWithMeta.surplusByResource;
  const hasAnySurplus = resultsWithMeta.hasAnySurplus;
  const sewageResult = resultsWithMeta.sewageResult;
  const wasteMixedResult = resultsWithMeta.wasteMixedResult;
  const wasteToxicResult = resultsWithMeta.wasteToxicResult;
  const personnelBreakdown = resultsWithMeta.personnelBreakdown;

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
                  <Tooltip content={t('industry.removeGoalTitle')}>
                    <button
                      type="button"
                      onClick={() => removeGoal(goal.id)}
                      className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center text-red-400 hover:bg-gray-600 transition-colors"
                    >
                      ✕
                    </button>
                  </Tooltip>
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
        const chainHasLivestockBuilding = results.some((r) => r.buildingName === 'animal_farm' || r.buildingName === 'slaughterhouse');
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
                    const isSewage = productionCalculator.isSewage(resourceId);
                    const isElectricity = productionCalculator.isElectricity(resourceId);
                    const isVolume = isWater || isSewage;
                    const unitYearKey = isElectricity ? 'units.MWh_year' : isVolume ? 'units.m3_year' : 'units.t_year';
                    const unitYear = t(unitYearKey);
                    const unitShort = isElectricity ? t('units.MWh') : isVolume ? t('units.m3') : t('units.t');
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
                    const nextResult = results[index + 1];
                    const prevResult = results[index - 1];
                    // Grouper visuellement uniquement quand la ligne précédente ou suivante est du même bâtiment (vrai couple produit principal + coproduit)
                    const isSameBuildingBlock =
                      (result.isCoProduct && index > 0 && prevResult?.buildingName === result.buildingName) ||
                      (nextIsCoProduct && nextResult?.buildingName === result.buildingName);
                    const isCoProductGroupedWithPrev = result.isCoProduct && index > 0 && prevResult?.buildingName === result.buildingName;
                    const rowKey = `${result.resourceId}-${result.buildingName}-${index}`;
                    const hasCoproductDetail = !!(result.coproductBreakdown && result.coproductBreakdown.length > 0) || !!(result.consumptionBreakdown && result.consumptionBreakdown.length > 0);
                    const isRowExpanded = expandedChainRows.has(rowKey);
                    const toggleRowExpanded = () => setExpandedChainRows((prev) => {
                      const next = new Set(prev);
                      if (next.has(rowKey)) next.delete(rowKey);
                      else next.add(rowKey);
                      return next;
                    });
                    const chainTableColCount = 3 + (hasAnySurplus ? 1 : 0) + ((hasAnyMine || hasAnyVehicleMine) ? 1 : 0);
                    return (
                      <Fragment key={rowKey}>
                      <tr
                        className={`h-[53px] ${nextIsCoProduct && nextResult?.buildingName === result.buildingName ? 'border-b-0' : 'border-b border-gray-700'} ${hasInvalidConfig ? 'border-2 border-red-500 bg-red-950/30 hover:bg-red-950/40' : 'hover:bg-gray-700/50'}`}
                      >
                        <td className="py-3 px-4 align-middle">
                          <div className="flex items-center gap-2">
                            {hasCoproductDetail && (
                                <Tooltip content={t('industry.coproductsByBuilding')} placement="right">
                                  <button
                                    type="button"
                                    onClick={toggleRowExpanded}
                                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-soviet-gold transition-colors"
                                    aria-expanded={isRowExpanded}
                                  >
                                    <span className="text-xs">{isRowExpanded ? '▼' : '▶'}</span>
                                  </button>
                                </Tooltip>
                            )}
                            {getResourceIcon(result.resourceId) && (
                              canDisable ? (
                                <Tooltip content={isDisabled ? t('industry.enableResource') : t('industry.disableResource')} placement="right">
                                  <button
                                    type="button"
                                    onClick={() => toggleResourceDisabled(result.resourceId)}
                                    className={`flex-shrink-0 p-0.5 rounded transition-opacity ${isDisabled ? 'opacity-40' : 'opacity-100'}`}
                                  >
                                  <img
                                    src={getResourceIcon(result.resourceId)}
                                    alt=""
                                    className="w-6 h-6 object-contain"
                                  />
                                </button>
                                </Tooltip>
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
                              <Tooltip content={t('industry.quarryNoVehicleOrPersonnel')} placement="right">
                                <span className="text-red-400">
                                  ⚠
                                </span>
                              </Tooltip>
                            )}
                            {chainHasLivestockBuilding && productionCalculator.isWater(result.resourceId) && (
                              <Tooltip content={t('industry.waterLivestockWarning')} placement="right">
                                <span className="text-amber-400" aria-label={t('industry.waterLivestockWarning')}>
                                  ⚠
                                </span>
                              </Tooltip>
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
                              return <span className="text-gray-500">—</span>;
                            }
                            if (requiredPerDay <= 0 && surplusPerDay > 0.01) {
                              return <span className="text-gray-500">—</span>;
                            }
                            const formattedRequired = isElectricity
                              ? `${productionCalculator.formatInteger(requiredPerDay * 60)} ${unitShort}`
                              : `${productionCalculator.formatValue(requiredPerDay)} ${unitShort}`;
                            const tooltipContent = formattedPerYear;
                            return (
                              <Tooltip content={tooltipContent} placement="top">
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
                                ? `${productionCalculator.formatInteger(surplusToShow * 60)} ${unitShort}`
                                : `${productionCalculator.formatValue(surplusToShow)} ${unitShort}`;
                              const surplusPerYearFormatted = isElectricity
                                ? `${productionCalculator.formatInteger(surplusToShow * 60 * 365)} ${unitYear}`
                                : `${productionCalculator.formatInteger(surplusToShow * 365)} ${unitYear}`;
                              return (
                                <Tooltip content={surplusPerYearFormatted} placement="top">
                                  <span className="text-soviet-gold">+ {surplusFormatted}</span>
                                </Tooltip>
                              );
                            })()}
                          </td>
                        )}
                        <td
                          className={`py-3 px-4 text-gray-400 align-middle ${isSameBuildingBlock ? 'border-l border-gray-600' : ''} ${isCoProductGroupedWithPrev ? 'border-t-0 pt-0' : ''} ${!result.isCoProduct && nextIsCoProduct && nextResult?.buildingName === result.buildingName ? 'border-b-0 pb-0' : ''}`}
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
                                    <Tooltip content={`${formatNumber(workersPerBuilding)} ${t('tooltips.workersBlue')}${profesorsPerBuilding > 0 ? `, ${formatNumber(profesorsPerBuilding)} ${t('tooltips.workersWhite')}` : ''}`} placement="top">
                                      <span> x {formatNumber(result.buildingCount)} - {formatNumber(chargePercentage)} %</span>
                                    </Tooltip>
                                    {!isImported && (
                                      <span className="flex items-center gap-1">
                                        {chargePercentage < 100 && (
                                          <Tooltip content={t('industry.chargeTo100')} placement="top">
                                            <button
                                              type="button"
                                              onClick={() => setChargeRatioByResource((prev) => ({ ...prev, [result.resourceId]: 1 }))}
                                              className="text-xs px-1.5 py-0.5 rounded bg-gray-700 hover:bg-soviet-gold hover:text-gray-900 text-soviet-gold"
                                            >
                                              ➞100 %
                                            </button>
                                          </Tooltip>
                                        )}
                                        {chargeRatioByResource[result.resourceId] !== undefined && (
                                          <Tooltip content={t('industry.resetCharge')} placement="top">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const { [result.resourceId]: _, ...rest } = chargeRatioByResource;
                                                setChargeRatioByResource(rest);
                                              }}
                                              className="text-xs px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-500 text-gray-400"
                                            >
                                              ✕
                                            </button>
                                          </Tooltip>
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
                            className={`py-3 px-4 text-right align-middle ${isCoProductGroupedWithPrev ? 'border-t-0 pt-0' : ''} ${!result.isCoProduct && nextIsCoProduct && nextResult?.buildingName === result.buildingName ? 'border-b-0 pb-0' : ''}`}
                          >
                            {result.isCoProduct ? null : (
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              {!isImported && productionCalculator.isMineResult(result.resourceId, result.buildingName) && (
                                <Tooltip content={t('industry.qualitySource')} placement="top">
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={sourceQualityByResource[result.resourceId] ?? effectiveSourceQuality}
                                    onChange={(e) => setSourceQualityForResource(result.resourceId, parseFloat(e.target.value) || 50)}
                                    className="w-14 h-6 bg-gray-700 border border-gray-600 rounded px-2 text-sm text-white text-right"
                                  />
                                  <span className="text-gray-400 text-xs">%</span>
                                </div>
                                </Tooltip>
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
                                      <Tooltip content={allowPersonnel ? t('tooltips.personnelOn') : t('tooltips.personnelOff')} placement="top">
                                        <button
                                          type="button"
                                          onClick={() => setVehicleConfigByResource((prev) => ({
                                            ...prev,
                                            [result.resourceId]: {
                                              ...cfg,
                                              allowPersonnel: !allowPersonnel,
                                            },
                                          }))}
                                          className={`flex-shrink-0 w-8 h-8 rounded overflow-hidden flex items-center justify-center transition-opacity ${allowPersonnel ? 'opacity-100' : 'opacity-40'}`}
                                        >
                                          <img src={workersIcon} alt="" className="w-full h-full object-contain invert" />
                                        </button>
                                      </Tooltip>
                                    )}
                                    {/* Emplacements véhicules : image par slot, clic ouvre picker */}
                                    {Array.from({ length: maxVehicles }, (_, slotIdx) => {
                                      const vehicleId = slots[slotIdx] ?? null;
                                      const vehicle = vehicleId ? getVehicle(vehicleId) : undefined;
                                      const isPickerOpen = vehicleSlotPickerOpen?.resourceId === result.resourceId && vehicleSlotPickerOpen?.slotIndex === slotIdx;
                                      return (
                                        <div key={slotIdx} ref={vehicleSlotPickerRef} className="relative">
                                          <Tooltip content={vehicle ? vehicle.name : t('tooltips.chooseVehicle')} placement="top">
                                          <button
                                            type="button"
                                            onClick={() => setVehicleSlotPickerOpen((o) =>
                                              o?.resourceId === result.resourceId && o?.slotIndex === slotIdx
                                                ? null
                                                : { resourceId: result.resourceId, slotIndex: slotIdx }
                                            )}
                                            className="flex-shrink-0 w-10 h-10 rounded overflow-hidden bg-gray-700 border-2 border-gray-600 hover:border-soviet-gold flex items-center justify-center transition-colors"
                                          >
                                            <img
                                              src={vehicle ? getVehicleImageSrc(vehicle) : VEHICLE_PLACEHOLDER}
                                              alt=""
                                              className={`w-full h-full object-contain p-0.5 ${!vehicle ? 'opacity-50' : ''}`}
                                            />
                                          </button>
                                          </Tooltip>
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
                                                        {ORIGIN_TO_KEY[v.origin] ? t(`origins.${ORIGIN_TO_KEY[v.origin]}`) : v.origin} · {formatVehicleSkills(v)}
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
                      {isRowExpanded && hasCoproductDetail && (result.coproductBreakdown || result.consumptionBreakdown) && (
                        <tr className="border-b border-gray-700 bg-gray-800/80">
                          <td colSpan={chainTableColCount} className="py-2 px-4 pl-12 text-sm text-gray-300">
                            <div>
                              <p className="text-gray-500 font-medium mb-1">{t('industry.coproductsByBuilding')}</p>
                              <ul className="list-disc list-inside space-y-0.5">
                                {result.coproductBreakdown?.map((entry, i) => (
                                  <li key={`co-${entry.sourceResourceId}-${entry.buildingName}-${i}`}>
                                    {t(`resources.${entry.sourceResourceId}`)} ({t(`buildings:${entry.buildingName}`)}): {productionCalculator.formatValue(entry.amountPerSecond * 24 * 60 * 60)} {t('units.m3_day')}
                                  </li>
                                ))}
                                {result.consumptionBreakdown?.map((entry, i) => {
                                  const isElec = result.resourceId === 'eletric';
                                  const amountPerDay = entry.amountPerSecond * 24 * 60 * 60;
                                  const unitKey = isElec ? 'units.MWh_day' : 'units.m3_day';
                                  return (
                                    <li key={`cons-${entry.sourceResourceId}-${entry.buildingName}-${i}`}>
                                      {t(`resources.${entry.sourceResourceId}`)} ({t(`buildings:${entry.buildingName}`)}): {isElec ? productionCalculator.formatInteger(amountPerDay) : productionCalculator.formatValue(amountPerDay)} {t(unitKey)}
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                    );
                  })}
                  
                  {/* Ligne Personnels */}
                  {(() => {
                    const personnelRowKey = 'personnel';
                    const isPersonnelExpanded = expandedChainRows.has(personnelRowKey);
                    const togglePersonnelExpanded = () => setExpandedChainRows((prev) => {
                      const next = new Set(prev);
                      if (next.has(personnelRowKey)) next.delete(personnelRowKey);
                      else next.add(personnelRowKey);
                      return next;
                    });
                    const personnelColCount = 3 + (hasAnySurplus ? 1 : 0) + ((hasAnyMine || hasAnyVehicleMine) ? 1 : 0);
                    return (
                      <Fragment key={personnelRowKey}>
                        <tr className="border-b border-gray-700 hover:bg-gray-700/50 h-[53px]">
                          <td className="py-3 px-4 align-middle">
                            <div className="flex items-center gap-2">
                              {(personnelBreakdown?.length ?? 0) > 0 && (
                                <Tooltip content={t('industry.coproductsByBuilding')} placement="right">
                                  <button
                                    type="button"
                                    onClick={togglePersonnelExpanded}
                                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-soviet-gold transition-colors"
                                    aria-expanded={isPersonnelExpanded}
                                  >
                                    <span className="text-xs">{isPersonnelExpanded ? '▼' : '▶'}</span>
                                  </button>
                                </Tooltip>
                              )}
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
                            <Tooltip content={`${formatNumber(totalWorkers)} ${t('tooltips.workersBlue')}, ${formatNumber(totalProfesors)} ${t('tooltips.workersWhite')}`} placement="top">
                              <span>{formatNumber(totalWorkers + totalProfesors)}</span>
                            </Tooltip>
                          </td>
                          <td className="py-3 px-4 text-gray-400 align-middle">
                            {/* Vide - Bâtiment */}
                          </td>
                          {(hasAnyMine || hasAnyVehicleMine) && <td className="py-3 px-4 text-gray-400 align-middle" />}
                        </tr>
                        {isPersonnelExpanded && (personnelBreakdown?.length ?? 0) > 0 && (
                          <tr className="border-b border-gray-700 bg-gray-800/80">
                            <td colSpan={personnelColCount} className="py-2 px-4 pl-12 text-sm text-gray-300">
                              <div>
                                <p className="text-gray-500 font-medium mb-1">{t('industry.coproductsByBuilding')}</p>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {(personnelBreakdown ?? []).map((entry, i) => (
                                    <li key={`personnel-${entry.sourceResourceId}-${entry.buildingName}-${i}`}>
                                      {t(`resources.${entry.sourceResourceId}`)} ({t(`buildings:${entry.buildingName}`)}): {formatNumber(entry.workers)} {t('tooltips.workersBlue')}{entry.profesors > 0 ? `, ${formatNumber(entry.profesors)} ${t('tooltips.workersWhite')}` : ''}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })()}
                  {/* Ligne sewage en fin de chaîne, après le personnel */}
                  {sewageResult && (() => {
                    const result = sewageResult;
                    const rowKey = 'sewage-Coproduct-end';
                    const hasCoproductDetail = !!(result.coproductBreakdown && result.coproductBreakdown.length > 0) || !!(result.consumptionBreakdown && result.consumptionBreakdown.length > 0);
                    const isRowExpanded = expandedChainRows.has(rowKey);
                    const toggleRowExpanded = () => setExpandedChainRows((prev) => {
                      const next = new Set(prev);
                      if (next.has(rowKey)) next.delete(rowKey);
                      else next.add(rowKey);
                      return next;
                    });
                    const amountPerDay = (result.outputsPerSecond.get('sewage') ?? 0) * (24 * 60 * 60);
                    const chainTableColCount = 3 + (hasAnySurplus ? 1 : 0) + ((hasAnyMine || hasAnyVehicleMine) ? 1 : 0);
                    return (
                      <Fragment key={rowKey}>
                        <tr className="border-b border-gray-700 hover:bg-gray-700/50 h-[53px]">
                          <td className="py-3 px-4 align-middle">
                            <div className="flex items-center gap-2">
                              {hasCoproductDetail && (
                                <Tooltip content={t('industry.coproductsByBuilding')} placement="right">
                                  <button
                                    type="button"
                                    onClick={toggleRowExpanded}
                                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-soviet-gold transition-colors"
                                    aria-expanded={isRowExpanded}
                                  >
                                    <span className="text-xs">{isRowExpanded ? '▼' : '▶'}</span>
                                  </button>
                                </Tooltip>
                              )}
                              {getResourceIcon('sewage') && (
                                <img src={getResourceIcon('sewage')} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
                              )}
                              <span className="text-gray-400">{t('resources.sewage')}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-gray-400 align-middle">
                            <span className="text-gray-500">—</span>
                          </td>
                          {hasAnySurplus && (
                            <td className="py-3 px-4 text-right font-mono text-gray-400 align-middle">
                              <Tooltip content={`${productionCalculator.formatInteger(amountPerDay * 365)} ${t('units.m3_year')}`} placement="top">
                                <span className="text-gray-400">+ {productionCalculator.formatValue(amountPerDay)} {t('units.m3')}</span>
                              </Tooltip>
                            </td>
                          )}
                          <td className="py-3 px-4 text-gray-400 align-middle" />
                          {(hasAnyMine || hasAnyVehicleMine) && <td className="py-3 px-4 text-gray-400 align-middle" />}
                        </tr>
                        {isRowExpanded && hasCoproductDetail && result.coproductBreakdown && (
                          <tr className="border-b border-gray-700 bg-gray-800/80">
                            <td colSpan={chainTableColCount} className="py-2 px-4 pl-12 text-sm text-gray-300">
                              <div>
                                <p className="text-gray-500 font-medium mb-1">{t('industry.coproductsByBuilding')}</p>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {result.coproductBreakdown.map((entry, i) => (
                                    <li key={`${entry.sourceResourceId}-${entry.buildingName}-${i}`}>
                                      {t(`resources.${entry.sourceResourceId}`)} ({t(`buildings:${entry.buildingName}`)}): {productionCalculator.formatValue(entry.amountPerSecond * 24 * 60 * 60)} {t('units.m3_day')}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })()}
                  {/* Ligne déchets mixtes (t/j) avec composition au dépliage */}
                  {wasteMixedResult && (() => {
                    const result = wasteMixedResult;
                    const rowKey = 'waste_mixed-Coproduct-end';
                    const hasCoproductDetail = !!(result.coproductBreakdown && result.coproductBreakdown.length > 0);
                    const isRowExpanded = expandedChainRows.has(rowKey);
                    const toggleRowExpanded = () => setExpandedChainRows((prev) => {
                      const next = new Set(prev);
                      if (next.has(rowKey)) next.delete(rowKey);
                      else next.add(rowKey);
                      return next;
                    });
                    const amountPerDay = (result.outputsPerSecond.get('waste_mixed') ?? 0) * (24 * 60 * 60);
                    const chainTableColCount = 3 + (hasAnySurplus ? 1 : 0) + ((hasAnyMine || hasAnyVehicleMine) ? 1 : 0);
                    const wasteCompositionLabelKey: Record<string, string> = {
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
                    return (
                      <Fragment key={rowKey}>
                        <tr className="border-b border-gray-700 hover:bg-gray-700/50 h-[53px]">
                          <td className="py-3 px-4 align-middle">
                            <div className="flex items-center gap-2">
                              {hasCoproductDetail && (
                                <Tooltip content={t('industry.coproductsByBuilding')} placement="right">
                                  <button
                                    type="button"
                                    onClick={toggleRowExpanded}
                                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-soviet-gold transition-colors"
                                    aria-expanded={isRowExpanded}
                                  >
                                    <span className="text-xs">{isRowExpanded ? '▼' : '▶'}</span>
                                  </button>
                                </Tooltip>
                              )}
                              {getResourceIcon('waste_mixed') && (
                                <img src={getResourceIcon('waste_mixed')} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
                              )}
                              <span className="text-gray-400">{t('resources.waste_mixed')}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-gray-400 align-middle">
                            <span className="text-gray-500">—</span>
                          </td>
                          {hasAnySurplus && (
                            <td className="py-3 px-4 text-right font-mono text-gray-400 align-middle">
                              <Tooltip content={`${productionCalculator.formatInteger(amountPerDay * 365)} ${t('units.t_year')}`} placement="top">
                                <span className="text-gray-400">+ {productionCalculator.formatValue(amountPerDay)} {t('units.t_day')}</span>
                              </Tooltip>
                            </td>
                          )}
                          <td className="py-3 px-4 text-gray-400 align-middle" />
                          {(hasAnyMine || hasAnyVehicleMine) && <td className="py-3 px-4 text-gray-400 align-middle" />}
                        </tr>
                        {isRowExpanded && hasCoproductDetail && result.coproductBreakdown && (() => {
                            const WORKER_WASTE_COMPOSITION_060: Record<string, number> = { bio: 0.10 / 0.60, burnable: 0.20 / 0.60, other: 0.30 / 0.60 };
                            const WORKER_WASTE_COMPOSITION_043: Record<string, number> = { bio: 0.10 / 0.43, burnable: 0.12 / 0.43, other: 0.10 / 0.43, construction: 0.11 / 0.43 };
                            type BuildingAmount = { sourceResourceId: string; buildingName: string; amountTPerDay: number };
                            const byType: Record<string, { totalTPerDay: number; byBuilding: Record<string, number>; buildingKeys: Array<{ sourceResourceId: string; buildingName: string }> }> = {};
                            const addToType = (typeKey: string, sourceResourceId: string, buildingName: string, amount: number) => {
                              if (!byType[typeKey]) {
                                byType[typeKey] = { totalTPerDay: 0, byBuilding: {}, buildingKeys: [] };
                              }
                              byType[typeKey].totalTPerDay += amount;
                              const buildingKey = `${sourceResourceId}|${buildingName}`;
                              if (byType[typeKey].byBuilding[buildingKey] == null) {
                                byType[typeKey].buildingKeys.push({ sourceResourceId, buildingName });
                              }
                              byType[typeKey].byBuilding[buildingKey] = (byType[typeKey].byBuilding[buildingKey] ?? 0) + amount;
                            };
                            let totalTPerDay = 0;
                            result.coproductBreakdown.forEach((entry) => {
                              const entryTPerDay = entry.amountPerSecond * 24 * 60 * 60;
                              totalTPerDay += entryTPerDay;
                              const recipe = productionCalculator.getRecipe(entry.sourceResourceId, entry.buildingName);
                              const workerWasteTPerDay = entry.workerWasteTPerDay ?? 0;
                              const productionMixedTPerDay = entryTPerDay - workerWasteTPerDay;
                              if (workerWasteTPerDay > 0 && recipe?.worker_waste_kg_per_day != null) {
                                const workerComp = recipe.worker_waste_kg_per_day === 0.43 ? WORKER_WASTE_COMPOSITION_043 : WORKER_WASTE_COMPOSITION_060;
                                Object.entries(workerComp).forEach(([key, frac]) => {
                                  addToType(key, entry.sourceResourceId, entry.buildingName, workerWasteTPerDay * frac);
                                });
                              }
                              const comp = recipe?.production_waste_composition;
                              if (productionMixedTPerDay > 0 && comp) {
                                const entries = Object.entries(comp).filter(([k, frac]) => k !== 'hazardous' && frac > 0);
                                const sumFrac = entries.reduce((s, [, frac]) => s + frac, 0);
                                if (sumFrac > 0) {
                                  entries.forEach(([key, frac]) => {
                                    addToType(key, entry.sourceResourceId, entry.buildingName, productionMixedTPerDay * (frac / sumFrac));
                                  });
                                }
                              }
                            });
                            const sortedTypes = Object.entries(byType).sort((a, b) => b[1].totalTPerDay - a[1].totalTPerDay);
                            return (
                              <tr className="border-b border-gray-700 bg-gray-800/80">
                                <td colSpan={chainTableColCount} className="py-2 px-4 pl-12 text-sm text-gray-300">
                                  <div>
                                    <p className="text-gray-500 font-medium mb-1">{t('industry.wasteCompositionMixed')}</p>
                                    <ul className="space-y-1.5">
                                      {sortedTypes.map(([typeKey, { totalTPerDay: typeTotal, buildingKeys, byBuilding }]) => {
                                        const iconId = wasteCompositionLabelKey[typeKey] ?? typeKey;
                                        const pct = totalTPerDay > 0 ? (typeTotal / totalTPerDay) * 100 : 0;
                                        const buildings: BuildingAmount[] = buildingKeys.map((b) => ({
                                          ...b,
                                          amountTPerDay: byBuilding[`${b.sourceResourceId}|${b.buildingName}`] ?? 0,
                                        }));
                                        return (
                                          <li key={typeKey} className="flex items-center gap-2 flex-wrap">
                                            {getResourceIcon(iconId) && (
                                              <img src={getResourceIcon(iconId)!} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                                            )}
                                            <span>
                                              {t(`resources.${iconId}`)}: {productionCalculator.formatValue(typeTotal)} {t('units.t_day')} ({pct.toFixed(1)} %)
                                            </span>
                                            <span className="text-gray-500 text-xs">
                                              {buildings.map((b, i) => (
                                                <span key={`${b.sourceResourceId}-${b.buildingName}-${i}`}>
                                                  {i > 0 && ' · '}
                                                  {t(`buildings:${b.buildingName}`)} {productionCalculator.formatValue(b.amountTPerDay)} {t('units.t_day')}
                                                </span>
                                              ))}
                                            </span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                </td>
                              </tr>
                            );
                          })()}
                      </Fragment>
                    );
                  })()}
                  {/* Ligne déchets dangereux (t/j) avec composition au dépliage */}
                  {wasteToxicResult && (() => {
                    const result = wasteToxicResult;
                    const rowKey = 'waste_toxic-Coproduct-end';
                    const hasCoproductDetail = !!(result.coproductBreakdown && result.coproductBreakdown.length > 0);
                    const isRowExpanded = expandedChainRows.has(rowKey);
                    const toggleRowExpanded = () => setExpandedChainRows((prev) => {
                      const next = new Set(prev);
                      if (next.has(rowKey)) next.delete(rowKey);
                      else next.add(rowKey);
                      return next;
                    });
                    const amountPerDay = (result.outputsPerSecond.get('waste_toxic') ?? 0) * (24 * 60 * 60);
                    const chainTableColCount = 3 + (hasAnySurplus ? 1 : 0) + ((hasAnyMine || hasAnyVehicleMine) ? 1 : 0);
                    const wasteCompositionLabelKey: Record<string, string> = {
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
                    return (
                      <Fragment key={rowKey}>
                        <tr className="border-b border-gray-700 hover:bg-gray-700/50 h-[53px]">
                          <td className="py-3 px-4 align-middle">
                            <div className="flex items-center gap-2">
                              {hasCoproductDetail && (
                                <Tooltip content={t('industry.coproductsByBuilding')} placement="right">
                                  <button
                                    type="button"
                                    onClick={toggleRowExpanded}
                                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-soviet-gold transition-colors"
                                    aria-expanded={isRowExpanded}
                                  >
                                    <span className="text-xs">{isRowExpanded ? '▼' : '▶'}</span>
                                  </button>
                                </Tooltip>
                              )}
                              {getResourceIcon('waste_toxic') && (
                                <img src={getResourceIcon('waste_toxic')} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
                              )}
                              <span className="text-gray-400">{t('resources.waste_toxic')}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-gray-400 align-middle">
                            <span className="text-gray-500">—</span>
                          </td>
                          {hasAnySurplus && (
                            <td className="py-3 px-4 text-right font-mono text-gray-400 align-middle">
                              <Tooltip content={`${productionCalculator.formatInteger(amountPerDay * 365)} ${t('units.t_year')}`} placement="top">
                                <span className="text-gray-400">+ {productionCalculator.formatValue(amountPerDay)} {t('units.t_day')}</span>
                              </Tooltip>
                            </td>
                          )}
                          <td className="py-3 px-4 text-gray-400 align-middle" />
                          {(hasAnyMine || hasAnyVehicleMine) && <td className="py-3 px-4 text-gray-400 align-middle" />}
                        </tr>
                        {isRowExpanded && hasCoproductDetail && result.coproductBreakdown && (() => {
                            const byType: Record<string, { totalTPerDay: number; buildings: Array<{ sourceResourceId: string; buildingName: string; amountTPerDay: number }> }> = {};
                            let totalTPerDay = 0;
                            result.coproductBreakdown.forEach((entry) => {
                              const entryTPerDay = entry.amountPerSecond * 24 * 60 * 60;
                              totalTPerDay += entryTPerDay;
                              const recipe = productionCalculator.getRecipe(entry.sourceResourceId, entry.buildingName);
                              const comp = recipe?.production_waste_composition;
                              const hasHazardous = recipe?.has_hazardous_waste_output === true;
                              if (!comp) return;
                              const hFrac = comp.hazardous ?? 0;
                              if (!hasHazardous || (hFrac === 0 && Object.entries(comp).every(([, f]) => f === 0))) return;
                              const coef = 0.3 * (1 - hFrac) + hFrac;
                              if (coef <= 0) return;
                              const prodWasteTPerDay = entryTPerDay / coef;
                              Object.entries(comp).filter(([, frac]) => frac > 0).forEach(([key, frac]) => {
                                const amount = key === 'hazardous' ? prodWasteTPerDay * frac : 0.3 * prodWasteTPerDay * frac;
                                if (amount <= 0) return;
                                if (!byType[key]) byType[key] = { totalTPerDay: 0, buildings: [] };
                                byType[key].totalTPerDay += amount;
                                byType[key].buildings.push({ sourceResourceId: entry.sourceResourceId, buildingName: entry.buildingName, amountTPerDay: amount });
                              });
                            });
                            const sortedTypes = Object.entries(byType).sort((a, b) => b[1].totalTPerDay - a[1].totalTPerDay);
                            return (
                              <tr className="border-b border-gray-700 bg-gray-800/80">
                                <td colSpan={chainTableColCount} className="py-2 px-4 pl-12 text-sm text-gray-300">
                                  <div>
                                    <p className="text-gray-500 font-medium mb-1">{t('industry.wasteComposition')}</p>
                                    <ul className="space-y-1.5">
                                      {sortedTypes.map(([typeKey, { totalTPerDay: typeTotal, buildings }]) => {
                                        const iconId = wasteCompositionLabelKey[typeKey] ?? typeKey;
                                        const pct = totalTPerDay > 0 ? (typeTotal / totalTPerDay) * 100 : 0;
                                        return (
                                          <li key={typeKey} className="flex items-center gap-2 flex-wrap">
                                            {getResourceIcon(iconId) && (
                                              <img src={getResourceIcon(iconId)!} alt="" className="w-5 h-5 object-contain flex-shrink-0" />
                                            )}
                                            <span>
                                              {t(`resources.${iconId}`)}: {productionCalculator.formatValue(typeTotal)} {t('units.t_day')} ({pct.toFixed(1)} %)
                                            </span>
                                            <span className="text-gray-500 text-xs">
                                              {buildings.map((b, i) => (
                                                <span key={`${b.sourceResourceId}-${b.buildingName}-${i}`}>
                                                  {i > 0 && ' · '}
                                                  {t(`buildings:${b.buildingName}`)} {productionCalculator.formatValue(b.amountTPerDay)} {t('units.t_day')}
                                                </span>
                                              ))}
                                            </span>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                </td>
                              </tr>
                            );
                          })()}
                      </Fragment>
                    );
                  })()}
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
                    onClick={() => handleLoadPlan(plan.id)}
                    className="px-2 py-1 text-xs rounded bg-gray-600 hover:bg-soviet-gold hover:text-gray-900 text-gray-200 transition-colors"
                  >
                    {t('industry.load')}
                  </button>
                  <Tooltip content={t('industry.duplicate')}>
                    <button
                      type="button"
                      onClick={() => handleDuplicatePlan(plan.id)}
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
                      onClick={() => handleDeletePlan(plan.id)}
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
    </div>
  );
}
