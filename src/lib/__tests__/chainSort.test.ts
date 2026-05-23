import { describe, it, expect } from 'vitest';
import { sortProductionChain } from '../chainSort';
import type { ProductionResult } from '@/data/types';

function mkResult(
  resourceId: string,
  buildingName: string,
  inputs: [string, number][]
): ProductionResult {
  const inputsPerSecond = new Map(inputs);
  const outputsPerSecond = new Map([[resourceId, 1]]);
  return {
    resourceId,
    resourceName: resourceId,
    buildingName,
    buildingCount: 1,
    inputsPerSecond,
    outputsPerSecond,
    totalWorkers: 0,
    totalProfessors: 0,
  };
}

describe('sortProductionChain', () => {
  it('met les produits finaux en premier, matières premières en dernier', () => {
    const rawcoal = mkResult('rawcoal', 'coal_mine', []);
    const coal = mkResult('coal', 'coal_processing', [['rawcoal', 1]]);
    const steel = mkResult('steel', 'steel_mill', [['coal', 1]]);

    const results = [rawcoal, coal, steel];
    const sorted = sortProductionChain(results);

    expect(sorted.map((r) => r.resourceId)).toEqual(['steel', 'coal', 'rawcoal']);
  });

  it('groupe les recettes qui produisent le même item', () => {
    const gravel1 = mkResult('gravel', 'gravel_processing', [['rawgravel', 1]]);
    const gravel2 = mkResult('gravel', 'gravel_processing_small', [['rawgravel', 1]]);
    const rawgravel = mkResult('rawgravel', 'gravel_mine', []);

    const results = [rawgravel, gravel1, gravel2];
    const sorted = sortProductionChain(results);

    const gravelIndices = sorted
      .map((r, i) => (r.resourceId === 'gravel' ? i : -1))
      .filter((i) => i >= 0);
    expect(gravelIndices[1] - gravelIndices[0]).toBe(1);
  });

  it('préserve toutes les lignes', () => {
    const results = [
      mkResult('a', 'a1', [['c', 1]]),
      mkResult('b', 'b1', [['c', 1]]),
      mkResult('c', 'c1', []),
    ];
    const sorted = sortProductionChain(results);
    expect(sorted.length).toBe(3);
    expect(sorted.map((r) => r.resourceId).sort()).toEqual(['a', 'b', 'c']);
  });
});
