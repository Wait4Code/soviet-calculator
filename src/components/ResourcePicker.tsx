import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getResourceIcon } from '@/data/resourceIcons';
import type { ResourceProduction } from '@/data/types';

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

  const selectedIcon = getResourceIcon(selectedResourceId);
  const selectedName = t(`resources.${selectedResourceId}`);

  return (
    <div ref={pickerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex-shrink-0 rounded overflow-hidden bg-gray-700 border-2 border-gray-600 hover:border-soviet-gold transition-colors"
        style={{ width: size, height: size }}
        title={selectedName}
      >
        {selectedIcon ? (
          <img src={selectedIcon} alt="" className="w-full h-full object-contain p-1" />
        ) : (
          <span className="text-xs text-gray-500 flex items-center justify-center h-full">?</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 max-h-72 overflow-y-auto rounded-lg bg-gray-800 border border-gray-600 shadow-xl py-2">
          {productions.map((production) => (
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
        </div>
      )}
    </div>
  );
}
