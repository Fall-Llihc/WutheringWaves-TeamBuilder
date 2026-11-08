/**
 * Matrix circuit buffs. src/data/matrix.txt names the patch; the nanoka tower
 * page for it is worked out from an anchor patch, then its buffs are fetched.
 */
import { create } from 'zustand';
import matrixText from '../data/matrix.txt?raw';
import { asset, DATA_HOST } from './data';

export interface MatrixBuff {
  id: string;
  name: string;
  desc: string;
  icon: string;
}

/** A boss in the round line-up (the same five every round). */
export interface MatrixBoss {
  name: string;
  icon: string;
  /** Resistance tags, e.g. "Fusion RES". */
  res: string[];
}

/** A resonator the tower enhances this cycle (nanoka character id). */
export interface MatrixEnhanced {
  id: string;
  desc: string;
}

export interface MatrixTower {
  page: number;
  patch: string;
  name: string;
  phase: string;
  buffs: MatrixBuff[];
  /** Boss line-up for one round, in fighting order. */
  bosses: MatrixBoss[];
  /** Score needed for each rank tier, lowest first (from the game's score_level_rule). */
  ranks: number[];
  enhanced: MatrixEnhanced[];
}

interface Patch {
  major: number;
  minor: number;
}

/** One planned cycle: a patch and its nanoka page. */
export interface MatrixCycle {
  patch: string;
  page: number;
}

export interface MatrixConfig extends MatrixCycle {
  /** The patch after `patch` in matrix.txt's list, if any. */
  next: MatrixCycle | null;
}

const parsePatch = (s: string): Patch | null => {
  const m = /^(\d+)\.(\d+)$/.exec(s.trim());
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
};

const patchKey = (p: Patch) => p.major * 1000 + p.minor;

/**
 * Reads matrix.txt. With a `patches` list, pages are counted along it from the
 * anchor (each patch adds `step` pages), and the next cycle is the list's
 * following patch. Without one, the old rule applies: count by minor version
 * from an anchor in the same major, and the next patch is minor + 1.
 */
export function parseMatrixConfig(text: string): MatrixConfig {
  let patch: Patch | null = null;
  let patchText = '';
  let step = 2;
  let order: string[] = [];
  const anchors: Array<Patch & { text: string; page: number }> = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (key === 'patch') {
      patch = parsePatch(value);
      patchText = value;
    } else if (key === 'patches') {
      order = value.split(',').map((v) => v.trim()).filter((v) => parsePatch(v));
    } else if (key === 'step') {
      step = Number(value) || step;
    } else if (key === 'anchor') {
      const [p, page] = value.split(':');
      const at = parsePatch(p ?? '');
      if (at && Number(page)) anchors.push({ ...at, text: (p ?? '').trim(), page: Number(page) });
    }
  }

  if (!patch) throw new Error('matrix.txt: no valid "patch = X.Y" line.');
  const p = patch;

  if (order.length) {
    // Keep the list in version order even if typed out of order, and make sure the patch is in it.
    const list = [...new Set([...order, patchText])].sort((x, y) => patchKey(parsePatch(x)!) - patchKey(parsePatch(y)!));
    const anchor = anchors.find((a) => list.includes(a.text));
    if (!anchor) throw new Error('matrix.txt: the anchor patch must be in the "patches" list.');
    const pageOf = (v: string) => anchor.page + step * (list.indexOf(v) - list.indexOf(anchor.text));
    const at = list.indexOf(patchText);
    const nextText = list[at + 1];
    return { patch: patchText, page: pageOf(patchText), next: nextText ? { patch: nextText, page: pageOf(nextText) } : null };
  }

  const sameMajor = anchors.filter((a) => a.major === p.major).sort((a, b) => a.minor - b.minor);
  if (!sameMajor.length) throw new Error(`matrix.txt: no anchor for patch ${p.major}.x.`);
  // Closest anchor at or below the patch; otherwise the lowest one above it.
  const anchor = [...sameMajor].reverse().find((a) => a.minor <= p.minor) ?? sameMajor[0];
  const page = anchor.page + step * (p.minor - anchor.minor);
  return { patch: patchText, page, next: { patch: `${p.major}.${p.minor + 1}`, page: page + step } };
}

export const MATRIX = parseMatrixConfig(matrixText);

/** Board key the store keeps a Matrix cycle's teams under. */
export const matrixBoard = (page: number) => `matrix:${page}`;
/** Patch of a page among the planned cycles. */
export const patchOfPage = (page: number) => (page === MATRIX.next?.page ? MATRIX.next.patch : MATRIX.patch);
/** Page of the open Matrix board, or the active cycle's. */
export const boardPage = (board: string) => (board.startsWith('matrix:') ? Number(board.slice(7)) || MATRIX.page : MATRIX.page);
/** Whether the open board plans the next cycle. */
export const isNextBoard = (board: string) => !!MATRIX.next && boardPage(board) === MATRIX.next.page;

export const towerPageUrl = (page: number) => `https://ww.nanoka.cc/newtower/${page}/`;

// Bump the prefix whenever MatrixTower gains fields, so old cached copies are refetched.
const cacheKey = (page: number) => `wtb:matrix2:${page}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchTower(page: number, versions: string[]): Promise<MatrixTower> {
  let lastError: unknown = null;
  // The newest data folder also serves older towers, so try it first.
  for (const v of versions) {
    try {
      const res = await fetch(`${DATA_HOST}/ww/${v}/en/newtower/${page}.json`);
      if (!res.ok) throw new Error(`${res.status}`);
      const raw: any = await res.json();
      return {
        page,
        patch: patchOfPage(page),
        name: raw.name ?? '',
        phase: raw.cycle?.name ?? '',
        buffs: Object.entries<any>(raw.buffs ?? {}).map(([id, b]) => ({
          id,
          name: b.name ?? '',
          desc: fillParams(b.desc ?? '', b.param ?? []),
          icon: asset(b.icon),
        })),
        // Waves list every round's line-up back to back; the first five are one round.
        bosses: Object.values<any>(raw.waves ?? {})
          .slice(0, 5)
          .map((w) => ({
            name: w.name ?? '',
            icon: asset(w.icon),
            res: Object.values<any>(w.tag ?? {}).map((t) => String(t.name ?? '')),
          })),
        ranks: (raw.score_level_rule ?? [])
          .map((r: any) => Number(r.value))
          .filter((v: number) => Number.isFinite(v))
          .sort((a: number, b: number) => a - b),
        enhanced: Object.entries<any>(raw.roles ?? {}).map(([id, r]) => {
          const first: any = Object.values(r ?? {})[0] ?? {};
          return { id, desc: fillParams(first.desc ?? '', first.param ?? []) };
        }),
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Couldn't load Matrix page ${page} (${lastError instanceof Error ? lastError.message : lastError}).`);
}

const fillParams = (desc: string, params: string[]) => desc.replace(/\{(\d+)\}/g, (_, i) => params[Number(i)] ?? '');

interface MatrixState {
  /** Page shown (the active cycle, or the next one). */
  page: number;
  /** That page's data. */
  tower: MatrixTower | null;
  towers: Record<number, MatrixTower>;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  /** Pages nanoka doesn't have yet. */
  missing: Record<number, true>;
  /** Shows a page, loading it (cached copy first) when needed. */
  select: (page: number, dataVersion: string) => Promise<void>;
  /** Loads a page in the background (to know whether the next cycle is out). */
  prefetch: (page: number, dataVersion: string) => Promise<void>;
}

const loading = new Set<number>();

export const useMatrix = create<MatrixState>()((set, get) => {
  const fetchPage = async (page: number, dataVersion: string) => {
    if (loading.has(page)) return;
    loading.add(page);
    try {
      const tower = await fetchTower(page, [...new Set([dataVersion, patchOfPage(page)])]);
      try {
        localStorage.setItem(cacheKey(page), JSON.stringify(tower));
      } catch {
        /* storage full */
      }
      set((st) => ({
        towers: { ...st.towers, [page]: tower },
        ...(st.page === page ? { tower, status: 'ready' as const, error: null } : {}),
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set((st) => ({
        missing: st.towers[page] ? st.missing : { ...st.missing, [page]: true },
        // Keep a cached copy usable if the refresh fails.
        ...(st.page === page ? { status: st.towers[page] ? ('ready' as const) : ('error' as const), error: msg } : {}),
      }));
    } finally {
      loading.delete(page);
    }
  };
  const fromCache = (page: number) => {
    if (get().towers[page]) return;
    try {
      const cached = localStorage.getItem(cacheKey(page));
      if (cached) set((st) => ({ towers: { ...st.towers, [page]: JSON.parse(cached) } }));
    } catch {
      /* no cache */
    }
  };
  return {
    page: MATRIX.page,
    tower: null,
    towers: {},
    status: 'idle',
    error: null,
    missing: {},
    select: async (page, dataVersion) => {
      fromCache(page);
      const have = get().towers[page] ?? null;
      set({ page, tower: have, status: have ? 'ready' : 'loading', error: null });
      await fetchPage(page, dataVersion);
    },
    prefetch: async (page, dataVersion) => {
      fromCache(page);
      if (!get().towers[page]) await fetchPage(page, dataVersion);
    },
  };
});

export function findBuff(tower: MatrixTower | null, id: string | null): MatrixBuff | null {
  if (!tower || !id) return null;
  return tower.buffs.find((b) => b.id === id) ?? null;
}
