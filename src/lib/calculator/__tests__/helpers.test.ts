import { describe, it, expect } from 'vitest';
import {
  clamp,
  getProductionFactor,
  getConsumptionFactor,
} from '../helpers';

describe('clamp', () => {
  it('returns min when value is below', () => expect(clamp(-5, 0, 10)).toBe(0));
  it('returns max when value is above', () => expect(clamp(15, 0, 10)).toBe(10));
  it('returns value when within range', () => expect(clamp(5, 0, 10)).toBe(5));
});

describe('getProductionFactor', () => {
  // formula: clamp(1 - (year - p1) / p2, p3, 1)
  it('returns 1 in base year', () => {
    expect(getProductionFactor(1960, { p1: 1960, p2: 10, p3: 0.5 })).toBe(1);
  });
  it('decreases after base year', () => {
    const f = getProductionFactor(1970, { p1: 1960, p2: 10, p3: 0.5 });
    expect(f).toBe(0.5); // 1 - (1970-1960)/10 = 0, clamped to p3=0.5
  });
  it('never drops below p3', () => {
    const f = getProductionFactor(2000, { p1: 1960, p2: 10, p3: 0.3 });
    expect(f).toBe(0.3);
  });
});

describe('getConsumptionFactor', () => {
  // formula: 1 + clamp((year - p1) / p2, 0, p3)
  it('returns 1 in base year', () => {
    expect(getConsumptionFactor(1960, { p1: 1960, p2: 10, p3: 0.5 })).toBe(1);
  });
  it('increases after base year', () => {
    const f = getConsumptionFactor(1970, { p1: 1960, p2: 10, p3: 0.5 });
    expect(f).toBe(1.5); // 1 + clamp(1, 0, 0.5) = 1.5
  });
  it('never exceeds 1 + p3', () => {
    const f = getConsumptionFactor(2000, { p1: 1960, p2: 10, p3: 0.5 });
    expect(f).toBe(1.5);
  });
});
