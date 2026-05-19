import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PollutionDistanceMode } from '@/data/pollutionByBuilding';

interface StoreState {
  // Qualité de source pour les mines (0-100%, défaut 50%)
  sourceQuality: number;
  setSourceQuality: (quality: number) => void;

  // Véhicule par défaut pour les carrières (ID du véhicule)
  defaultVehicleId: string;
  setDefaultVehicleId: (vehicleId: string) => void;

  // Bâtiment par défaut par ressource (resourceId -> buildingName) pour les ressources à plusieurs recettes
  defaultBuildingByResource: Record<string, string>;
  setDefaultBuilding: (resourceId: string, buildingName: string) => void;

  // Année par défaut (affecte composants électroniques et appareils électroniques)
  year: number;
  setYear: (year: number) => void;

  // Mode d'affichage des distances de sécurité pollution (de optimiste à pessimiste)
  pollutionDistanceMode: PollutionDistanceMode;
  setPollutionDistanceMode: (mode: PollutionDistanceMode) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      sourceQuality: 50,
      defaultVehicleId: 'e-10011d',
      defaultBuildingByResource: {},
      year: 1960,
      pollutionDistanceMode: 'q80_min',

      setSourceQuality: (quality) => set({ sourceQuality: Math.max(0, Math.min(100, quality)) }),
      setDefaultVehicleId: (vehicleId) => set({ defaultVehicleId: vehicleId }),
      setDefaultBuilding: (resourceId, buildingName) => set((state) => ({
        defaultBuildingByResource: { ...state.defaultBuildingByResource, [resourceId]: buildingName },
      })),
      setYear: (year) => set({ year: Math.round(year) }),
      setPollutionDistanceMode: (mode) => set({ pollutionDistanceMode: mode }),
    }),
    {
      name: 'soviet-calculator-storage',
    }
  )
);
