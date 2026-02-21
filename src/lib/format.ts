/**
 * Formatage des nombres via Intl.NumberFormat.
 * useGrouping: true, maximumSignificantDigits: 3
 */

const numberFormatter = new Intl.NumberFormat('fr-FR', {
  useGrouping: true,
  maximumSignificantDigits: 3,
});

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}
