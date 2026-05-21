import { useRef, useEffect } from 'react';
import { getPlanStateFromUrl, setPlanStateInUrl, type PlanStateSerialized } from '@/lib/planUrl';

export function useUrlSync(
  currentPlanState: PlanStateSerialized | null
): { initialPlanState: PlanStateSerialized | null } {
  // Lire l'URL une seule fois au montage (ref stable)
  const initialPlanStateRef = useRef<PlanStateSerialized | null | undefined>(undefined);
  if (initialPlanStateRef.current === undefined) {
    initialPlanStateRef.current = getPlanStateFromUrl();
  }

  // Écrire dans l'URL de manière debouncée
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setPlanStateInUrl(currentPlanState);
    }, 600);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [currentPlanState]);

  return { initialPlanState: initialPlanStateRef.current };
}
