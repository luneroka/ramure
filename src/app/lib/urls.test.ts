import { describe, expect, it } from 'vitest';
import { linkParts, normalizeUrl, safeHref, shortLink } from './urls';

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

describe('shortLink', () => {
  it('shows the site and the last part of the path, never the middle', () => {
    expect(shortLink('https://www.archives.finistere.fr/ark:/12345/vta5a1b2c3d4e5/daogrp/0/3E210_12')).toBe(
      'archives.finistere.fr/…/3E210_12',
    );
    expect(shortLink('https://geneanet.org/')).toBe('geneanet.org');
    expect(shortLink('https://example.org/acte')).toBe('example.org/acte');
    expect(shortLink('https://example.org/search?q=lenoir')).toBe('example.org/search…');
    expect(shortLink('mailto:cousin@example.org')).toBe('cousin@example.org');
  });
  it('cuts a very long last part', () => {
    const s = shortLink(`https://example.org/a/${'x'.repeat(60)}`);
    expect(s.length).toBeLessThan(50);
    expect(s.endsWith('…')).toBe(true);
    expect(shortLink(`https://example.org/a/${'x'.repeat(60)}?zoom=3`)).not.toContain('……');
  });
});

describe('linkParts', () => {
  it('links the addresses in a text and leaves the rest as text', () => {
    expect(linkParts('Acte de naissance — https://example.org/acte.')).toEqual([
      { text: 'Acte de naissance — ' },
      { href: 'https://example.org/acte', text: 'example.org/acte' },
      { text: '.' },
    ]);
  });
  it('never links a scheme that could run', () => {
    expect(linkParts('voir javascript:alert(1)')).toEqual([{ text: 'voir javascript:alert(1)' }]);
  });
});
