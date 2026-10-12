/**
 * Parses src/data/resonators.txt, the hand-editable resonator list.
 * See the comment block at the top of that file for the format.
 */
import rosterText from '../data/resonators.txt?raw';

export const ELEMENT_IDS: Record<string, number> = {
  glacio: 1,
  fusion: 2,
  electro: 3,
  aero: 4,
  spectro: 5,
  havoc: 6,
};

export const WEAPON_IDS: Record<string, number> = {
  broadblade: 1,
  sword: 2,
  pistols: 3,
  pistol: 3,
  gauntlets: 4,
  gauntlet: 4,
  rectifier: 5,
};

export interface RosterEntry {
  name: string;
  /** Position in the file; 0 is the newest. */
  order: number;
  kind: 'single' | 'dual' | 'element';
  /** Mode names for dual, element names for element-switching characters. */
  modes: string[];
  /** Element ids; several for element-switching characters. */
  elements: number[];
  weaponType: number;
}

export const rosterKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

const split = (s: string) =>
  s
    .split('/')
    .map((x) => x.trim())
    .filter(Boolean);

export function parseRoster(text: string): RosterEntry[] {
  const out: RosterEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const [name = '', mode = '', element = '', weapon = ''] = line.split(';').map((s) => s.trim());
    if (!name) continue;
    const elementNames = split(element).filter((e) => ELEMENT_IDS[e.toLowerCase()]);
    const elements = elementNames.map((e) => ELEMENT_IDS[e.toLowerCase()]);
    const modeList = split(mode);
    let kind: RosterEntry['kind'] = 'single';
    let modes: string[] = [];
    if (elements.length > 1 || mode.toLowerCase() === 'element') {
      kind = 'element';
      modes = elementNames.map((e) => e[0].toUpperCase() + e.slice(1).toLowerCase());
    } else if (modeList.length >= 2) {
      kind = 'dual';
      modes = modeList;
    }
    out.push({ name, order: out.length, kind, modes, elements, weaponType: WEAPON_IDS[weapon.toLowerCase()] ?? 0 });
  }
  return out;
}

export const ROSTER: RosterEntry[] = parseRoster(rosterText);
