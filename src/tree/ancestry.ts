/** A person's ancestors numbered the Sosa-Stradonitz way: 1 is the person, 2n the father of n, 2n+1 the mother. */

import type { Individual, Tree } from '../gedcom/model';

export type Ahnentafel = Map<number, Individual>;

/** Ancestors up to `generations` (1 = the person alone). Birth parents first; an adoptive family only when no birth family is known. */
export function ahnentafel(tree: Tree, rootId: string, generations: number): Ahnentafel {
  const out: Ahnentafel = new Map();
  const root = tree.individuals[rootId];
  if (!root) return out;
  out.set(1, root);
  const limit = 2 ** generations;
  for (let n = 1; n < limit / 2; n++) {
    const ind = out.get(n);
    if (!ind) continue;
    const link = ind.childOf.find((l) => l.pedigree === 'birth') ?? ind.childOf[0];
    const fam = link ? tree.families[link.familyId] : undefined;
    if (!fam) continue;
    const father = fam.husbandId ? tree.individuals[fam.husbandId] : undefined;
    const mother = fam.wifeId ? tree.individuals[fam.wifeId] : undefined;
    if (father && 2 * n < limit) out.set(2 * n, father);
    if (mother && 2 * n + 1 < limit) out.set(2 * n + 1, mother);
  }
  return out;
}

/** The generation (0 = the person) of a Sosa number. */
export const generationOf = (sosa: number): number => Math.floor(Math.log2(sosa));

/** How many generations the ancestry actually reaches (1 = nobody known beyond the person). */
export function depthOf(table: Ahnentafel): number {
  let deepest = 0;
  for (const n of table.keys()) deepest = Math.max(deepest, generationOf(n));
  return deepest + 1;
}
