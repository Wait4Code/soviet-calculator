import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CalculationInput {
  recipeId: string;
  /** Soit le nombre de bâtiments, soit la quantité d'output souhaitée */
  value: number;
  /** 'buildings' ou 'output' */
  inputType: 'buildings' | 'output';
}

export interface SavedCalculation {
  id: string;
  name: string;
  inputs: CalculationInput[];
  timestamp: number;
}

interface StoreState {
  // Calculateur d'industrie
  currentCalculation: CalculationInput[];
  setCurrentCalculation: (calc: CalculationInput[]) => void;
  addCalculationInput: (input: CalculationInput) => void;
  removeCalculationInput: (recipeId: string) => void;

  // Calculs sauvegardés
  savedCalculations: SavedCalculation[];
  saveCalculation: (name: string) => void;
  loadCalculation: (id: string) => void;
  deleteCalculation: (id: string) => void;

  // Calculateur de ville
  selectedBuildings: Record<string, number>;
  setSelectedBuildings: (buildings: Record<string, number>) => void;
  updateBuildingCount: (buildingId: string, count: number) => void;

  // Préférences
  darkMode: boolean;
  toggleDarkMode: () => void;
  
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
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // État initial
      currentCalculation: [],
      savedCalculations: [],
      selectedBuildings: {},
      darkMode: true,
      populationFactor: 3,
      sourceQuality: 50,
      defaultVehicleId: 'e-10011d',
      defaultBuildingByResource: {},
      year: 1960,

      // Actions - Calculateur d'industrie
      setCurrentCalculation: (calc) => set({ currentCalculation: calc }),

      addCalculationInput: (input) => set((state) => ({
        currentCalculation: [...state.currentCalculation, input]
      })),

      removeCalculationInput: (recipeId) => set((state) => ({
        currentCalculation: state.currentCalculation.filter(c => c.recipeId !== recipeId)
      })),

      // Actions - Calculs sauvegardés
      saveCalculation: (name) => set((state) => {
        const newCalculation: SavedCalculation = {
          id: `calc_${Date.now()}`,
          name,
          inputs: state.currentCalculation,
          timestamp: Date.now(),
        };
        return {
          savedCalculations: [...state.savedCalculations, newCalculation]
        };
      }),

      loadCalculation: (id) => {
        const calc = get().savedCalculations.find(c => c.id === id);
        if (calc) {
          set({ currentCalculation: calc.inputs });
        }
      },

      deleteCalculation: (id) => set((state) => ({
        savedCalculations: state.savedCalculations.filter(c => c.id !== id)
      })),

      // Actions - Calculateur de ville
      setSelectedBuildings: (buildings) => set({ selectedBuildings: buildings }),

      updateBuildingCount: (buildingId, count) => set((state) => ({
        selectedBuildings: {
          ...state.selectedBuildings,
          [buildingId]: count
        }
      })),

      // Actions - Préférences
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
      setSourceQuality: (quality) => set({ sourceQuality: Math.max(0, Math.min(100, quality)) }),
      setDefaultVehicleId: (vehicleId) => set({ defaultVehicleId: vehicleId }),
      setDefaultBuilding: (resourceId, buildingName) => set((state) => ({
        defaultBuildingByResource: { ...state.defaultBuildingByResource, [resourceId]: buildingName },
      })),
      setYear: (year) => set({ year: Math.round(year) }),
    }),
    {
      name: 'soviet-calculator-storage',
    }
  )
);
