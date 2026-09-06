/**
 * Record identifiers.
 *
 * Imported records keep their GEDCOM cross-reference ids (I1, F12). Records
 * created in Ramure get a prefix plus 11 random base-36 characters: valid as
 * a GEDCOM xref (no mapping on export), impossible to confuse with imported
 * ids, and safe to create on several devices at once (about 57 bits of
 * randomness per id).
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const LENGTH = 11;

export type IdPrefix = 'I' | 'F' | 'S' | 'R' | 'M' | 'T' | 'L';

export function newId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(LENGTH);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < LENGTH; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = prefix;
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[bytes[i]! % 36];
  return out;
}

/** True for ids Ramure generated (as opposed to imported GEDCOM xrefs). */
export function isGeneratedId(id: string): boolean {
  return /^[IFSRMTL][0-9a-z]{11}$/.test(id);
}
