import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber as _formatNumber } from '@/lib/format';

/**
 * Returns a formatNumber function bound to the current i18n locale.
 * Use this in all React components instead of calling formatNumber directly.
 * The returned function is memoized and only changes when the active locale changes.
 */
export function useFormatNumber(): (value: number) => string {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  return useCallback((value: number) => _formatNumber(value, locale), [locale]);
}
