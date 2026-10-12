/**
 * Game data loader.
 *
 * Character, weapon and Sonata lists come from the public nanoka.cc static
 * data host (the same files ww.nanoka.cc uses). Lists are cached in
 * localStorage per game version so the app keeps working offline and new
 * characters show up automatically after a game update.
 */

export const DATA_HOST = 'https://static.nanoka.cc';
const ASSET_BASE = `${DATA_HOST}/assets/ww/`;

export type ElementId = 1 | 2 | 3 | 4 | 5 | 6;
export type WeaponTypeId = 1 | 2 | 3 | 4 | 5;

export const ELEMENTS: Record<number, { name: string; color: string }> = {
  1: { name: 'Glacio', color: '#5fc8ff' },
  2: { name: 'Fusion', color: '#ff7a45' },
  3: { name: 'Electro', color: '#b67cff' },
  4: { name: 'Aero', color: '#4fe0b0' },
  5: { name: 'Spectro', color: '#f5d76e' },
  6: { name: 'Havoc', color: '#e0559a' },
};

export const WEAPON_TYPES: Record<number, string> = {
  1: 'Broadblade',
  2: 'Sword',
  3: 'Pistols',
  4: 'Gauntlets',
  5: 'Rectifier',
};

export interface Character {
  id: string;
  name: string;
  rarity: number;
  element: number;
  weaponType: number;
  icon: string;
  portrait: string;
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

export interface GameData {
  version: string;
  characters: Record<string, Character>;
  weapons: Record<string, Weapon>;
  sonatas: Record<string, Sonata>;
}

/** Placeholder id for an "Unknown / TBA" character slot. */
export const UNKNOWN_ID = 'unknown';

/** Converts a game path like /Game/Aki/UI/UIResources/.../T_X.T_X to a hosted .webp URL. */
export function asset(path: string | undefined | null): string {
  if (!path) return '';
  const clean = path.replace(/^\/Game\/Aki\/UI\//, '').replace(/\.[^/]*$/, '');
  return `${ASSET_BASE}${clean}.webp`;
}

const CACHE_KEY = 'wtb:gamedata';
const MODE_CACHE_KEY = 'wtb:modes';

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
function normalize(version: string, rawChars: any, rawWeapons: any, rawSonatas: any): GameData {
  const characters: Record<string, Character> = {};
  for (const [id, c] of Object.entries<any>(rawChars)) {
    let name: string = c.en ?? id;
    // Rover appears once per gender per element; tell them apart.
    if (/^Rover/.test(name)) {
      const male = /zhujuenan/i.test(c.background ?? '');
      name = `${name} (${male ? 'M' : 'F'})`;
    }
    characters[id] = {
      id,
      name,
      rarity: c.rank ?? 4,
      element: c.element,
      weaponType: c.weapon,
      icon: asset(c.icon),
      portrait: asset(c.background || c.icon),
    };
  }

  const weapons: Record<string, Weapon> = {};
  for (const [id, w] of Object.entries<any>(rawWeapons)) {
    weapons[id] = { id, name: w.en ?? id, rarity: w.rank ?? 1, type: w.type, icon: asset(w.icon) };
  }

  const sonatas: Record<string, Sonata> = {};
  const sonataList = Array.isArray(rawSonatas) ? rawSonatas : Object.values<any>(rawSonatas);
  for (const s of sonataList) {
    const id = String(s.id);
    sonatas[id] = { id, name: s.name ?? id, icon: asset(s.icon) };
  }
  return { version, characters, weapons, sonatas };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function loadGameData(): Promise<{ data: GameData; fromCache: boolean }> {
  const cached = readJSON<GameData>(CACHE_KEY);
  try {
    const manifest = await getJSON<{ ww: { latest: string } }>(`${DATA_HOST}/manifest.json`);
    const version = manifest.ww.latest;
    if (cached && cached.version === version) return { data: cached, fromCache: true };
    const base = `${DATA_HOST}/ww/${version}`;
    const [chars, weapons, sonatas] = await Promise.all([
      getJSON(`${base}/character.json`),
      getJSON(`${base}/weapon.json`),
      getJSON(`${base}/en/sonata.json`),
    ]);
    const data = normalize(version, chars, weapons, sonatas);
    writeJSON(CACHE_KEY, data);
    return { data, fromCache: false };
  } catch (err) {
    if (cached) return { data: cached, fromCache: true };
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Combat modes                                                        */
/* ------------------------------------------------------------------ */

/**
 * Some resonators can play either side of the Tune system, e.g. Lynae can be
 * built as a Tune Rupture or a Tune Strain unit. The game marks this with two
 * combat-role tags. We read those tags from each character's detail file the
 * first time the character is used, then cache the result.
 */
const MODE_TAGS: Record<string, string> = {
  'Tune Rupture Response': 'Tune Rupture',
  'Tune Strain Response': 'Tune Strain',
};

/** Known dual-mode resonators, used until (or if) the detail file can't be fetched. */
const SEED_MODES: Record<string, string[]> = {
  '1509': ['Tune Rupture', 'Tune Strain'], // Lynae
  '1209': ['Tune Rupture', 'Tune Strain'], // Mornye
};

let modeCache: Record<string, string[]> = { ...SEED_MODES, ...(readJSON<Record<string, string[]>>(MODE_CACHE_KEY) ?? {}) };
const inflight = new Map<string, Promise<string[]>>();

export function getCachedModes(id: string): string[] | undefined {
  return modeCache[id];
}

export async function fetchModes(id: string, version: string): Promise<string[]> {
  const fresh = readJSON<Record<string, string[]>>(MODE_CACHE_KEY) ?? {};
  if (fresh[id]) return fresh[id];
  if (id === UNKNOWN_ID) return [];
  const existing = inflight.get(id);
  if (existing) return existing;
  const p = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = await getJSON<any>(`${DATA_HOST}/ww/${version}/en/character/${id}.json`);
      const names: string[] = Object.values<{ name: string }>(detail.tag ?? {}).map((t) => t.name);
      const modes = names.filter((n) => MODE_TAGS[n]).map((n) => MODE_TAGS[n]);
      const result = modes.length >= 2 ? modes : [];
      modeCache = { ...modeCache, [id]: result };
      writeJSON(MODE_CACHE_KEY, { ...fresh, [id]: result });
      return result;
    } catch {
      return modeCache[id] ?? [];
    } finally {
      inflight.delete(id);
    }
  })();
  inflight.set(id, p);
  return p;
}
