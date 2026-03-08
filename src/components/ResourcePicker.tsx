import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getResourceIcon } from '@/data/resourceIcons';
import type { ResourceProduction } from '@/data/types';
import { Tooltip } from '@/components/Tooltip';

interface ResourcePickerProps {
  productions: ResourceProduction[];
  selectedResourceId: string;
  onSelect: (resourceId: string) => void;
  size?: number;
}

export function ResourcePicker({
  productions,
  selectedResourceId,
  onSelect,
  size = 40,
}: ResourcePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  const selectedIcon = getResourceIcon(selectedResourceId);
  const selectedName = t(`resources.${selectedResourceId}`);

  const filteredProductions = productions.filter((production) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const name = t(`resources.${production.resourceId}`).toLowerCase();
    const id = production.resourceId.toLowerCase();
    return name.includes(q) || id.includes(q);
  });

  return (
    <div ref={pickerRef} className="relative inline-block">
      <Tooltip content={selectedName}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex-shrink-0 rounded overflow-hidden bg-gray-700 border-2 border-gray-600 hover:border-soviet-gold transition-colors"
        style={{ width: size, height: size }}
      >
        {selectedIcon ? (
          <img src={selectedIcon} alt="" className="w-full h-full object-contain p-1" />
        ) : (
          <span className="text-xs text-gray-500 flex items-center justify-center h-full">?</span>
        )}
      </button>
      </Tooltip>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 max-h-72 overflow-hidden rounded-lg bg-gray-800 border border-gray-600 shadow-xl flex flex-col">
          <div className="p-2 border-b border-gray-600 flex-shrink-0">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('industry.searchResource')}
              className="w-full px-3 py-2 rounded bg-gray-700 border border-gray-600 text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-soviet-gold focus:border-soviet-gold"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto py-2 flex-1 min-h-0 max-h-56">
          {filteredProductions.map((production) => (
            <button
              key={production.resourceId}
              type="button"
              onClick={() => {
                onSelect(production.resourceId);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-700 transition-colors ${
                production.resourceId === selectedResourceId ? 'bg-gray-700/80' : ''
              }`}
            >
              <div className="flex-shrink-0 w-8 h-8 rounded overflow-hidden bg-gray-700 flex items-center justify-center">
                {getResourceIcon(production.resourceId) ? (
                  <img
                    src={getResourceIcon(production.resourceId)!}
                    alt=""
                    className="w-full h-full object-contain p-0.5"
                  />
                ) : (
                  <span className="text-xs text-gray-500">?</span>
                )}
              </div>
              <span className="font-medium text-white truncate text-sm">{t(`resources.${production.resourceId}`)}</span>
            </button>
          ))}
          {filteredProductions.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-400">{t('industry.noResourceMatch')}</p>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
