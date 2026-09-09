/** The HTML of a map popup, built from user data: everything is escaped. */

import { eventLabel, type Lang } from '../i18n';
import type { PlaceEntry } from '../tree/places';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function popupFor(p: PlaceEntry, lang: Lang): string {
  const rows = [...p.mentions]
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))
    .map(
      (m) =>
        `<li><button type="button" data-person="${esc(m.personId)}">${esc(m.personName)}</button> <span class="muted">${esc(
          eventLabel(lang, m.type, m.customType),
        )}${m.year !== undefined ? ` · ${m.year}` : ''}</span></li>`,
    )
    .join('');
  return `<strong>${esc(p.text)}</strong><ul class="map-list">${rows}</ul>`;
}
