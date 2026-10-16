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

export interface MatrixTower {
  page: number;
  patch: string;
  name: string;
  phase: string;
  buffs: MatrixBuff[];
}

interface Patch {
  major: number;
  minor: number;
}

export interface MatrixConfig {
  patch: string;
  page: number;
}

const parsePatch = (s: string): Patch | null => {
  const m = /^(\d+)\.(\d+)$/.exec(s.trim());
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
};

export function parseMatrixConfig(text: string): MatrixConfig {
  let patch: Patch | null = null;
  let patchText = '';
  let step = 2;
  const anchors: Array<Patch & { page: number }> = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (key === 'patch') {
      patch = parsePatch(value);
      patchText = value;
    } else if (key === 'step') {
      step = Number(value) || step;
    } else if (key === 'anchor') {
      const [p, page] = value.split(':');
      const at = parsePatch(p ?? '');
      if (at && Number(page)) anchors.push({ ...at, page: Number(page) });
    }
  }

  if (!patch) throw new Error('matrix.txt: no valid "patch = X.Y" line.');
  const p = patch;
  const sameMajor = anchors.filter((a) => a.major === p.major).sort((a, b) => a.minor - b.minor);
  if (!sameMajor.length) throw new Error(`matrix.txt: no anchor for patch ${p.major}.x.`);
  // Closest anchor at or below the patch; otherwise the lowest one above it.
  const anchor = [...sameMajor].reverse().find((a) => a.minor <= p.minor) ?? sameMajor[0];
  return { patch: patchText, page: anchor.page + step * (p.minor - anchor.minor) };
}

export const MATRIX = parseMatrixConfig(matrixText);

export const towerPageUrl = (page: number) => `https://ww.nanoka.cc/newtower/${page}/`;

const cacheKey = (page: number) => `wtb:matrix:${page}`;

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
        patch: MATRIX.patch,
        name: raw.name ?? '',
        phase: raw.cycle?.name ?? '',
        buffs: Object.entries<any>(raw.buffs ?? {}).map(([id, b]) => ({
          id,
          name: b.name ?? '',
          desc: fillParams(b.desc ?? '', b.param ?? []),
          icon: asset(b.icon),
        })),
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(`Couldn't load Matrix page ${page} (${lastError instanceof Error ? lastError.message : lastError}).`);
}

const fillParams = (desc: string, params: string[]) => desc.replace(/\{(\d+)\}/g, (_, i) => params[Number(i)] ?? '');

interface MatrixState {
  tower: MatrixTower | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  load: (dataVersion: string) => Promise<void>;
}

export const useMatrix = create<MatrixState>()((set, get) => ({
  tower: null,
  status: 'idle',
  error: null,
  load: async (dataVersion) => {
    if (get().status === 'loading' || get().tower?.page === MATRIX.page) return;
    try {
      const cached = localStorage.getItem(cacheKey(MATRIX.page));
      if (cached) set({ tower: JSON.parse(cached), status: 'ready' });
    } catch {
      /* no cache */
    }
    set({ status: 'loading', error: null });
    try {
      const tower = await fetchTower(MATRIX.page, [...new Set([dataVersion, MATRIX.patch])]);
      try {
        localStorage.setItem(cacheKey(MATRIX.page), JSON.stringify(tower));
      } catch {
        /* storage full */
      }
      set({ tower, status: 'ready' });
    } catch (e) {
      // Keep a cached copy usable if the refresh fails.
      set((st) => ({ status: st.tower ? 'ready' : 'error', error: e instanceof Error ? e.message : String(e) }));
    }
  },
}));

export function findBuff(tower: MatrixTower | null, id: string | null): MatrixBuff | null {
  if (!tower || !id) return null;
  return tower.buffs.find((b) => b.id === id) ?? null;
}
