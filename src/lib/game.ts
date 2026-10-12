import { create } from 'zustand';
import { fetchModes, getCachedModes, loadGameData, UNKNOWN_ID, type Character, type GameData } from './data';

interface GameState {
  data: GameData | null;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  fromCache: boolean;
  modes: Record<string, string[]>;
  load: () => Promise<void>;
  ensureModes: (charId: string | null) => void;
}

export const useGame = create<GameState>()((set, get) => ({
  data: null,
  status: 'loading',
  error: null,
  fromCache: false,
  modes: {},

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
    if (!charId || charId === UNKNOWN_ID) return;
    const { modes, data } = get();
    if (modes[charId]) return;
    const cached = getCachedModes(charId);
    if (cached) set((st) => ({ modes: { ...st.modes, [charId]: cached } }));
    if (!data) return;
    fetchModes(charId, data.version).then((m) => set((st) => ({ modes: { ...st.modes, [charId]: m } })));
  },
}));

export const UNKNOWN_CHARACTER: Character = {
  id: UNKNOWN_ID,
  name: 'Unknown / TBA',
  rarity: 5,
  element: 0,
  weaponType: 0,
  icon: '',
  portrait: '',
};

export function useCharacter(id: string | null): Character | null {
  const data = useGame((s) => s.data);
  if (!id) return null;
  if (id === UNKNOWN_ID) return UNKNOWN_CHARACTER;
  return data?.characters[id] ?? null;
}
