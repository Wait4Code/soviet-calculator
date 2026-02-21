/**
 * Sauvegarde / chargement de la planification dans l'URL pour partage.
 * Format compact (clés courtes) encodé en base64url.
 */

export interface ProductionGoalSerialized {
  resourceId: string;
  buildingName: string;
  inputType: 'buildings' | 'output_per_day' | 'output_per_year';
  value: number;
}

export interface VehicleConfigSerialized {
  vehicleSlots: (string | null)[];
  allowPersonnel: boolean;
}

export interface PlanStateSerialized {
  v?: number;
  g: ProductionGoalSerialized[];
  y?: number;
  sq?: number;
  sqr?: Record<string, number>;
  br?: Record<string, string>;
  vc?: Record<string, VehicleConfigSerialized>;
  cr?: Record<string, number>;
  d?: string[];
}

const PARAM = 'plan';
const VERSION = 1;

function base64UrlEncode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = str.length % 4;
  if (pad) str += '===='.slice(0, 4 - pad);
  try {
    return decodeURIComponent(escape(atob(str)));
  } catch {
    return '';
  }
}

/**
 * Encode l'état de planification en chaîne pour l'URL.
 */
export function encodePlanState(state: PlanStateSerialized): string {
  const payload: PlanStateSerialized = {
    v: VERSION,
    g: state.g,
    ...(state.y != null && state.y !== 1960 && { y: state.y }),
    ...(state.sq != null && { sq: state.sq }),
    ...(state.sqr != null && Object.keys(state.sqr).length > 0 && { sqr: state.sqr }),
    ...(state.br != null && Object.keys(state.br).length > 0 && { br: state.br }),
    ...(state.vc != null && Object.keys(state.vc).length > 0 && { vc: state.vc }),
    ...(state.cr != null && Object.keys(state.cr).length > 0 && { cr: state.cr }),
    ...(state.d != null && state.d.length > 0 && { d: state.d }),
  };
  return base64UrlEncode(JSON.stringify(payload));
}

/**
 * Décode une chaîne d'URL en état de planification, ou null si invalide.
 */
export function decodePlanState(encoded: string): PlanStateSerialized | null {
  if (!encoded || typeof encoded !== 'string') return null;
  try {
    const json = base64UrlDecode(encoded);
    if (!json) return null;
    const data = JSON.parse(json) as PlanStateSerialized;
    if (!data || !Array.isArray(data.g)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Lit l'état depuis l'URL (search params).
 */
export function getPlanStateFromUrl(): PlanStateSerialized | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const plan = params.get(PARAM);
  return plan ? decodePlanState(plan) : null;
}

/**
 * Met à jour l'URL avec l'état (sans recharger la page).
 */
export function setPlanStateInUrl(state: PlanStateSerialized | null): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (state == null || (state.g.length === 0)) {
    url.searchParams.delete(PARAM);
  } else {
    url.searchParams.set(PARAM, encodePlanState(state));
  }
  const newUrl = url.pathname + url.search + url.hash;
  window.history.replaceState(null, '', newUrl);
}
