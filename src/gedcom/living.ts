/** Living or not, without a death: born less than 110 years ago and no death, burial or cremation recorded. */

import { approximateYear } from './dates';
import { findEvent, type Individual } from './model';

export function isLiving(ind: Individual): boolean {
  if (findEvent(ind.events, 'death') || findEvent(ind.events, 'burial') || findEvent(ind.events, 'cremation')) return false;
  const by = approximateYear((findEvent(ind.events, 'birth') ?? findEvent(ind.events, 'baptism'))?.date);
  if (by === undefined) return false;
  return new Date().getFullYear() - by < 110;
}
