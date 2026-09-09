import { describe, expect, it } from 'vitest';
import { esc, popupFor } from './mapPopup';

describe('map popup', () => {
  it('escapes everything that comes from the tree', () => {
    const html = popupFor(
      {
        key: 'x',
        text: '<img src=x onerror=alert(1)>',
        place: { text: 'x', parts: ['x'] },
        mentions: [{ personId: 'I1', personName: 'A "quoted" <b>name</b>', type: 'birth', year: 1900 }],
      },
      'fr',
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('data-person="I1"');
    expect(html).toContain('&quot;quoted&quot; &lt;b&gt;name&lt;/b&gt;');
    expect(html).toContain('Naissance · 1900');
    expect(esc(`'&`)).toBe('&#39;&amp;');
  });
});
