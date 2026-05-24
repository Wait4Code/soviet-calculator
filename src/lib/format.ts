/**
 * Locale-aware number formatter.
 * useGrouping: true, maximumSignificantDigits: 3
 */

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(locale: string): Intl.NumberFormat {
  if (!formatterCache.has(locale)) {
    formatterCache.set(
      locale,
      new Intl.NumberFormat(locale, {
        useGrouping: true,
        maximumSignificantDigits: 3,
      })
    );
  }
  return formatterCache.get(locale)!;
}

export function formatNumber(value: number, locale: string): string {
  return getFormatter(locale).format(value);
}
