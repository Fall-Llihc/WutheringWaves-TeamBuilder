/**
 * Game data loader.
 *
 * Two sources are merged:
 * - src/data/resonators.txt (see roster.ts): which resonators exist, their
 *   order (newest first), modes, element and weapon. Hand-editable.
 * - The public nanoka.cc static data host: pictures, rarity, weapons and
 *   Sonata sets. Cached in localStorage per game version so the app keeps
 *   working offline.
 *
 * A resonator the API has but the roster file doesn't is still shown (at the
 * top, as the newest), with its modes read from its skill text. A resonator
 * only in the roster file is shown without art until the API catches up.
 */
import { ROSTER, rosterKey, type RosterEntry } from './roster';

export const DATA_HOST = 'https://static.nanoka.cc';
const ASSET_BASE = `${DATA_HOST}/assets/ww/`;

export const ELEMENTS: Record<number, { name: string; color: string; icon: string }> = {
  1: { name: 'Glacio', color: '#8fc4dc', icon: 'Ice' },
  2: { name: 'Fusion', color: '#dc8f74', icon: 'Fire' },
  3: { name: 'Electro', color: '#b09ad8', icon: 'Thunder' },
  4: { name: 'Aero', color: '#8ccfb4', icon: 'Wind' },
  5: { name: 'Spectro', color: '#dccb8a', icon: 'Light' },
  6: { name: 'Havoc', color: '#c98aa6', icon: 'Dark' },
};

export const elementIcon = (id: number) =>
  ELEMENTS[id] ? `${ASSET_BASE}UIResources/Common/Image/IconElement/T_IconElement${ELEMENTS[id].icon}2.webp` : '';

export const elementByName = (name: string | null | undefined) =>
  Number(Object.entries(ELEMENTS).find(([, e]) => e.name.toLowerCase() === name?.toLowerCase())?.[0] ?? 0);

export const WEAPON_TYPES: Record<number, string> = {
  1: 'Broadblade',
  2: 'Sword',
  3: 'Pistols',
  4: 'Gauntlets',
  5: 'Rectifier',
};

export type ModeKind = 'single' | 'dual' | 'element';

export interface Character {
  id: string;
  name: string;
  rarity: number;
  /** Default element; element-switching characters follow their selected mode. */
  element: number;
  /** Every element this character can be (used by the element filter). */
  elements: number[];
  weaponType: number;
  icon: string;
  portrait: string;
  /** Sort position, lower is newer. */
  order: number;
  kind: ModeKind;
  /** Dual-mode names or element names, depending on `kind`. Empty for single. */
  modes: string[];
  /** False when the roster file doesn't list it yet; modes are then auto-detected. */
  listed: boolean;
}

export interface Weapon {
  id: string;
  name: string;
  rarity: number;
  type: number;
  icon: string;
}

export interface Sonata {
  id: string;
  name: string;
  icon: string;
}

/** Old or temporary character ids and what they now point to. */
export type Aliases = Record<string, { id: string; mode?: string }>;

export interface GameData {
  version: string;
  characters: Record<string, Character>;
  weapons: Record<string, Weapon>;
  sonatas: Record<string, Sonata>;
  aliases: Aliases;
}

/** Placeholder id for an "Unknown / TBA" character slot. */
export const UNKNOWN_ID = 'unknown';

/**
 * Whether two slots hold the same character for team purposes. Both Rovers
 * (male and female) are one character, so a team can only have one of them.
 * TBA slots never clash.
 */
export function sameCharacter(a: string | null, b: string | null): boolean {
  if (!a || !b || a === UNKNOWN_ID || b === UNKNOWN_ID) return false;
  const group = (id: string) => (id.startsWith('rover-') ? 'rover' : id);
  return group(a) === group(b);
}

/** Converts a game path like /Game/Aki/UI/UIResources/.../T_X.T_X to a hosted .webp URL. */
export function asset(path: string | undefined | null): string {
  if (!path) return '';
  const clean = path.replace(/^\/Game\/Aki\/UI\//, '').replace(/\.[^/]*$/, '');
  return `${ASSET_BASE}${clean}.webp`;
}

const slug = (name: string) => rosterKey(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const CACHE_KEY = 'wtb:raw';
const MODE_CACHE_KEY = 'wtb:modes2';

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: data simply won't be cached */
  }
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface RawData {
  version: string;
  chars: Record<string, any>;
  weapons: Record<string, any>;
  sonatas: any;
}

const isRoverName = (name: string) => /^Rover\b/i.test(name);
const roverGender = (text: string) => (/female/i.test(text) ? 'female' : /male/i.test(text) ? 'male' : null);

function normalize(raw: RawData, roster: RosterEntry[]): GameData {
  const characters: Record<string, Character> = {};
  const aliases: Aliases = {};

  // API characters by name, and the per-element Rover entries by gender.
  const apiByName = new Map<string, { id: string; c: any }>();
  const rovers: Record<'male' | 'female', Array<{ id: string; c: any }>> = { male: [], female: [] };
  for (const [id, c] of Object.entries<any>(raw.chars)) {
    const name: string = c.en ?? id;
    if (isRoverName(name)) {
      const g = /zhujuenan/i.test(c.background ?? '') ? 'male' : 'female';
      rovers[g].push({ id, c });
      aliases[id] = { id: `rover-${g}`, mode: ELEMENTS[c.element]?.name };
    } else {
      apiByName.set(rosterKey(name), { id, c });
    }
  }

  const fromApi = (id: string, c: any, extra: Partial<Character>): Character => ({
    id,
    name: c.en ?? id,
    rarity: c.rank ?? 4,
    element: c.element,
    elements: [c.element],
    weaponType: c.weapon,
    icon: asset(c.icon),
    portrait: asset(c.background || c.icon),
    order: 0,
    kind: 'single',
    modes: [],
    listed: false,
    ...extra,
  });

  const used = new Set<string>();
  const roverDone = new Set<string>();
  for (const r of roster) {
    const listed = { order: r.order, kind: r.kind, modes: r.modes, listed: true };
    const g = isRoverName(r.name) ? roverGender(r.name) ?? 'male' : null;
    if (g) {
      const variants = rovers[g];
      const base = variants.find((v) => v.c.element === 5) ?? variants[0];
      const id = `rover-${g}`;
      roverDone.add(g);
      const elements = r.elements.length ? r.elements : variants.map((v) => v.c.element);
      characters[id] = base
        ? fromApi(id, base.c, { ...listed, name: r.name, element: elements[0], elements, weaponType: r.weaponType || base.c.weapon })
        : placeholder(id, r);
      continue;
    }
    const hit = apiByName.get(rosterKey(r.name));
    if (hit) {
      used.add(hit.id);
      characters[hit.id] = fromApi(hit.id, hit.c, {
        ...listed,
        elements: r.kind === 'element' && r.elements.length ? r.elements : [hit.c.element],
      });
      aliases[`x-${slug(r.name)}`] = { id: hit.id };
    } else {
      const id = `x-${slug(r.name)}`;
      characters[id] = placeholder(id, r);
    }
  }

  // Characters the roster file doesn't list yet: newest first, above everything.
  const unlisted = [...apiByName.values()].filter((v) => !used.has(v.id)).sort((a, b) => Number(b.id) - Number(a.id));
  unlisted.forEach((v, i) => {
    characters[v.id] = fromApi(v.id, v.c, { order: -unlisted.length + i });
  });
  for (const g of ['male', 'female'] as const) {
    if (roverDone.has(g) || !rovers[g].length) continue;
    const elements = rovers[g].map((v) => v.c.element);
    const id = `rover-${g}`;
    const name = `Rover (${g === 'male' ? 'Male' : 'Female'})`;
    characters[id] = fromApi(id, rovers[g][0].c, {
      name,
      order: roster.length + (g === 'male' ? 1 : 0),
      kind: 'element',
      element: elements[0],
      elements,
      modes: elements.map((e) => ELEMENTS[e]?.name ?? ''),
    });
  }

  const weapons: Record<string, Weapon> = {};
  for (const [id, w] of Object.entries<any>(raw.weapons)) {
    weapons[id] = { id, name: w.en ?? id, rarity: w.rank ?? 1, type: w.type, icon: asset(w.icon) };
  }

  const sonatas: Record<string, Sonata> = {};
  const sonataList = Array.isArray(raw.sonatas) ? raw.sonatas : Object.values<any>(raw.sonatas);
  for (const s of sonataList) {
    const id = String(s.id);
    sonatas[id] = { id, name: s.name ?? id, icon: asset(s.icon) };
  }
  return { version: raw.version, characters, weapons, sonatas, aliases };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function placeholder(id: string, r: RosterEntry): Character {
  return {
    id,
    name: r.name,
    rarity: 5,
    element: r.elements[0] ?? 0,
    elements: r.elements,
    weaponType: r.weaponType,
    icon: '',
    portrait: '',
    order: r.order,
    kind: r.kind,
    modes: r.modes,
    listed: true,
  };
}

export async function loadGameData(): Promise<{ data: GameData; fromCache: boolean }> {
  const cached = readJSON<RawData>(CACHE_KEY);
  try {
    const manifest = await getJSON<{ ww: { latest: string } }>(`${DATA_HOST}/manifest.json`);
    const version = manifest.ww.latest;
    if (cached && cached.version === version) return { data: normalize(cached, ROSTER), fromCache: true };
    const base = `${DATA_HOST}/ww/${version}`;
    const [chars, weapons, sonatas] = await Promise.all([
      getJSON<RawData['chars']>(`${base}/character.json`),
      getJSON<RawData['weapons']>(`${base}/weapon.json`),
      getJSON(`${base}/en/sonata.json`),
    ]);
    const raw: RawData = { version, chars, weapons, sonatas };
    writeJSON(CACHE_KEY, raw);
    return { data: normalize(raw, ROSTER), fromCache: false };
  } catch (err) {
    if (cached) return { data: normalize(cached, ROSTER), fromCache: true };
    throw err;
  }
}

/** Looks a character up by id, following aliases (old Rover ids, roster-only ids). */
export function findCharacter(data: GameData | null | undefined, id: string | null | undefined): Character | null {
  if (!data || !id) return null;
  return data.characters[id] ?? (data.aliases[id] ? data.characters[data.aliases[id].id] ?? null : null);
}

/** The mode a slot is in: its saved mode when valid, otherwise the character's default. */
export function activeMode(modes: string[], saved: string | null | undefined): string | null {
  if (modes.length < 2) return null;
  return saved && modes.includes(saved) ? saved : modes[0];
}

/** Element shown for a slot; element-switching characters follow their mode. */
export function slotElement(c: Character, mode: string | null): number {
  if (c.kind === 'element' && mode) return elementByName(mode) || c.element;
  return c.element;
}

/* ------------------------------------------------------------------ */
/* Auto-detected modes for characters the roster file doesn't list yet */
/* ------------------------------------------------------------------ */

/**
 * A dual-mode resonator's kit text names each mode as
 * "Resonance Mode - <name>". Only used for unlisted characters; the roster
 * file is the authority for everyone else.
 */
let modeCache: Record<string, string[]> = readJSON<Record<string, string[]>>(MODE_CACHE_KEY) ?? {};
const inflight = new Map<string, Promise<string[]>>();

export function getCachedModes(id: string): string[] | undefined {
  return modeCache[id];
}

export async function fetchModes(id: string, version: string): Promise<string[]> {
  if (modeCache[id]) return modeCache[id];
  const existing = inflight.get(id);
  if (existing) return existing;
  const p = (async () => {
    try {
      const res = await fetch(`${DATA_HOST}/ww/${version}/en/character/${id}.json`);
      if (!res.ok) throw new Error(String(res.status));
      const text = await res.text();
      const modes: string[] = [];
      for (const m of text.matchAll(/Resonance Mode - ([^<"\\]+?)</g)) {
        const name = m[1].trim();
        if (!modes.includes(name)) modes.push(name);
      }
      const result = modes.length >= 2 ? modes : [];
      modeCache = { ...modeCache, [id]: result };
      writeJSON(MODE_CACHE_KEY, modeCache);
      return result;
    } catch {
      return [];
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, p);
  return p;
}
