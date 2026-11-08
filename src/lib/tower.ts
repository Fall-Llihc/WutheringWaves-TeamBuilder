/**
 * Tower of Adversity: which cycle is active, its floors, and the cost plan.
 *
 * src/data/tower.txt names one known cycle and its start date; cycles last a
 * fixed number of days, so the active one is counted from it. The loaded data
 * carries the cycle's own begin/end dates, and those win if the count is off.
 *
 * Cost: every resonator has a fixed amount (10) for the whole tower. Each
 * floor a resonator clears takes that floor's cost from it (4 on the main
 * floors, 5 on Hazard Tower floors). All Rovers share one pool, like Vigor.
 */
import { create } from 'zustand';
import towerText from '../data/tower.txt?raw';
import { asset, DATA_HOST, ELEMENTS, findCharacter, sameCharacter, UNKNOWN_ID, type Character, type GameData } from './data';
import { isRover, vigorGroup } from './matrixPlan';
import { newTeam, type Team } from './store';

export interface TowerConfig {
  anchorId: number;
  /** Local midnight of the anchor cycle's first day. */
  anchorStart: number;
  days: number;
  cost: number;
  /** Planned floors as "area-floor", in display order. */
  floors: string[];
}

const DAY = 86_400_000;
const parseDay = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : NaN;
};

export function parseTowerConfig(text: string): TowerConfig {
  const cfg: TowerConfig = { anchorId: 0, anchorStart: NaN, days: 28, cost: 10, floors: [] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (key === 'anchor') {
      const [id, day] = value.split(':');
      cfg.anchorId = Number(id) || 0;
      cfg.anchorStart = parseDay(day ?? '');
    } else if (key === 'days') cfg.days = Number(value) || cfg.days;
    else if (key === 'cost') cfg.cost = Number(value) || cfg.cost;
    else if (key === 'floors') cfg.floors = value.split(',').map((f) => f.trim()).filter((f) => /^\d+-\d+$/.test(f));
  }
  if (!cfg.anchorId || !Number.isFinite(cfg.anchorStart)) throw new Error('tower.txt: no valid "anchor = <cycle> : YYYY-MM-DD" line.');
  if (!cfg.floors.length) cfg.floors = ['1-4', '2-1', '2-2', '2-3', '2-4', '3-4'];
  return cfg;
}

export const TOWER = parseTowerConfig(towerText);

/** Cycle running at a moment, counted from the anchor. */
export const cycleAt = (when: number, cfg: TowerConfig = TOWER) => cfg.anchorId + Math.floor((when - cfg.anchorStart) / (cfg.days * DAY));

export const towerPageUrl = (id: number) => `https://ww.nanoka.cc/tower/${id}/`;

/** Board key the store keeps a cycle's floor teams under. */
export const towerBoard = (id: number) => `tower:${id}`;
export const isTowerBoard = (board: string) => board.startsWith('tower:');

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

export interface TowerEnemy {
  name: string;
  icon: string;
  level: number;
  /** Element ids; an enemy takes less damage from its own element. */
  elements: number[];
}

/** Text split into plain runs and element-coloured runs (from <color=Fire>…</color>). */
export type RichText = Array<{ text: string; el?: number }>;

export interface TowerFloor {
  /** "area-floor", e.g. "2-3". */
  key: string;
  area: number;
  floor: number;
  areaName: string;
  /** Cost each resonator pays to clear this floor. */
  cost: number;
  recommend: number[];
  enemies: TowerEnemy[];
  buffs: Array<{ icon: string; desc: RichText }>;
}

export interface TowerCycle {
  id: number;
  /** YYYY-MM-DD, as the data gives them. */
  begin: string;
  end: string;
  floors: Record<string, TowerFloor>;
}

const ELEMENT_BY_TAG: Record<string, number> = Object.fromEntries(Object.entries(ELEMENTS).map(([id, e]) => [e.icon.toLowerCase(), Number(id)]));

export function richText(desc: string): RichText {
  const out: RichText = [];
  const re = /<color=([^>]+)>(.*?)<\/color>/g;
  let at = 0;
  for (let m = re.exec(desc); m; m = re.exec(desc)) {
    if (m.index > at) out.push({ text: desc.slice(at, m.index) });
    out.push({ text: m[2], el: ELEMENT_BY_TAG[m[1].toLowerCase()] });
    at = m.index + m[0].length;
  }
  if (at < desc.length) out.push({ text: desc.slice(at) });
  return out.map((r) => ({ ...r, text: r.text.replace(/<[^>]+>/g, '') }));
}

/** Fallback when a floor is missing from the data: Hazard Tower floors cost 5, others their floor number. */
export const defaultFloorCost = (key: string) => {
  const [area, floor] = key.split('-').map(Number);
  return area === 2 ? 5 : floor || 4;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
async function fetchCycle(id: number, version: string): Promise<TowerCycle> {
  const res = await fetch(`${DATA_HOST}/ww/${version}/en/tower/${id}.json`);
  if (!res.ok) throw new Error(res.status === 404 ? 'not published yet' : String(res.status));
  const raw: any = await res.json();
  const floors: Record<string, TowerFloor> = {};
  for (const [area, a] of Object.entries<any>(raw.area ?? {})) {
    for (const [floor, f] of Object.entries<any>(a?.floor ?? {})) {
      const key = `${area}-${floor}`;
      floors[key] = {
        key,
        area: Number(area),
        floor: Number(floor),
        areaName: f.area_name ?? '',
        cost: Number(f.cost) || defaultFloorCost(key),
        recommend: (f.recommend_element ?? []).map(Number).filter((n: number) => ELEMENTS[n]),
        enemies: Object.values<any>(f.monsters ?? {}).map((m) => ({
          name: m.name ?? '',
          icon: asset(m.icon),
          level: Number(m.level) || 0,
          elements: (m.element_array ?? [m.element]).map(Number).filter((n: number) => ELEMENTS[n]),
        })),
        buffs: Object.values<any>(f.buffs ?? {}).map((b) => ({ icon: asset(b.icon), desc: richText(String(b.desc ?? '')) })),
      };
    }
  }
  if (!Object.keys(floors).length) throw new Error('no floors in the data');
  return { id, begin: raw.begin ?? '', end: raw.end ?? '', floors };
}

// Bump the prefix whenever TowerCycle changes shape, so old cached copies are refetched.
const cacheKey = (id: number) => `wtb:tower1:${id}`;

interface TowerState {
  /** Cycle running now: counted from tower.txt, then corrected by the loaded dates. */
  activeId: number;
  cycles: Record<number, TowerCycle>;
  status: Record<number, 'loading' | 'ready' | 'error'>;
  errors: Record<number, string>;
  load: (id: number, version: string) => Promise<void>;
  /** Loads the active cycle and the one after it, fixing the active id from the dates. */
  loadActive: (version: string) => Promise<void>;
}

export const useTower = create<TowerState>()((set, get) => ({
  activeId: cycleAt(Date.now()),
  cycles: {},
  status: {},
  errors: {},
  load: async (id, version) => {
    const st = get();
    if (st.status[id] === 'loading' || (st.status[id] === 'ready' && st.cycles[id])) return;
    try {
      const cached = localStorage.getItem(cacheKey(id));
      if (cached) set((s) => ({ cycles: { ...s.cycles, [id]: JSON.parse(cached) } }));
    } catch {
      /* no cache */
    }
    set((s) => ({ status: { ...s.status, [id]: 'loading' } }));
    try {
      const cycle = await fetchCycle(id, version);
      try {
        localStorage.setItem(cacheKey(id), JSON.stringify(cycle));
      } catch {
        /* storage full */
      }
      set((s) => ({ cycles: { ...s.cycles, [id]: cycle }, status: { ...s.status, [id]: 'ready' } }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      set((s) => ({ status: { ...s.status, [id]: s.cycles[id] ? 'ready' : 'error' }, errors: { ...s.errors, [id]: msg } }));
    }
  },
  loadActive: async (version) => {
    // Walk at most a few cycles if the counted id disagrees with the data's dates.
    for (let step = 0; step < 4; step++) {
      const id = get().activeId;
      await get().load(id, version);
      const c = get().cycles[id];
      if (!c) break;
      const now = Date.now();
      const begin = parseDay(c.begin);
      const end = parseDay(c.end);
      if (Number.isFinite(end) && now >= end) set({ activeId: id + 1 });
      else if (Number.isFinite(begin) && now < begin) set({ activeId: id - 1 });
      else break;
    }
    get().load(get().activeId + 1, version);
  },
}));

/* ------------------------------------------------------------------ */
/* Floor teams                                                         */
/* ------------------------------------------------------------------ */

const AREA_NAMES: Record<number, string> = { 1: 'Resonant Tower', 2: 'Hazard Tower', 3: 'Echoing Tower' };

export function floorLabel(key: string, floor?: TowerFloor) {
  const [area, n] = key.split('-').map(Number);
  return { short: key, area: floor?.areaName || AREA_NAMES[area] || `Area ${area}`, floor: n };
}

/** One team per planned floor, in tower.txt order. */
export function floorTeams(): Team[] {
  return TOWER.floors.map((key, i) => {
    const t = newTeam(i + 1);
    const l = floorLabel(key);
    return { ...t, name: `${l.area} ${l.floor}`, floor: key };
  });
}

/** Keeps a board to exactly the planned floors, in order: missing floors are added, unknown ones dropped. */
export function normalizeFloorTeams(teams: Team[]): Team[] {
  const fresh = floorTeams();
  return fresh.map((f) => {
    const have = teams.find((t) => t.floor === f.floor);
    return have ? { ...have, floor: f.floor } : f;
  });
}

/* ------------------------------------------------------------------ */
/* Cost                                                                */
/* ------------------------------------------------------------------ */

export const floorCost = (key: string | undefined, cycle: TowerCycle | null | undefined) =>
  key ? cycle?.floors[key]?.cost ?? defaultFloorCost(key) : 0;

/** Cost spent per pool (character id, or 'rover') over every floor team. */
export function costUsage(teams: Team[], cycle: TowerCycle | null | undefined): Record<string, number> {
  const used: Record<string, number> = {};
  for (const t of teams) {
    const cost = floorCost(t.floor, cycle);
    const groups = new Set(t.slots.map((s) => s.charId).filter((id): id is string => !!id && id !== UNKNOWN_ID).map(vigorGroup));
    for (const g of groups) used[g] = (used[g] ?? 0) + cost;
  }
  return used;
}

/**
 * Whether a character may join a floor team. Already in the team (or another
 * Rover there) means no extra cost; otherwise it needs the floor's cost left.
 * Returns an error message, or null when it fits.
 */
export function towerPlacementError(
  data: GameData | null,
  teams: Team[],
  cycle: TowerCycle | null | undefined,
  teamId: string,
  charId: string,
  replacingIndex: number | null,
): string | null {
  if (charId === UNKNOWN_ID) return null;
  const team = teams.find((t) => t.id === teamId);
  const char: Character | null = findCharacter(data, charId);
  if (!team || !char) return null;
  const others = team.slots.filter((_, i) => i !== replacingIndex);
  if (others.some((s) => sameCharacter(s.charId, charId))) {
    return isRover(charId) ? 'That floor already has a Rover.' : 'That floor already has this character.';
  }
  const replaced = replacingIndex === null ? null : team.slots[replacingIndex]?.charId;
  if (replaced && vigorGroup(replaced) === vigorGroup(charId)) return null;
  const need = floorCost(team.floor, cycle);
  const used = costUsage(teams, cycle)[vigorGroup(charId)] ?? 0;
  const left = TOWER.cost - used;
  if (left >= need) return null;
  const who = isRover(charId) ? 'Rover' : char.name;
  return `${who} has ${left} cost left; floor ${team.floor} needs ${need}.`;
}
