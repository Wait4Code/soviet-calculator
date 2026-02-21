import { ProductionResult } from '@/data/types';

/** Clé d'une recette : resourceId + buildingName */
function recipeKey(r: ProductionResult): string {
  return `${r.resourceId}:${r.buildingName}`;
}

/** Union-Find pour grouper les recettes */
class UnionFind {
  private parent = new Map<string, string>();

  constructor(keys: string[]) {
    keys.forEach((k) => this.parent.set(k, k));
  }

  find(k: string): string {
    const p = this.parent.get(k)!;
    if (p !== k) {
      this.parent.set(k, this.find(p));
    }
    return this.parent.get(k)!;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }

  /** Retourne les ensembles par représentant */
  getGroups(): Map<string, Set<string>> {
    const groups = new Map<string, Set<string>>();
    this.parent.forEach((_, k) => {
      const r = this.find(k);
      if (!groups.has(r)) groups.set(r, new Set());
      groups.get(r)!.add(k);
    });
    return groups;
  }
}

/**
 * Trie les résultats de chaîne de production selon la spec sort.md :
 * 1) Grouper les recettes (même item ou liées via items à plusieurs recettes)
 * 2) Graphe de dépendance entre groupes
 * 3) Tri topologique inversé (produits finaux → matières premières)
 * 4) Dans chaque groupe : ordre par première apparition
 */
export function sortProductionChain(results: ProductionResult[]): ProductionResult[] {
  if (results.length === 0) return [];

  const recipeToResult = new Map<string, ProductionResult>();
  results.forEach((r) => recipeToResult.set(recipeKey(r), r));

  const keys = Array.from(recipeToResult.keys()).sort();
  const uf = new UnionFind(keys);

  // 1) Grouper : pour chaque item produit par plusieurs recettes, fusionner leurs groupes
  const producersByItem = new Map<string, string[]>();
  keys.forEach((k) => {
    const r = recipeToResult.get(k)!;
    const item = r.resourceId;
    if (!producersByItem.has(item)) producersByItem.set(item, []);
    producersByItem.get(item)!.push(k);
  });

  producersByItem.forEach((producerKeys) => {
    if (producerKeys.length < 2) return;
    for (let i = 1; i < producerKeys.length; i++) {
      uf.union(producerKeys[0], producerKeys[i]);
    }
  });

  const groups = uf.getGroups();

  // Représentant → liste de clés de recettes (ordre déterministe)
  const groupToRecipes = new Map<string, string[]>();
  groups.forEach((members, repr) => {
    groupToRecipes.set(repr, [...members].sort());
  });

  // Carte recette → groupe (représentant)
  const recipeToGroup = new Map<string, string>();
  keys.forEach((k) => {
    recipeToGroup.set(k, uf.find(k));
  });

  // 2) Graphe de dépendance : G dépend de G' si une recette de G consomme un item produit par G'
  // item → groupe qui le produit (un seul producteur par item dans nos résultats agrégés, ou on prend le premier)
  const itemToGroup = new Map<string, string>();
  keys.forEach((k) => {
    const r = recipeToResult.get(k)!;
    const g = recipeToGroup.get(k)!;
    const item = r.resourceId;
    if (!itemToGroup.has(item)) itemToGroup.set(item, g);
  });

  const groupDeps = new Map<string, Set<string>>();
  groupToRecipes.forEach((recipeKeys, groupId) => {
    const deps = new Set<string>();
    recipeKeys.forEach((rk) => {
      const r = recipeToResult.get(rk)!;
      r.inputsPerSecond.forEach((_, inputItem) => {
        const producerGroup = itemToGroup.get(inputItem);
        if (producerGroup && producerGroup !== groupId) {
          deps.add(producerGroup);
        }
      });
    });
    groupDeps.set(groupId, deps);
  });

  // 3) Tri topologique : DFS post-order, puis inverser
  const visited = new Set<string>();
  const postOrder: string[] = [];

  function dfs(g: string): void {
    if (visited.has(g)) return;
    visited.add(g);
    groupDeps.get(g)?.forEach((dep) => dfs(dep));
    postOrder.push(g);
  }

  groupToRecipes.forEach((_, g) => dfs(g));
  const topoOrdered = postOrder.reverse();

  // 4) Dans chaque groupe : ordre par première apparition
  // Parcourir recettes du groupe (ordre fixe), pour chaque recette parcourir ses produits
  // Chaque recette produit resourceId → ordre = première apparition de (resourceId, buildingName)
  // Pour nous une ligne = une recette. Ordre déterministe = tri par (resourceId, buildingName)
  const orderedResults: ProductionResult[] = [];
  topoOrdered.forEach((groupId) => {
    const recipeKeys = groupToRecipes.get(groupId) ?? [];
    const groupResults = recipeKeys
      .map((k) => recipeToResult.get(k)!)
      .sort((a, b) => {
        const c = a.resourceId.localeCompare(b.resourceId);
        return c !== 0 ? c : a.buildingName.localeCompare(b.buildingName);
      });
    orderedResults.push(...groupResults);
  });

  return orderedResults;
}
