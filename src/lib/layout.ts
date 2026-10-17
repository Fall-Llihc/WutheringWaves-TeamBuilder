/**
 * Export layout: splits N teams into at most 4 sets, one image per set,
 * shaped for social feeds: square down to about 4:5 portrait, never landscape.
 *
 * Every set except the last uses the same grid; the last one holds whatever
 * is left, re-fitted (no wider than the others). The planner tries every
 * grid up to 4 columns and scores the result:
 *
 *   - each image costs a little (fewer downloads)
 *   - images off the square..3:4 band cost more; a landscape result gets
 *     padded to a square on export, so that cost is the empty space it adds
 *   - more than 9 teams in one image costs more (shrinks when shared)
 *   - empty cells in the last row cost a little
 *
 * Image size comes from the real team card size, so names, gear, notes and
 * Matrix buffs all feed into the shape.
 */

export interface Block {
  rows: number;
  cols: number;
  /** Teams in this set (the last row may be short). */
  count: number;
}

export interface SheetMetrics {
  /** One team card, in px. */
  cellW: number;
  cellH: number;
  /** Space between team cards. */
  gap: number;
  /** Sheet padding + title, set label and footer: added to width / height. */
  chromeW: number;
  chromeH: number;
}

export const MAX_SETS = 4;
const MAX_COLS = 4;
const MAX_ROWS = 10;
const QUALITY_CAP = 9;

// Width / height: 1 is square, 0.75 is 3:4.
const IDEAL_MIN = 0.75;
const IDEAL_MAX = 1;
const TOO_TALL = 0.55;

export function sheetAspect(rows: number, cols: number, m: SheetMetrics): number {
  const w = cols * m.cellW + (cols - 1) * m.gap + m.chromeW;
  const h = rows * m.cellH + (rows - 1) * m.gap + m.chromeH;
  return w / h;
}

function shapeCost(rows: number, cols: number, m: SheetMetrics): number {
  const a = sheetAspect(rows, cols, m);
  // Landscape gets padded to a square; cost is the share of the image left empty.
  if (a > IDEAL_MAX) return (1 - IDEAL_MAX / a) * 4;
  // Too tall to read in a feed; past ~1:2 it turns into a strip.
  if (a < IDEAL_MIN) return (IDEAL_MIN - a) * 3 + Math.max(0, TOO_TALL - a) * 15;
  return 0;
}

const sizeCost = (count: number) => Math.max(0, count - QUALITY_CAP) * 0.35;
const IMAGE_COST = 1.3;

/** Best grid for exactly `n` teams, at most `maxCols` wide, with no empty rows. */
function fitGrid(n: number, maxCols: number, m: SheetMetrics): { rows: number; cols: number; cost: number } {
  let best: { rows: number; cols: number; cost: number } | null = null;
  for (let cols = 1; cols <= Math.min(maxCols, n); cols++) {
    const rows = Math.ceil(n / cols);
    const cost = shapeCost(rows, cols, m) + (rows * cols - n) * 0.15 + sizeCost(n);
    if (!best || cost < best.cost - 1e-9) best = { rows, cols, cost };
  }
  return best!;
}

export function planLayout(n: number, m: SheetMetrics): Block[] {
  if (n <= 0) return [];
  let best: { cost: number; blocks: Block[] } | null = null;
  for (let cols = 1; cols <= MAX_COLS; cols++) {
    for (let rows = 1; rows <= MAX_ROWS; rows++) {
      const cap = rows * cols;
      const sets = Math.ceil(n / cap);
      if (sets > MAX_SETS) continue;
      // A single set never keeps empty rows; that grid is tried as its own size.
      if (sets === 1 && cap - n >= cols) continue;
      const fullSets = sets - 1;
      const left = n - fullSets * cap;
      const last = fitGrid(left, cols, m);
      const cost =
        sets * IMAGE_COST + fullSets * (shapeCost(rows, cols, m) + sizeCost(cap)) + last.cost;
      if (!best || cost < best.cost - 1e-9) {
        const blocks: Block[] = Array.from({ length: fullSets }, () => ({ rows, cols, count: cap }));
        blocks.push({ rows: last.rows, cols: last.cols, count: left });
        best = { cost, blocks };
      }
    }
  }
  return best!.blocks;
}

/** Splits items into the planned sets, preserving order. */
export function chunkByLayout<T>(items: T[], blocks: Block[]): T[][] {
  const out: T[][] = [];
  let i = 0;
  for (const b of blocks) {
    out.push(items.slice(i, i + b.count));
    i += b.count;
  }
  return out;
}

const gridName = (b: Block) => `${b.cols}x${b.rows}`;

/** e.g. "2x4 ×2 + 2x2" (columns x rows). */
export function describeLayout(blocks: Block[]): string {
  const parts: string[] = [];
  for (let i = 0; i < blocks.length; ) {
    let j = i;
    while (j < blocks.length && gridName(blocks[j]) === gridName(blocks[i]) && blocks[j].count === blocks[i].count) j++;
    parts.push(j - i > 1 ? `${gridName(blocks[i])} ×${j - i}` : gridName(blocks[i]));
    i = j;
  }
  return parts.join(' + ');
}
