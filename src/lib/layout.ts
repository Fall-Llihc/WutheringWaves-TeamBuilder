/**
 * Export layout: splits N teams into symmetric blocks of at most 3x3,
 * stacked top to bottom in team order.
 *
 * Allowed blocks: 3x3 (9), 2 rows x 3 (6), 2x2 (4), row of 3, row of 2, single.
 * A small dynamic program picks the combination with the lowest cost. Costs
 * favour few blocks and square blocks, and penalise lonely leftovers, which
 * gives e.g. 9 → 3x3, 8 → 2x2 + 2x2, 7 → 2x2 + 3, 5 → 3 + 2, 10 → 2x3 + 2x2.
 */

export interface Block {
  rows: number;
  cols: number;
}

const BLOCKS: Array<Block & { cost: number }> = [
  { rows: 3, cols: 3, cost: 1.0 },
  { rows: 2, cols: 3, cost: 1.2 },
  { rows: 2, cols: 2, cost: 1.0 },
  { rows: 1, cols: 3, cost: 1.1 },
  { rows: 1, cols: 2, cost: 1.4 },
  { rows: 1, cols: 1, cost: 1.6 },
];

export function planLayout(n: number): Block[] {
  if (n <= 0) return [];
  const best: Array<{ cost: number; blocks: Block[] }> = [{ cost: 0, blocks: [] }];
  for (let i = 1; i <= n; i++) {
    let pick: { cost: number; blocks: Block[] } | null = null;
    for (const b of BLOCKS) {
      const size = b.rows * b.cols;
      if (size > i) continue;
      const prev = best[i - size];
      const cost = prev.cost + b.cost;
      if (!pick || cost < pick.cost - 1e-9) {
        // Larger blocks first reads better (3x3 on top, leftovers at the bottom).
        const blocks = [...prev.blocks, { rows: b.rows, cols: b.cols }].sort(
          (x, y) => y.rows * y.cols - x.rows * x.cols,
        );
        pick = { cost, blocks };
      }
    }
    best[i] = pick!;
  }
  return best[n].blocks;
}

/** Splits items into the planned blocks, preserving order. */
export function chunkByLayout<T>(items: T[], blocks: Block[]): T[][] {
  const out: T[][] = [];
  let i = 0;
  for (const b of blocks) {
    const size = b.rows * b.cols;
    out.push(items.slice(i, i + size));
    i += size;
  }
  return out;
}

export function describeLayout(blocks: Block[]): string {
  return blocks.map((b) => (b.rows === 1 ? (b.cols === 1 ? '1' : `1x${b.cols}`) : `${b.rows}x${b.cols}`)).join(' + ');
}
