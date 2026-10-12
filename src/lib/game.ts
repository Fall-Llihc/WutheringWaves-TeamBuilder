import { create } from 'zustand';
import { fetchModes, findCharacter, getCachedModes, loadGameData, UNKNOWN_ID, type Character, type GameData } from './data';

interface GameState {
  data: GameData | null;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  fromCache: boolean;
  /** Auto-detected modes for characters the roster file doesn't list. */
  autoModes: Record<string, string[]>;
  load: () => Promise<void>;
  ensureModes: (charId: string | null) => void;
}

export const useGame = create<GameState>()((set, get) => ({
  data: null,
  status: 'loading',
  error: null,
  fromCache: false,
  autoModes: {},

  load: async () => {
    set({ status: 'loading', error: null });
    try {
      const { data, fromCache } = await loadGameData();
      set({ data, status: 'ready', fromCache });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },

  ensureModes: (charId) => {
    const { autoModes, data } = get();
    const c = findCharacter(data, charId);
    if (!c || c.listed || autoModes[c.id]) return;
    const cached = getCachedModes(c.id);
    if (cached) return set((st) => ({ autoModes: { ...st.autoModes, [c.id]: cached } }));
    if (!data) return;
    fetchModes(c.id, data.version).then((m) => set((st) => ({ autoModes: { ...st.autoModes, [c.id]: m } })));
  },
}));

export const UNKNOWN_CHARACTER: Character = {
  id: UNKNOWN_ID,
  name: 'Unknown / TBA',
  rarity: 5,
  element: 0,
  elements: [],
  weaponType: 0,
  icon: '',
  portrait: '',
  order: -1e6,
  kind: 'single',
  modes: [],
  listed: true,
};

export function lookupCharacter(data: GameData | null, id: string | null): Character | null {
  if (!id) return null;
  if (id === UNKNOWN_ID) return UNKNOWN_CHARACTER;
  return findCharacter(data, id);
}

export function useCharacter(id: string | null): Character | null {
  const data = useGame((s) => s.data);
  return lookupCharacter(data, id);
}

/** Modes a character can switch between (dual modes or elements). */
export function modesOf(c: Character | null, autoModes: Record<string, string[]>): string[] {
  if (!c) return [];
  if (c.modes.length >= 2) return c.modes;
  return c.listed ? [] : autoModes[c.id] ?? [];
}
