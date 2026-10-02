/**
 * Which blocks of the person sheet go on which page.
 *
 * The sheet is paginated by the app rather than by the browser, for the reason
 * the charts print with no page margin: a page margin is where the browser
 * writes its own header and footer — the address, the date — and a sheet sent
 * to a relative should carry neither. With no page margin the browser cannot
 * give a second page its top margin either, so the screen measures every block
 * at paper size and this function packs them, pure, so its rules are tested
 * without a browser:
 *
 * - A block marked `keepWithNext` (a section title, a union's header) never
 *   ends a page: it moves over with the block after it.
 * - The space a block keeps above itself (`lead`) is not counted when the block
 *   opens a page, since the stylesheet drops it there.
 * - A block taller than a page still gets a page of its own rather than
 *   stopping the sheet.
 *
 * Before any of this, `fitScale` decides whether setting the text a little
 * smaller would keep the sheet on one page, which is the first thing asked of
 * it.
 */

export interface MeasuredBlock {
  height: number;
  lead: number;
  keepWithNext: boolean;
}

/** How small the text may be set to keep a sheet on one page: 85 % of its size, then it takes a second page instead. */
export const FIT_SCALES = [1, 0.95, 0.9, 0.85];

/** The height the blocks take on one page: the first one's lead is not paid. */
export function heightOf(blocks: MeasuredBlock[]): number {
  return blocks.reduce((h, b) => h + b.height, 0) - (blocks[0]?.lead ?? 0);
}

/**
 * The largest scale at which the sheet fits on one page, or null when even the
 * smallest does not. `measure` lays the sheet out at a scale and reports its blocks.
 */
export function fitScale(measure: (scale: number) => MeasuredBlock[], room: number): number | null {
  for (const scale of FIT_SCALES) if (heightOf(measure(scale)) <= room) return scale;
  return null;
}

export function packPages(blocks: MeasuredBlock[], room: number): number[][] {
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;
  for (let i = 0; i < blocks.length; ) {
    // The run that must stay together: this block and every one it is kept with.
    let j = i;
    while (j < blocks.length - 1 && blocks[j]!.keepWithNext) j++;
    const run = blocks.slice(i, j + 1);
    const tall = run.reduce((h, b) => h + b.height, 0);
    if (page.length && used + tall > room) {
      pages.push(page);
      page = [];
      used = 0;
    }
    used += page.length ? tall : tall - run[0]!.lead;
    for (let k = i; k <= j; k++) page.push(k);
    i = j + 1;
  }
  if (page.length) pages.push(page);
  return pages;
}
