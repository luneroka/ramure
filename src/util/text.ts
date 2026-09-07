/** Case- and accent-insensitive comparison key: "Guérin" and "GUERIN" fold to "guerin". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').toLowerCase().replace(/\s+/g, ' ').trim();
}
