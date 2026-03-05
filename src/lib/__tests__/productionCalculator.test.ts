import { describe, it, expect } from 'vitest';
import { ProductionCalculator } from '../productionCalculator';
import { ProductionResult } from '@/data/types';

const calc = new ProductionCalculator();

function getResult(results: ProductionResult[], resourceId: string, buildingName: string): ProductionResult | undefined {
  return results.find((r) => r.resourceId === resourceId && r.buildingName === buildingName);
}

function outputPerDay(result: { outputsPerSecond: Map<string, number> } | undefined, resourceId: string): number {
  if (!result) return 0;
  const perSec = result.outputsPerSecond.get(resourceId) ?? 0;
  return perSec * 24 * 60 * 60;
}

describe('ProductionCalculator', () => {
  describe('Chaîne acier (1 aciérie)', () => {
    it('calcule correctement les bâtiments et productions', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'steel',
        buildingName: 'steel_mill_v2',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(),
        sourceQuality: 50,
        defaultVehicleId: 'e-10011d',
      });
      const results = calc.aggregateResults(chain);

      // Aciérie : 0.086 * 500 = 43 t/j acier
      const steel = getResult(results, 'steel', 'steel_mill_v2');
      expect(steel).toBeDefined();
      expect(steel!.buildingCount).toBe(1);
      expect(outputPerDay(steel, 'steel')).toBeCloseTo(43, 0);

      // Mines de charbon : 4.2 * 220 * 0.5 = 462 t/j. Besoin ~840 rawcoal → 2 bâtiments
      const coalMine = getResult(results, 'rawcoal', 'coal_mine');
      expect(coalMine).toBeDefined();
      expect(coalMine!.buildingCount).toBe(2);

      // Mines de fer : 4.0 * 250 * 0.5 = 500 t/j. Besoin ~450 rawiron → 1 bâtiment
      const ironMine = getResult(results, 'rawiron', 'iron_mine');
      expect(ironMine).toBeDefined();
      expect(ironMine!.buildingCount).toBe(1);

      // Usine charbon : 8 * 30 = 240 t/j. Besoin 375 coal → 2 bâtiments
      const coalProc = getResult(results, 'coal', 'coal_processing');
      expect(coalProc).toBeDefined();
      expect(coalProc!.buildingCount).toBe(2);

      // Usine fer : 7 * 15 = 105 t/j. Besoin 200 iron → 2 bâtiments
      const ironProc = getResult(results, 'iron', 'iron_processing');
      expect(ironProc).toBeDefined();
      expect(ironProc!.buildingCount).toBe(2);

      // Mines : pas de personnel ni ratio de charge
      expect(coalMine!.buildingCount).toBe(2);
      expect(coalMine!.totalWorkers).toBeCloseTo(313);
      expect(coalMine!.chargeRatio).toBeCloseTo(0.7102, 2);

      expect(ironMine!.buildingCount).toBe(1);
      expect(ironMine!.totalWorkers).toBeCloseTo(215);
      expect(ironMine!.chargeRatio).toBeCloseTo(0.8571, 2);
    });
  });

  describe('Mine de charbon (656 t/j, qualité 50%)', () => {
    it('requiert 2 bâtiments (4.2 × 220 × 0.5 = 462 t/j par bâtiment)', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'rawcoal',
        buildingName: 'coal_mine',
        inputType: 'output_per_day',
        value: 656,
        disabledResources: new Set(),
        sourceQuality: 50,
      });
      const results = calc.aggregateResults(chain);

      const coalMine = getResult(results, 'rawcoal', 'coal_mine');
      expect(coalMine).toBeDefined();
      expect(coalMine!.buildingCount).toBe(2);
      expect(outputPerDay(coalMine, 'rawcoal')).toBeGreaterThanOrEqual(656);
    });
  });

  describe('Mine de pétrole (3.9 t/j, qualité 50%)', () => {
    it('requiert 2 bâtiments (7 × 0.5 = 3.5 t/j par bâtiment)', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'oil',
        buildingName: 'oil_mine',
        inputType: 'output_per_day',
        value: 3.9,
        disabledResources: new Set(),
        sourceQuality: 50,
      });
      const results = calc.aggregateResults(chain);

      const oilMine = getResult(results, 'oil', 'oil_mine');
      expect(oilMine).toBeDefined();
      expect(oilMine!.buildingCount).toBe(2);
      expect(outputPerDay(oilMine, 'oil')).toBeGreaterThanOrEqual(3.9);
    });
  });

  describe('Recette simple (distillerie)', () => {
    it('1 bâtiment produit correctement', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'alcohol',
        buildingName: 'distillery',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(),
        sourceQuality: 50,
      });
      const results = calc.aggregateResults(chain);

      const distillery = getResult(results, 'alcohol', 'distillery');
      expect(distillery).toBeDefined();
      expect(distillery!.buildingCount).toBe(1);
      expect(distillery!.totalWorkers).toBe(100);
      expect(outputPerDay(distillery, 'alcohol')).toBeCloseTo(0.06 * 100, 0);
    });
  });

  describe('Chaîne alumine', () => {
    it('calcule correctement les mines (pétrole, bauxite, gravier)', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'alumina',
        buildingName: 'alumina_plant',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(),
        sourceQuality: 50,
        defaultVehicleId: 'e-10011d',
      });
      const results = calc.aggregateResults(chain);

      const alumina = getResult(results, 'alumina', 'alumina_plant');
      expect(alumina).toBeDefined();
      expect(alumina!.buildingCount).toBe(1);

      // Vérifier que les mines en amont sont présentes
      const oilMine = getResult(results, 'oil', 'oil_mine');
      const bauxiteProc = getResult(results, 'bauxite', 'bauxite_processing');
      expect(oilMine || bauxiteProc).toBeDefined();
    });
  });

  describe('Carrière gravier avec surcharge charge (personnel ou pelleteuses)', () => {
    it('rawgravel personnel uniquement à 100% : production > consommation', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'gravel',
        buildingName: 'gravel_processing',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(),
        sourceQuality: 50,
        defaultBuildingByResource: { rawgravel: 'gravel_mine_small' },
        vehicleConfigByResource: {
          rawgravel: { vehicleSlots: [null], allowPersonnel: true },
        },
        chargeRatioByResource: { rawgravel: 1 },
      });
      const results = calc.aggregateResults(chain);
      const rawGravel = getResult(results, 'rawgravel', 'gravel_mine_small');
      expect(rawGravel).toBeDefined();
      expect(rawGravel!.invalidConfig).toBeFalsy();
      const prod = outputPerDay(rawGravel!, 'rawgravel');
      expect(prod).toBeCloseTo(140);
    });

    it('rawgravel pelleteuses uniquement : pas de personnel, production pleine capacité, surplus', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'gravel',
        buildingName: 'gravel_processing',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(),
        sourceQuality: 50,
        defaultBuildingByResource: { rawgravel: 'gravel_mine_small' },
        vehicleConfigByResource: {
          rawgravel: { vehicleSlots: ['e-10011d'], allowPersonnel: false },
        },
      });
      const results = calc.aggregateResults(chain);
      const rawGravel = getResult(results, 'rawgravel', 'gravel_mine_small');
      expect(rawGravel).toBeDefined();
      expect(rawGravel!.totalWorkers).toBe(0);
      const prod = outputPerDay(rawGravel!, 'rawgravel');
      expect(prod).toBeCloseTo(173.25);
      const surplus = calc.computeSurplusByResource(results);
      expect((surplus.get('rawgravel') ?? 0) * 86400).toBeCloseTo(53.25);
    });
  });

  describe('Chaîne aluminium + carrière pierre (personnel, surplus)', () => {
    const baseConfig = {
      resourceId: 'aluminium' as const,
      buildingName: 'aluminium_plant' as const,
      inputType: 'buildings' as const,
      value: 1,
      disabledResources: new Set<string>(),
      sourceQuality: 50,
      defaultVehicleId: 'e-10011d' as const,
      defaultBuildingByResource: { rawgravel: 'gravel_mine_big' as const },
      vehicleConfigByResource: {
        rawgravel: {
          vehicleSlots: ['e-10011d', 'e-10011d', 'e-10011d'],
          allowPersonnel: true,
        },
      },
    };

    it('charge 0% : surplus affiché (véhicules produisent plus que la demande)', () => {
      const chain = calc.calculateProductionChain(baseConfig);
      const results = calc.aggregateResults(chain);
      const rawGravel = getResult(results, 'rawgravel', 'gravel_mine_big');
      expect(rawGravel).toBeDefined();
      expect(rawGravel!.chargeRatio).toBe(0);
      expect(rawGravel!.totalWorkers).toBe(0);
      const prod = outputPerDay(rawGravel!, 'rawgravel');
      expect(prod).toBeCloseTo(173.25);
      const surplus = calc.computeSurplusByResource(results);
      const rawGravelSurplus = (surplus.get('rawgravel') ?? 0) * 86400;
      expect(rawGravelSurplus).toBeCloseTo(164.7123);
    });

    it('charge 100% : surplus affiché (production max > demande)', () => {
      const chain = calc.calculateProductionChain({
        ...baseConfig,
        chargeRatioByResource: { rawgravel: 1 },
      });
      const results = calc.aggregateResults(chain);
      const rawGravel = getResult(results, 'rawgravel', 'gravel_mine_big');
      expect(rawGravel).toBeDefined();
      expect(rawGravel!.chargeRatio).toBe(1);
      const prod = outputPerDay(rawGravel!, 'rawgravel');
      expect(prod).toBeCloseTo(348.25);
      const surplus = calc.computeSurplusByResource(results);
      const rawGravelSurplus = (surplus.get('rawgravel') ?? 0) * 86400;
      expect(rawGravelSurplus).toBeCloseTo(339.7123);
    });
  });

  describe('Carrière gravier sans véhicules ni personnel (config invalide)', () => {
    it('retourne invalidConfig et 0 production', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'gravel',
        buildingName: 'gravel_processing',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(),
        sourceQuality: 50,
        vehicleConfigByResource: {
          rawgravel: {
            vehicleSlots: [null],
            allowPersonnel: false,
          },
        },
      });
      const rawGravel = chain.find((r) => r.resourceId === 'rawgravel');
      expect(rawGravel).toBeDefined();
      expect(rawGravel!.invalidConfig).toBe(true);
      expect(rawGravel!.buildingCount).toBe(0);
      expect(outputPerDay(rawGravel!, 'rawgravel')).toBe(0);
    });
  });

  describe('Surcharge taux de charge (chargeRatioByResource)', () => {
    it('calculateRequirementsForBuildings coal 2 bât × 100% = 480 t/j', () => {
      const recipe = calc.getRecipe('coal', 'coal_processing')!;
      const result = (calc as any).calculateRequirementsForBuildings(
        'coal',
        recipe,
        2,
        60,
        30,
        1,
        1,
        undefined,
        1960
      );
      expect(outputPerDay(result, 'coal')).toBeCloseTo(480, 0);
    });

    it('coal 375 t/j avec override 100% : produit 480 t/j', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'coal',
        buildingName: 'coal_processing',
        inputType: 'output_per_day',
        value: 375,
        disabledResources: new Set(),
        sourceQuality: 50,
        chargeRatioByResource: { coal: 1 },
      });
      const coalRaw = chain.find((r) => r.resourceId === 'coal' && r.buildingName === 'coal_processing');
      expect(coalRaw).toBeDefined();
      // 375 t/j nécessite 2 bâtiments à 78%. Override 100% → 2×240 = 480 t/j
      expect(coalRaw!.buildingCount).toBe(2);
      expect(coalRaw!.chargeRatio).toBeCloseTo(1, 2);
      expect(outputPerDay(coalRaw!, 'coal')).toBeCloseTo(480, 0);

      const results = calc.aggregateResults(chain);
      const coalProc = getResult(results, 'coal', 'coal_processing');
      expect(coalProc).toBeDefined();
      expect(outputPerDay(coalProc, 'coal')).toBeCloseTo(480, 0);
    });

    it('chaîne acier avec charbon à 100% : coal_processing produit 480 t/j', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'steel',
        buildingName: 'steel_mill_v2',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(),
        sourceQuality: 50,
        chargeRatioByResource: { coal: 1 },
      });
      const results = calc.aggregateResults(chain);
      const coalProc = getResult(results, 'coal', 'coal_processing');
      expect(coalProc).toBeDefined();
      expect(coalProc!.buildingCount).toBe(2);
      expect(outputPerDay(coalProc, 'coal')).toBeCloseTo(480, 0);
      expect(coalProc!.chargeRatio).toBeCloseTo(1, 2);
    });
  });

  describe('Qualité source par ressource', () => {
    it('applique la surcharge locale de qualité', () => {
      // Avec 80% qualité sur rawcoal, production = 4.2 * 220 * 0.8 = 739.2 t/j par bâtiment
      // Pour 656 t/j : 1 bâtiment suffit
      const chain = calc.calculateProductionChain({
        resourceId: 'rawcoal',
        buildingName: 'coal_mine',
        inputType: 'output_per_day',
        value: 656,
        disabledResources: new Set(),
        sourceQuality: 50,
        sourceQualityByResource: { rawcoal: 80 },
      });
      const results = calc.aggregateResults(chain);

      const coalMine = getResult(results, 'rawcoal', 'coal_mine');
      expect(coalMine).toBeDefined();
      expect(coalMine!.buildingCount).toBe(1);
    });
  });

  describe('Ressource désactivée', () => {
    it('marque la ressource en import sans calculer en amont', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'steel',
        buildingName: 'steel_mill_v2',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(['coal']),
        sourceQuality: 50,
      });
      const results = calc.aggregateResults(chain);

      const coalImport = results.find((r) => r.resourceId === 'coal' && r.buildingName === 'Import');
      expect(coalImport).toBeDefined();
      expect(coalImport!.disabled).toBe(true);

      const coalMine = getResult(results, 'rawcoal', 'coal_mine');
      expect(coalMine).toBeUndefined();
    });
  });

  describe('Facteur année (composants/appareils électroniques)', () => {
    it('eletronic_factory 1970: output 4.09 t/j, plastics 2.48 t/j quand ecomponents désactivé', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'eletronics',
        buildingName: 'eletronic_factory',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(['ecomponents', 'plastics', 'mcomponents']),
        year: 1970,
      });
      const results = calc.aggregateResults(chain);
      const el = results.find((r) => r.resourceId === 'eletronics');
      const plasticsImport = results.find((r) => r.resourceId === 'plastics' && r.buildingName === 'Import');
      expect(el).toBeDefined();
      const outputPerDay = (el!.outputsPerSecond.get('eletronics') ?? 0) * 86400;
      expect(outputPerDay).toBeCloseTo(4.09, 1);
      expect(plasticsImport).toBeDefined();
      const plasticsPerDay = (plasticsImport!.outputsPerSecond.get('plastics') ?? 0) * 86400;
      expect(plasticsPerDay).toBeCloseTo(2.48, 1);
    });
    it('plastique pour eletronic_factory en 1970 = 2.48 t/j', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'eletronics',
        buildingName: 'eletronic_factory',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(['ecomponents', 'plastics', 'mcomponents']),
        year: 1970,
      });
      const results = calc.aggregateResults(chain);
      const plasticsImport = results.find((r) => r.resourceId === 'plastics' && r.buildingName === 'Import');
      expect(plasticsImport).toBeDefined();
      const plasticsPerDay = (plasticsImport!.outputsPerSecond.get('plastics') ?? 0) * 86400;
      expect(plasticsPerDay).toBeCloseTo(2.48, 1);
    });
    it('applique production decrease et consumption increase selon l\'année', () => {
      // À 1960 : production et consommation de base
      const chain1960 = calc.calculateProductionChain({
        resourceId: 'ecomponents',
        buildingName: 'eletronic_components_factory',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(),
        year: 1960,
      });
      const results1960 = calc.aggregateResults(chain1960);
      const comp1960 = getResult(results1960, 'ecomponents', 'eletronic_components_factory');
      expect(comp1960).toBeDefined();
      const output1960 = outputPerDay(comp1960, 'ecomponents');

      // À 2040 : production plus faible, consommation plus élevée
      const chain2040 = calc.calculateProductionChain({
        resourceId: 'ecomponents',
        buildingName: 'eletronic_components_factory',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(),
        year: 2040,
      });
      const results2040 = calc.aggregateResults(chain2040);
      const comp2040 = getResult(results2040, 'ecomponents', 'eletronic_components_factory');
      expect(comp2040).toBeDefined();
      const output2040 = outputPerDay(comp2040, 'ecomponents');

      expect(output2040).toBeLessThan(output1960);
    });
  });

  describe('Désactivation des ressources', () => {
    it('plastique diminue quand ecomponents est désactivé (importé)', () => {
      const fullChain = calc.calculateProductionChain({
        resourceId: 'eletronics',
        buildingName: 'eletronic_factory',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(),
        year: 1970,
      });
      const fullAggregated = calc.aggregateResults(fullChain);
      const plasticsFull = fullAggregated.reduce(
        (sum, r) => sum + (r.inputsPerSecond.get('plastics') ?? 0) * 86400,
        0
      );
      const chainDisabled = calc.calculateProductionChain({
        resourceId: 'eletronics',
        buildingName: 'eletronic_factory',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(['ecomponents']),
        year: 1970,
      });
      const aggDisabled = calc.aggregateResults(chainDisabled);
      const plasticsDisabled = aggDisabled.reduce(
        (sum, r) => sum + (r.inputsPerSecond.get('plastics') ?? 0) * 86400,
        0
      );
      expect(plasticsFull).toBeGreaterThan(plasticsDisabled);
      expect(plasticsDisabled).toBeCloseTo(2.48, 1);
    });
    it('retire chemicals, oil, steel quand ecomponents, plastics, mcomponents sont désactivés', () => {
      const fullChainResults = calc.calculateProductionChain({
        resourceId: 'eletronics',
        buildingName: 'eletronic_factory',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(),
        year: 1960,
      });
      const fullAggregated = calc.aggregateResults(fullChainResults);
      const resourcesToRemove = calc.findDependentResources(
        new Set(['ecomponents', 'plastics', 'mcomponents']),
        fullAggregated
      );
      expect(resourcesToRemove.has('chemicals')).toBe(true);
      expect(resourcesToRemove.has('oil')).toBe(true);
      expect(resourcesToRemove.has('steel')).toBe(true);
    });
  });

  describe('Fuel 1 building', () => {
    it('affiche 1 raffinerie à 100% (pas 2 à 50%)', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'fuel',
        buildingName: 'oil_rafinery_v2',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(),
        sourceQuality: 50,
        defaultVehicleId: 'e-10011d',
      });
      const results = calc.aggregateResults(chain);
      const fuel = getResult(results, 'fuel', 'oil_rafinery_v2');
      expect(fuel).toBeDefined();
      expect(fuel!.buildingCount).toBe(1);
      expect(fuel!.chargeRatio).toBeCloseTo(1, 2);
    });
  });

  describe('Bâtiment par défaut', () => {
    it('utilise defaultBuildingByResource pour les ressources à plusieurs recettes', () => {
      const chain = calc.calculateProductionChain({
        resourceId: 'alumina',
        buildingName: 'alumina_plant',
        inputType: 'buildings',
        value: 1,
        disabledResources: new Set(),
        sourceQuality: 50,
        defaultVehicleId: 'e-10011d',
        defaultBuildingByResource: { rawgravel: 'gravel_mine_small' },
      });
      const results = calc.aggregateResults(chain);

      const gravelSmall = getResult(results, 'rawgravel', 'gravel_mine_small');
      const gravelBig = getResult(results, 'rawgravel', 'gravel_mine_big');
      expect(gravelSmall).toBeDefined();
      expect(gravelBig).toBeUndefined();
    });
  });
});
