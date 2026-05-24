import { describe, it, expect } from 'vitest';
import { getBlocForOrigin } from '../vehicleOrigins';

describe('getBlocForOrigin', () => {
  it('returns east for Soviet Union', () => {
    expect(getBlocForOrigin('Union soviétique')).toBe('east');
  });
  it('returns east for Czechoslovakia', () => {
    expect(getBlocForOrigin('Tchécoslovaquie')).toBe('east');
  });
  it('returns west for unknown origin', () => {
    expect(getBlocForOrigin('USA')).toBe('west');
  });
  it('returns west for empty string', () => {
    expect(getBlocForOrigin('')).toBe('west');
  });
});
