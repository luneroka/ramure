/**
 * Link addresses the person typed, or a file brought in: what may become an
 * anchor, and how a long one is shown without pushing the panel sideways.
 *
 * Only http, https and mailto ever reach an `href`. Anything else (javascript:,
 * data:, file:) is dropped at save and again at render, because a document
 * imported from elsewhere never went through the save path.
 */

/** Only web and mail addresses are kept; anything else becomes nothing. A bare host gets https. */
export function normalizeUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  return safeHref(withScheme);
}

/** The address if it is http, https or mailto, else an empty string: what an <a> may point at. */
export function safeHref(url: string | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:' ? u.href : '';
  } catch {
    return '';
  }
}

/** Past this, the last part of a path is cut: the full address stays on the link's title. */
const LAST_PART = 28;

/**
 * A link as a person reads it: the site, then the last part of the path —
 * « archives.finistere.fr/…/3E210_12 ». The middle of a path is what makes an
 * archive address long and is what nobody reads.
 */
export function shortLink(href: string): string {
  try {
    const u = new URL(href);
    if (u.protocol === 'mailto:') return u.pathname;
    const host = u.hostname.replace(/^www\./, '');
    const parts = u.pathname.split('/').filter(Boolean);
    let last = parts[parts.length - 1] ?? '';
    try {
      last = decodeURIComponent(last);
    } catch {
      // A malformed escape is shown as written.
    }
    const cut = last.length > LAST_PART;
    if (cut) last = `${last.slice(0, LAST_PART - 1)}…`;
    if (!last) return u.search ? `${host}/…` : host;
    return `${host}/${parts.length > 1 ? '…/' : ''}${last}${u.search && !cut ? '…' : ''}`;
  } catch {
    return href;
  }
}

export type TextPart = { text: string } | { href: string; text: string };

/** Text with the web and mail addresses in it picked out, each one safe to link, so an imported citation's address can be followed too. */
export function linkParts(text: string): TextPart[] {
  const out: TextPart[] = [];
  let at = 0;
  for (const m of text.matchAll(/\b(?:https?:\/\/|mailto:)[^\s<>«»"]+/gi)) {
    let raw = m[0];
    // A sentence's own punctuation is not part of the address.
    raw = raw.replace(/[.,;:!?)\]]+$/, '');
    const start = m.index ?? 0;
    const href = safeHref(raw);
    if (!href) continue;
    if (start > at) out.push({ text: text.slice(at, start) });
    out.push({ href, text: shortLink(href) });
    at = start + raw.length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}
