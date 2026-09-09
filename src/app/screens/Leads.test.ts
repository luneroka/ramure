import { describe, expect, it } from 'vitest';
import { normalizeUrl, safeHref } from './Leads';

describe('link addresses', () => {
  it('keeps web and mail addresses, adds https when missing', () => {
    expect(normalizeUrl('archives.finistere.fr')).toBe('https://archives.finistere.fr/');
    expect(normalizeUrl('http://example.org/x?y=1')).toBe('http://example.org/x?y=1');
    expect(normalizeUrl('mailto:cousin@example.org')).toBe('mailto:cousin@example.org');
  });
  it('drops anything that could run or read', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBe('');
    expect(normalizeUrl('javascript://%0aalert(1)')).toBe('');
    expect(normalizeUrl('data:text/html,<script>1</script>')).toBe('');
    expect(normalizeUrl('file:///etc/passwd')).toBe('');
    expect(safeHref('vbscript:x')).toBe('');
    expect(safeHref(undefined)).toBe('');
  });
});
