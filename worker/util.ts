/** Small helpers shared by the Worker routes. */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Random id: a prefix and 11 base-36 characters, the same shape as the client's ids. */
export function randomId(prefix: string, length = 11): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = prefix;
  for (const b of bytes) out += ALPHABET[b % 36];
  return out;
}

/** A long random token for links and sessions (base64url, 32 bytes). */
export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const now = (): number => Date.now();

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Parse a JSON body, refusing oversized or malformed ones with a 4xx instead of a crash. */
export async function readJson<T extends object>(req: Request, maxBytes: number): Promise<Partial<T>> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new HttpError(413, 'body too large');
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'body too large');
  if (!text.trim()) return {};
  try {
    const v: unknown = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'expected a JSON object');
    return v as Partial<T>;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, 'malformed JSON');
  }
}

/** Record and media ids: the client's shape or an imported xref, nothing that could break a GEDCOM line. */
export const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function requireId(value: unknown, what = 'id'): string {
  const s = String(value ?? '');
  if (!ID_RE.test(s)) throw new HttpError(400, `bad ${what}`);
  return s;
}

export function normaliseEmail(raw: unknown): string {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 254) throw new HttpError(400, 'invalid email');
  return s;
}
