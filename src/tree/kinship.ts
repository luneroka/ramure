/**
 * Relationship between two people, in words and as a path.
 *
 * Blood ties come from the nearest common ancestor: `up` steps from the
 * first person, `down` steps to the second. In-laws add one marriage hop at
 * either end. When nothing of the kind exists, the shortest family path is
 * still reported so the canvas can light it.
 */

import { displayName, type Individual, type Tree } from '../gedcom/model';

export type KinshipKind = 'same' | 'blood' | 'spouse' | 'in-law' | 'indirect' | 'none';

export interface Kinship {
  kind: KinshipKind;
  /** People from `a` to `b`, along the lit path (empty when there is no path). */
  path: string[];
  /** "Marie BRÉHIER est la grand-mère de Henri LENOIR", or the equivalent in English. */
  sentence: string;
  /** The relationship noun phrase alone, with its article: "la grand-mère". */
  relation: string;
}

type Lang = 'fr' | 'en';
type Sex = 'M' | 'F' | 'U';
interface Words {
  m: string;
  f: string;
  u: string;
}

const pick = (w: Words, sex: Sex) => (sex === 'M' ? w.m : sex === 'F' ? w.f : w.u);

// ---------- Graph helpers ----------

function parentsOf(tree: Tree, id: string): string[] {
  const out: string[] = [];
  for (const link of tree.individuals[id]?.childOf ?? []) {
    const f = tree.families[link.familyId];
    if (!f) continue;
    for (const p of [f.husbandId, f.wifeId]) if (p && tree.individuals[p] && !out.includes(p)) out.push(p);
  }
  return out;
}

function childrenOf(tree: Tree, id: string): string[] {
  const out: string[] = [];
  for (const fid of tree.individuals[id]?.partnerIn ?? []) {
    const f = tree.families[fid];
    if (!f) continue;
    for (const c of f.childIds) if (tree.individuals[c] && !out.includes(c)) out.push(c);
  }
  return out;
}

function spousesOf(tree: Tree, id: string): Array<{ id: string; married: boolean }> {
  const out: Array<{ id: string; married: boolean }> = [];
  for (const fid of tree.individuals[id]?.partnerIn ?? []) {
    const f = tree.families[fid];
    if (!f) continue;
    const other = f.husbandId === id ? f.wifeId : f.husbandId;
    if (other && tree.individuals[other] && !out.some((s) => s.id === other)) {
      out.push({ id: other, married: f.unionType !== 'unmarried' });
    }
  }
  return out;
}

/** Every ancestor with its distance and the chain of ids leading up to it (excluding the start). */
function ancestors(tree: Tree, id: string): Map<string, { depth: number; chain: string[] }> {
  const seen = new Map<string, { depth: number; chain: string[] }>();
  const queue: Array<{ id: string; depth: number; chain: string[] }> = [{ id, depth: 0, chain: [] }];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const p of parentsOf(tree, cur.id)) {
      if (seen.has(p)) continue;
      const chain = [...cur.chain, p];
      seen.set(p, { depth: cur.depth + 1, chain });
      queue.push({ id: p, depth: cur.depth + 1, chain });
    }
  }
  return seen;
}

interface Blood {
  up: number;
  down: number;
  path: string[];
  /** Siblings sharing both parents. */
  full?: boolean;
}

/** Nearest common ancestor between a and b, as steps and the path a → ancestor → b. */
function bloodTie(tree: Tree, a: string, b: string): Blood | undefined {
  const upA = ancestors(tree, a);
  const upB = ancestors(tree, b);
  let best: Blood | undefined;
  const consider = (up: number, down: number, path: string[]) => {
    if (
      !best ||
      up + down < best.up + best.down ||
      (up + down === best.up + best.down && Math.abs(up - down) < Math.abs(best.up - best.down))
    )
      best = { up, down, path };
  };
  const bUp = upB.get(a);
  if (bUp)
    consider(
      0,
      bUp.depth,
      [a, ...bUp.chain.slice(0, -1).reverse(), b].filter((x, i, arr) => arr.indexOf(x) === i),
    );
  const aUp = upA.get(b);
  if (aUp) consider(aUp.depth, 0, [a, ...aUp.chain]);
  for (const [anc, ia] of upA) {
    const ib = upB.get(anc);
    if (!ib) continue;
    consider(ia.depth, ib.depth, [a, ...ia.chain, ...ib.chain.slice(0, -1).reverse(), b]);
  }
  if (best && best.up === 1 && best.down === 1) {
    const pa = parentsOf(tree, a),
      pb = parentsOf(tree, b);
    best.full = pa.filter((p) => pb.includes(p)).length >= 2;
  }
  return best;
}

/** Shortest path over parent, child and spouse edges. */
function shortestPath(tree: Tree, a: string, b: string): string[] | undefined {
  const prev = new Map<string, string | null>([[a, null]]);
  const queue = [a];
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur === b) break;
    const next = [...parentsOf(tree, cur), ...childrenOf(tree, cur), ...spousesOf(tree, cur).map((s) => s.id)];
    for (const n of next) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      queue.push(n);
    }
  }
  if (!prev.has(b)) return undefined;
  const path: string[] = [];
  for (let cur: string | null = b; cur !== null; cur = prev.get(cur) ?? null) path.unshift(cur);
  return path;
}

// ---------- Words ----------

function repeat(s: string, n: number): string {
  return n > 0 ? s.repeat(n) : '';
}

/** The blood relation of b to a, as a noun phrase with its article. */
function bloodWords(blood: Blood, sex: Sex, lang: Lang): string {
  const { up, down } = blood;
  const fr = lang === 'fr';
  const w = (m: string, f: string, u: string) => pick({ m, f, u }, sex);
  const elide = (word: string) => (fr && /^[aeiouyéèh]/i.test(word) ? `l’${word}` : sex === 'F' ? `la ${word}` : `le ${word}`);
  const the = (word: string) => (fr ? elide(word) : `the ${word}`);
  if (down === 0) {
    // b is an ancestor of a.
    if (up === 1) return the(w(fr ? 'père' : 'father', fr ? 'mère' : 'mother', fr ? 'parent' : 'parent'));
    const g = up - 2;
    return fr
      ? the(repeat('arrière-', g) + w('grand-père', 'grand-mère', 'grand-parent'))
      : the(repeat('great-', g) + w('grandfather', 'grandmother', 'grandparent'));
  }
  if (up === 0) {
    // b descends from a.
    if (down === 1) return the(w(fr ? 'fils' : 'son', fr ? 'fille' : 'daughter', fr ? 'enfant' : 'child'));
    const g = down - 2;
    return fr
      ? the(repeat('arrière-', g) + w('petit-fils', 'petite-fille', 'petit-enfant'))
      : the(repeat('great-', g) + w('grandson', 'granddaughter', 'grandchild'));
  }
  if (up === 1 && down === 1) {
    const half = !blood.full;
    return fr
      ? the((half ? 'demi-' : '') + w('frère', 'sœur', 'frère ou sœur'))
      : the((half ? 'half-' : '') + w('brother', 'sister', 'sibling'));
  }
  if (up === 1) {
    // b descends from a's parent: nephew line.
    const g = down - 2;
    if (fr)
      return the(
        g === 0
          ? w('neveu', 'nièce', 'neveu ou nièce')
          : repeat('arrière-', g - 1) + w('petit-neveu', 'petite-nièce', 'petit-neveu ou petite-nièce'),
      );
    return the(repeat('great-', g) + w('nephew', 'niece', 'nibling'));
  }
  if (down === 1) {
    // b is a sibling of a's ancestor: uncle line.
    const g = up - 2;
    if (fr)
      return the(
        g === 0
          ? w('oncle', 'tante', 'oncle ou tante')
          : repeat('arrière-', g - 1) + w('grand-oncle', 'grand-tante', 'grand-oncle ou grand-tante'),
      );
    return the(repeat('great-', g) + w('uncle', 'aunt', 'uncle or aunt'));
  }
  // Cousins.
  const degree = Math.min(up, down) - 1;
  const removed = Math.abs(up - down);
  if (fr) {
    const base = w('cousin', 'cousine', 'cousin·e');
    if (removed === 0 && degree === 1) return the(`${base} ${w('germain', 'germaine', 'germain·e')}`);
    if (removed === 0 && degree === 2) return the(`${base} ${w('issu', 'issue', 'issu·e')} de germain`);
    const suffix = removed === 0 ? '' : `, ${removed} génération${removed > 1 ? 's' : ''} d’écart`;
    return the(`${base} au ${degree === 1 ? '1er' : `${degree}e`} degré${suffix}`);
  }
  const ord = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][degree - 1] ?? `${degree}th`;
  const rem = removed === 0 ? '' : removed === 1 ? ' once removed' : removed === 2 ? ' twice removed' : ` ${removed} times removed`;
  return the(`${ord} cousin${rem}`);
}

function spouseWords(sex: Sex, married: boolean, lang: Lang): string {
  const fr = lang === 'fr';
  if (fr)
    return married
      ? pick({ m: 'l’époux', f: 'l’épouse', u: 'le·la conjoint·e' }, sex)
      : pick({ m: 'le compagnon', f: 'la compagne', u: 'le·la partenaire' }, sex);
  return married
    ? pick({ m: 'the husband', f: 'the wife', u: 'the spouse' }, sex)
    : pick({ m: 'the partner', f: 'the partner', u: 'the partner' }, sex);
}

/** "de" + a noun phrase: "de la mère", "du père", "de l’oncle". */
function ofPhrase(phrase: string, lang: Lang): string {
  if (lang !== 'fr') return `of ${phrase}`;
  if (phrase.startsWith('le ')) return `du ${phrase.slice(3)}`;
  return `de ${phrase}`;
}

// ---------- Public API ----------

export function describeKinship(tree: Tree, aId: string, bId: string, lang: Lang): Kinship {
  const a = tree.individuals[aId];
  const b = tree.individuals[bId];
  const fr = lang === 'fr';
  const nameA = a ? displayName(a) : '?';
  const nameB = b ? displayName(b) : '?';
  const sentence = (relation: string) => (fr ? `${nameB} est ${relation} de ${nameA}` : `${nameB} is ${relation} of ${nameA}`);
  if (!a || !b) return { kind: 'none', path: [], relation: '', sentence: '' };
  if (aId === bId) {
    const rel = fr ? 'la même personne' : 'the same person';
    return { kind: 'same', path: [aId], relation: rel, sentence: fr ? `${nameA} : c’est la même personne.` : `${nameA}: the same person.` };
  }
  const sexB = (b as Individual).sex;

  // Direct spouse.
  const direct = spousesOf(tree, aId).find((s) => s.id === bId);
  if (direct) {
    const rel = spouseWords(sexB, direct.married, lang);
    return { kind: 'spouse', path: [aId, bId], relation: rel, sentence: sentence(rel) };
  }

  // Blood.
  const blood = bloodTie(tree, aId, bId);
  if (blood) {
    const rel = bloodWords(blood, sexB, lang);
    return { kind: 'blood', path: blood.path, relation: rel, sentence: sentence(rel) };
  }

  // In-laws: b related by blood to a's spouse, or b the spouse of someone related by blood to a.
  type Candidate = { rel: string; path: string[] };
  const candidates: Candidate[] = [];
  for (const s of spousesOf(tree, aId)) {
    const t = bloodTie(tree, s.id, bId);
    if (!t) continue;
    const spouse = tree.individuals[s.id]!;
    let rel: string;
    if (t.down === 0 && t.up === 1)
      rel = fr
        ? pick({ m: 'le beau-père', f: 'la belle-mère', u: 'le beau-parent' }, sexB)
        : pick({ m: 'the father-in-law', f: 'the mother-in-law', u: 'the parent-in-law' }, sexB);
    else if (t.up === 1 && t.down === 1)
      rel = fr
        ? pick({ m: 'le beau-frère', f: 'la belle-sœur', u: 'le beau-frère ou la belle-sœur' }, sexB)
        : pick({ m: 'the brother-in-law', f: 'the sister-in-law', u: 'the sibling-in-law' }, sexB);
    else if (t.up === 0 && t.down === 1)
      rel = fr
        ? pick({ m: 'le beau-fils', f: 'la belle-fille', u: 'le bel-enfant' }, sexB)
        : pick({ m: 'the stepson', f: 'the stepdaughter', u: 'the stepchild' }, sexB);
    else rel = `${bloodWords(t, sexB, lang)} ${ofPhrase(spouseWords(spouse.sex, s.married, lang), lang)}`;
    candidates.push({ rel, path: [aId, ...t.path] });
  }
  for (const s of spousesOf(tree, bId)) {
    const t = bloodTie(tree, aId, s.id);
    if (!t) continue;
    const other = tree.individuals[s.id]!;
    let rel: string;
    if (t.up === 0 && t.down === 1)
      rel = fr
        ? pick({ m: 'le gendre', f: 'la bru', u: 'le gendre ou la bru' }, sexB)
        : pick({ m: 'the son-in-law', f: 'the daughter-in-law', u: 'the child-in-law' }, sexB);
    else if (t.up === 1 && t.down === 1)
      rel = fr
        ? pick({ m: 'le beau-frère', f: 'la belle-sœur', u: 'le beau-frère ou la belle-sœur' }, sexB)
        : pick({ m: 'the brother-in-law', f: 'the sister-in-law', u: 'the sibling-in-law' }, sexB);
    else if (t.down === 0 && t.up === 1)
      rel = fr
        ? pick({ m: 'le beau-père', f: 'la belle-mère', u: 'le beau-parent' }, sexB)
        : pick({ m: 'the stepfather', f: 'the stepmother', u: 'the stepparent' }, sexB);
    else rel = `${spouseWords(sexB, s.married, lang)} ${ofPhrase(bloodWords(t, other.sex, lang), lang)}`;
    candidates.push({ rel, path: [...t.path, bId] });
  }
  if (candidates.length) {
    candidates.sort((x, y) => x.path.length - y.path.length);
    const best = candidates[0]!;
    return { kind: 'in-law', path: best.path, relation: best.rel, sentence: sentence(best.rel) };
  }

  // Anything else: the shortest family path, or nothing.
  const path = shortestPath(tree, aId, bId);
  if (path) {
    const hops = path.length - 1;
    const rel = fr ? `lié·e par ${hops} liens` : `linked through ${hops} ties`;
    return {
      kind: 'indirect',
      path,
      relation: rel,
      sentence: fr
        ? `${nameB} est ${rel} à ${nameA}, sans lien de sang ni d’alliance direct.`
        : `${nameB} is ${rel} to ${nameA}, with no direct blood or marriage tie.`,
    };
  }
  return {
    kind: 'none',
    path: [],
    relation: '',
    sentence: fr ? `Aucun lien connu entre ${nameB} et ${nameA}.` : `No known link between ${nameB} and ${nameA}.`,
  };
}
