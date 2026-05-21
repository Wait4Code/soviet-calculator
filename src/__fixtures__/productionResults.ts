import type { ProductionResult } from '@/data/types';
import type { ProductionGoal } from '@/data/types';

/**
 * Une chaîne acier simple : aciérie + mines charbon + mines fer + usines de traitement.
 * Extrait des valeurs réelles du calculateur (1 aciérie steel_mill_v2).
 */
export const STEEL_CHAIN_RESULTS: ProductionResult[] = [
  {
    resourceId: 'steel',
    resourceName: 'Acier',
    buildingName: 'steel_mill_v2',
    buildingCount: 1,
    inputsPerSecond: new Map([
      ['coal', 0.00875],
      ['iron', 0.00694],
    ]),
    outputsPerSecond: new Map([['steel', 0.000497]]),
    totalWorkers: 200,
    totalProfesors: 0,
    workersPerBuilding: 200,
    maxWorkersPerBuilding: 200,
    profesorsPerBuilding: 0,
    maxProfesorsPerBuilding: 0,
    chargeRatio: 1.0,
  },
  {
    resourceId: 'coal',
    resourceName: 'Charbon',
    buildingName: 'coal_processing',
    buildingCount: 2,
    inputsPerSecond: new Map([['rawcoal', 0.01667]]),
    outputsPerSecond: new Map([['coal', 0.00875]]),
    totalWorkers: 60,
    totalProfesors: 0,
    workersPerBuilding: 30,
    maxWorkersPerBuilding: 30,
    profesorsPerBuilding: 0,
    maxProfesorsPerBuilding: 0,
    chargeRatio: 0.729,
  },
  {
    resourceId: 'iron',
    resourceName: 'Fer',
    buildingName: 'iron_processing',
    buildingCount: 2,
    inputsPerSecond: new Map([['rawiron', 0.01389]]),
    outputsPerSecond: new Map([['iron', 0.00694]]),
    totalWorkers: 30,
    totalProfesors: 0,
    workersPerBuilding: 15,
    maxWorkersPerBuilding: 15,
    profesorsPerBuilding: 0,
    maxProfesorsPerBuilding: 0,
    chargeRatio: 0.926,
  },
];

export const STEEL_GOAL: ProductionGoal = {
  id: 'test-goal-1',
  resourceId: 'steel',
  buildingName: 'steel_mill_v2',
  inputType: 'buildings',
  value: 1,
};

export const SAVED_PLAN_STATE = {
  v: 1,
  g: [{ resourceId: 'steel', buildingName: 'steel_mill_v2', inputType: 'buildings' as const, value: 1 }],
  y: 1960,
};
