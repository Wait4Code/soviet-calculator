import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// We need to test the private readFromStorage behavior indirectly via getSavedPlans.
// We mock localStorage to inject raw data.

const RAW_PLAN_V0 = {
  id: 'abc-123',
  name: 'Test plan',
  createdAt: 1700000000000,
  // no schemaVersion — this is a v0 plan
  planState: { g: [{ resourceId: 'steel', buildingName: 'steel_mill', inputType: 'buildings', value: 1 }] },
};

describe('savedPlans migration', () => {
  beforeEach(() => {
    localStorage.setItem('soviet-calculator-saved-plans', JSON.stringify([RAW_PLAN_V0]));
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('reads v0 plans and adds schemaVersion 1', async () => {
    const { getSavedPlans } = await import('../savedPlans');
    const plans = getSavedPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0].schemaVersion).toBe(1);
    expect(plans[0].id).toBe('abc-123');
    expect(plans[0].planState.g[0].resourceId).toBe('steel');
  });

  it('accepts plans that already have schemaVersion', async () => {
    localStorage.setItem('soviet-calculator-saved-plans', JSON.stringify([
      { ...RAW_PLAN_V0, schemaVersion: 1 },
    ]));
    const { getSavedPlans } = await import('../savedPlans');
    const plans = getSavedPlans();
    expect(plans[0].schemaVersion).toBe(1);
  });

  it('drops plans with missing required fields', async () => {
    localStorage.setItem('soviet-calculator-saved-plans', JSON.stringify([
      { id: 'bad' }, // missing name, createdAt, planState
    ]));
    const { getSavedPlans } = await import('../savedPlans');
    const plans = getSavedPlans();
    expect(plans).toHaveLength(0);
  });

  it('savePlan writes schemaVersion 1', async () => {
    localStorage.clear();
    const { savePlan, getSavedPlans } = await import('../savedPlans');
    savePlan('my plan', { g: [] });
    const plans = getSavedPlans();
    expect(plans[0].schemaVersion).toBe(1);
  });
});
