import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Slot {
  /** Character id, 'unknown' for a TBA slot, or null when empty. */
  charId: string | null;
  /** Sequence (resonance chain) 0–6. */
  seq: number;
  weaponId: string | null;
  /** Weapon rank (refinement) 1–5. */
  rank: number;
  sonataId: string | null;
  /** Selected combat mode for dual-mode characters, e.g. "Tune Rupture". */
  mode: string | null;
}

export interface Team {
  id: string;
  name: string;
  notes: string;
  /** Included in the image export. */
  include: boolean;
  slots: [Slot, Slot, Slot];
}

export interface SlotRef {
  teamId: string;
  index: number;
}

export type ExportFormat = 'png' | 'jpg';

export interface ExportSettings {
  format: ExportFormat;
  title: string;
  showNotes: boolean;
  showNames: boolean;
}

export const emptySlot = (): Slot => ({ charId: null, seq: 0, weaponId: null, rank: 1, sonataId: null, mode: null });

const uid = () => Math.random().toString(36).slice(2, 10);

export const newTeam = (n: number): Team => ({
  id: uid(),
  name: `Team ${n}`,
  notes: '',
  include: true,
  slots: [emptySlot(), emptySlot(), emptySlot()],
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));

/** Coerces imported/unknown data into valid teams. */
export function sanitizeTeams(input: unknown): Team[] {
  if (!Array.isArray(input)) throw new Error('No teams found in this file.');
  return input.map((t, i) => {
    const raw = (t ?? {}) as Partial<Team>;
    const slots = Array.from({ length: 3 }, (_, k) => {
      const s = (raw.slots?.[k] ?? {}) as Partial<Slot>;
      return {
        charId: typeof s.charId === 'string' ? s.charId : null,
        seq: clamp(s.seq ?? 0, 0, 6),
        weaponId: typeof s.weaponId === 'string' ? s.weaponId : null,
        rank: clamp(s.rank ?? 1, 1, 5),
        sonataId: typeof s.sonataId === 'string' ? s.sonataId : null,
        mode: typeof s.mode === 'string' ? s.mode : null,
      };
    }) as Team['slots'];
    return {
      id: uid(),
      name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : `Team ${i + 1}`,
      notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 2000) : '',
      include: raw.include !== false,
      slots,
    };
  });
}

interface State {
  teams: Team[];
  exportSettings: ExportSettings;
  addTeam: () => void;
  removeTeam: (id: string) => void;
  duplicateTeam: (id: string) => void;
  moveTeam: (id: string, dir: -1 | 1) => void;
  updateTeam: (id: string, patch: Partial<Omit<Team, 'id' | 'slots'>>) => void;
  updateSlot: (ref: SlotRef, patch: Partial<Slot>) => void;
  /** Places a character; clears weapon if the new character can't use it. */
  setCharacter: (ref: SlotRef, charId: string | null, keepWeapon: boolean) => void;
  clearSlot: (ref: SlotRef) => void;
  /** Drag and drop: swaps when the target holds a character, otherwise moves. */
  dropSlot: (from: SlotRef, to: SlotRef) => string | null;
  setAllIncluded: (v: boolean) => void;
  importTeams: (teams: Team[], mode: 'replace' | 'append') => void;
  resetAll: () => void;
  setExportSettings: (patch: Partial<ExportSettings>) => void;
}

function mapSlot(teams: Team[], ref: SlotRef, fn: (s: Slot) => Slot): Team[] {
  return teams.map((t) =>
    t.id !== ref.teamId ? t : { ...t, slots: t.slots.map((s, i) => (i === ref.index ? fn(s) : s)) as Team['slots'] },
  );
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      teams: [newTeam(1)],
      exportSettings: { format: 'png', title: '', showNotes: true, showNames: true },

      addTeam: () => set((st) => ({ teams: [...st.teams, newTeam(st.teams.length + 1)] })),

      removeTeam: (id) =>
        set((st) => {
          const teams = st.teams.filter((t) => t.id !== id);
          return { teams: teams.length ? teams : [newTeam(1)] };
        }),

      duplicateTeam: (id) =>
        set((st) => {
          const i = st.teams.findIndex((t) => t.id === id);
          if (i < 0) return st;
          const src = st.teams[i];
          const copy: Team = {
            ...src,
            id: uid(),
            name: `${src.name} (copy)`,
            slots: src.slots.map((s) => ({ ...s })) as Team['slots'],
          };
          const teams = [...st.teams];
          teams.splice(i + 1, 0, copy);
          return { teams };
        }),

      moveTeam: (id, dir) =>
        set((st) => {
          const i = st.teams.findIndex((t) => t.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= st.teams.length) return st;
          const teams = [...st.teams];
          [teams[i], teams[j]] = [teams[j], teams[i]];
          return { teams };
        }),

      updateTeam: (id, patch) => set((st) => ({ teams: st.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

      updateSlot: (ref, patch) => set((st) => ({ teams: mapSlot(st.teams, ref, (s) => ({ ...s, ...patch })) })),

      setCharacter: (ref, charId, keepWeapon) =>
        set((st) => ({
          teams: mapSlot(st.teams, ref, (s) =>
            s.charId === charId
              ? s
              : {
                  ...s,
                  charId,
                  seq: 0,
                  mode: null,
                  weaponId: keepWeapon ? s.weaponId : null,
                  rank: keepWeapon ? s.rank : 1,
                },
          ),
        })),

      clearSlot: (ref) => set((st) => ({ teams: mapSlot(st.teams, ref, () => emptySlot()) })),

      dropSlot: (from, to) => {
        if (from.teamId === to.teamId && from.index === to.index) return null;
        const { teams } = get();
        const fromTeam = teams.find((t) => t.id === from.teamId);
        const toTeam = teams.find((t) => t.id === to.teamId);
        if (!fromTeam || !toTeam) return null;
        const a = fromTeam.slots[from.index];
        const b = toTeam.slots[to.index];
        if (!a.charId) return null;

        // Moving across teams must not leave a team with the same character twice.
        if (from.teamId !== to.teamId) {
          const dupInTarget = toTeam.slots.some((s, i) => i !== to.index && s.charId === a.charId && a.charId !== 'unknown');
          const dupInSource =
            b.charId && fromTeam.slots.some((s, i) => i !== from.index && s.charId === b.charId && b.charId !== 'unknown');
          if (dupInTarget || dupInSource) return 'That team already has this character.';
        }

        const swap = !!b.charId;
        set((st) => {
          let next = mapSlot(st.teams, to, () => ({ ...a }));
          next = mapSlot(next, from, () => (swap ? { ...b } : emptySlot()));
          return { teams: next };
        });
        return null;
      },

      setAllIncluded: (v) => set((st) => ({ teams: st.teams.map((t) => ({ ...t, include: v })) })),

      importTeams: (incoming, mode) =>
        set((st) => ({ teams: mode === 'replace' ? (incoming.length ? incoming : [newTeam(1)]) : [...st.teams, ...incoming] })),

      resetAll: () => set({ teams: [newTeam(1)] }),

      setExportSettings: (patch) => set((st) => ({ exportSettings: { ...st.exportSettings, ...patch } })),
    }),
    { name: 'wtb:teams', version: 1 },
  ),
);
