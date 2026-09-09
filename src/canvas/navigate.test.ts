import { describe, expect, it } from 'vitest';
import type { LayoutNode } from '../tree/layout';
import { neighbour } from './navigate';

const node = (id: string, x: number, y: number): LayoutNode => ({ id, x, y, w: 100, h: 40, gen: 0, dup: 0, role: 'focus' });
const nodes = [node('a', 0, 0), node('b', 150, 0), node('c', 400, 0), node('p', 60, -100), node('q', 500, -100), node('k', 200, 100)];

describe('keyboard neighbour', () => {
  it('moves along the row to the closest card', () => {
    expect(neighbour(nodes, nodes[0]!, 'right')?.id).toBe('b');
    expect(neighbour(nodes, nodes[2]!, 'left')?.id).toBe('b');
    expect(neighbour(nodes, nodes[0]!, 'left')).toBeUndefined();
  });
  it('goes to the closest card of the row above or below', () => {
    expect(neighbour(nodes, nodes[0]!, 'up')?.id).toBe('p');
    expect(neighbour(nodes, nodes[2]!, 'up')?.id).toBe('q');
    expect(neighbour(nodes, nodes[1]!, 'down')?.id).toBe('k');
    expect(neighbour(nodes, nodes[5]!, 'down')).toBeUndefined();
  });
});
