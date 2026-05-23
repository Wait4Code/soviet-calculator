import { describe, it, expect } from 'vitest';
import { resolveChain } from '../chainResolver';

describe('resolveChain', () => {
  it('resolves a single steel goal', () => {
    const results = resolveChain([
      { resourceId: 'steel', buildingName: 'steel_mill_v2', inputType: 'buildings', value: 1 },
    ], {
      disabledResources: new Set(),
      sourceQuality: 50,
      year: 1960,
    });
    expect(results.some((r) => r.resourceId === 'steel')).toBe(true);
    // steel requires coal and iron ore as upstream inputs
    expect(results.length).toBeGreaterThan(1);
  });

  it('returns empty array for empty goals', () => {
    const results = resolveChain([], { disabledResources: new Set(), sourceQuality: 50, year: 1960 });
    expect(results).toHaveLength(0);
  });

  it('does not expand disabled resources', () => {
    // coal is consumed by steel_mill_v2 and is not a base resource
    // when disabled, it should appear as disabled (not expanded into rawcoal etc.)
    const results = resolveChain([
      { resourceId: 'steel', buildingName: 'steel_mill_v2', inputType: 'buildings', value: 1 },
    ], {
      disabledResources: new Set(['coal']),
      sourceQuality: 50,
      year: 1960,
    });
    const coalResult = results.find((r) => r.resourceId === 'coal');
    // coal should appear as disabled (not expanded)
    if (coalResult) {
      expect(coalResult.disabled).toBe(true);
    }
    // rawcoal should not appear since coal (its consumer) is disabled
    const rawcoalResult = results.find((r) => r.resourceId === 'rawcoal');
    expect(rawcoalResult).toBeUndefined();
  });
});
