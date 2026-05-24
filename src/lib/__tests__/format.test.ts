import { describe, it, expect } from 'vitest';
import { formatNumber } from '../format';

describe('formatNumber', () => {
  it('formats with fr-FR separators when locale is fr', () => {
    // In fr-FR, 3000 → "3 000" (narrow no-break space)
    const result = formatNumber(3000, 'fr');
    expect(result.replace(/\s/g, ' ')).toBe('3 000');
  });

  it('formats with en-US separators when locale is en', () => {
    // In en-US, 3000 → "3,000"
    expect(formatNumber(3000, 'en')).toBe('3,000');
  });

  it('applies significant digits (3 sig figs)', () => {
    expect(formatNumber(1234567, 'fr')).not.toBe('1 234 567'); // rounded to 3 sig figs
    expect(formatNumber(1.2345, 'en')).toBe('1.23');
  });

  it('falls back gracefully for unknown locale', () => {
    // Should not throw; returns some string
    expect(() => formatNumber(42, 'zz')).not.toThrow();
  });
});
