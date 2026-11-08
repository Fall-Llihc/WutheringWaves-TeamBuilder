import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { sameCharacter } from './data';

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
  /** Matrix circuit buff picked for this team (nanoka buff id). */
  buffId?: string | null;
  /** Matrix points this team scored (or is expected to score). */
  score?: number;
  /** Tower of Adversity: the floor this team clears, as "area-floor". */
  floor?: string;
}

/**
 * Which planner is open. Each keeps its own teams: the plain builder, Matrix,
 * and one set of floor teams per Tower of Adversity cycle.
 */
export type Mode = 'builder' | 'matrix' | 'tower';

/** Board keys: 'builder', 'matrix', or 'tower:<cycle>'. */
const BOARD_KEY = /^(builder|matrix|tower:\d+)$/;
export const boardMode = (board: string): Mode => (board.startsWith('tower:') ? 'tower' : board === 'matrix' ? 'matrix' : 'builder');

export interface SlotRef {
  teamId: string;
  index: number;
}

export type TeamDropMode = 'swap' | 'before' | 'after';

export type ExportFormat = 'png' | 'jpg';

export interface ExportSettings {
  format: ExportFormat;
  title: string;
  showNotes: boolean;
  showNames: boolean;
  /** Weapon icon and name under each character. */
  showWeapons?: boolean;
  /** Echo (Sonata set) icon and name under each character. */
  showEchoes?: boolean;
  /** Sequence (S) and weapon rank (R) badges. */
  showRanks?: boolean;
}

export const emptySlot = (): Slot => ({ charId: null, seq: 0, weaponId: null, rank: 1, sonataId: null, mode: null });

const uid = () => Math.random().toString(36).slice(2, 10);

export const newTeam = (n: number): Team => ({
  id: uid(),
  name: `Team ${n}`,
  notes: '',
  include: true,
  slots: [emptySlot(), emptySlot(), emptySlot()],
  buffId: null,
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
      buffId: typeof raw.buffId === 'string' ? raw.buffId : null,
      score: clampScore(raw.score),
      ...(typeof raw.floor === 'string' && /^\d+-\d+$/.test(raw.floor) ? { floor: raw.floor } : {}),
    };
  });
}

/** Fresh ids and plain copies, for a team taken from one board into another. */
const cloneTeams = (teams: Team[]): Team[] =>
  teams.map((t) => ({ ...t, id: uid(), slots: t.slots.map((s) => ({ ...s })) as Team['slots'] }));

/** Matrix points: a whole number from 0 up to a generous ceiling. */
export const clampScore = (v: unknown) => Math.min(9_999_999, Math.max(0, Math.round(Number(v) || 0)));

/** Max Vigor a manual override may set. */
const clampVigor = (v: unknown) => Math.max(1, Math.min(9, Math.round(Number(v) || 1)));

const DEFAULT_EXPORT: ExportSettings = { format: 'png', title: '', showNotes: true, showNames: true, showWeapons: true, showEchoes: true, showRanks: true };

/** Everything a full backup holds besides the open board's teams. */
export interface Setup {
  matrixMode: boolean;
  /** Planner that was open; its teams are the backup's `teams`. */
  mode?: Mode;
  board?: string;
  /** Every other board's teams (builder, Matrix, Tower cycles). */
  boards?: Record<string, Team[]>;
  owned: Record<string, true>;
  vigorOverride: Record<string, number>;
  exportSettings: ExportSettings;
}

/** Coerces an imported setup into valid values; anything missing falls back to the defaults. */
export function sanitizeSetup(input: unknown): Setup {
  const raw = (input ?? {}) as Record<string, unknown>;
  const owned: Record<string, true> = {};
  const ownedIn = raw.owned;
  const ids = Array.isArray(ownedIn) ? ownedIn : ownedIn && typeof ownedIn === 'object' ? Object.keys(ownedIn) : [];
  for (const id of ids) if (typeof id === 'string' && id) owned[id] = true;

  const vigorOverride: Record<string, number> = {};
  if (raw.vigorOverride && typeof raw.vigorOverride === 'object')
    for (const [k, v] of Object.entries(raw.vigorOverride)) if (k && Number.isFinite(Number(v))) vigorOverride[k] = clampVigor(v);

  const ex = (raw.exportSettings ?? {}) as Partial<ExportSettings>;
  const flag = (v: unknown, d: boolean | undefined) => (typeof v === 'boolean' ? v : d);
  const exportSettings: ExportSettings = {
    format: ex.format === 'jpg' ? 'jpg' : 'png',
    title: typeof ex.title === 'string' ? ex.title.slice(0, 120) : '',
    showNotes: flag(ex.showNotes, DEFAULT_EXPORT.showNotes)!,
    showNames: flag(ex.showNames, DEFAULT_EXPORT.showNames)!,
    showWeapons: flag(ex.showWeapons, DEFAULT_EXPORT.showWeapons),
    showEchoes: flag(ex.showEchoes, DEFAULT_EXPORT.showEchoes),
    showRanks: flag(ex.showRanks, DEFAULT_EXPORT.showRanks),
  };

  const boards: Record<string, Team[]> = {};
  if (raw.boards && typeof raw.boards === 'object')
    for (const [k, v] of Object.entries(raw.boards)) {
      if (!BOARD_KEY.test(k) || !Array.isArray(v)) continue;
      try {
        boards[k] = sanitizeTeams(v);
      } catch {
        /* skip a broken board */
      }
    }
  const board = typeof raw.board === 'string' && BOARD_KEY.test(raw.board) ? raw.board : raw.matrixMode === true ? 'matrix' : 'builder';

  return { matrixMode: raw.matrixMode === true, mode: boardMode(board), board, boards, owned, vigorOverride, exportSettings };
}

interface State {
  /** The open board's teams. */
  teams: Team[];
  exportSettings: ExportSettings;
  mode: Mode;
  /** Key of the open board ('builder', 'matrix' or 'tower:<cycle>'). */
  board: string;
  /** Every board that isn't open, by key. */
  boards: Record<string, Team[]>;
  /**
   * Opens a board: the current teams are put away under their key and the
   * board's own come back (or `fresh()` the first time).
   */
  switchBoard: (board: string, fresh: () => Team[]) => void;
  /** Matrix mode (mode === 'matrix'): each team gets a circuit buff, shown in the editor and the team sheet. */
  matrixMode: boolean;
  /** Copies a builder team's line-up and gear into a team of the open board. */
  applyPreset: (teamId: string, preset: Team, keepName: boolean) => void;
  /** Matrix roster: the characters the player owns (only these can be dragged into teams). */
  owned: Record<string, true>;
  setOwned: (ids: string[], owned: boolean) => void;
  /** Manual Max Vigor per Vigor group (character id, or 'rover'), on top of matrix.txt. */
  vigorOverride: Record<string, number>;
  setVigorOverride: (group: string, value: number | null) => void;
  addTeam: () => void;
  removeTeam: (id: string) => void;
  duplicateTeam: (id: string) => void;
  moveTeam: (id: string, dir: -1 | 1) => void;
  /** Drag and drop of whole teams: swap places, or insert before/after the target. */
  reorderTeam: (fromId: string, toId: string, mode: TeamDropMode) => void;
  updateTeam: (id: string, patch: Partial<Omit<Team, 'id' | 'slots'>>) => void;
  updateSlot: (ref: SlotRef, patch: Partial<Slot>) => void;
  /** Places a character; clears weapon if the new character can't use it. */
  setCharacter: (ref: SlotRef, charId: string | null, keepWeapon: boolean) => void;
  /** Replaces the whole team's line-up with these characters (the rest of the slots end up empty). */
  replaceTeamCharacters: (teamId: string, charIds: string[]) => void;
  clearSlot: (ref: SlotRef) => void;
  /** Drag and drop: swaps when the target holds a character, otherwise moves. */
  dropSlot: (from: SlotRef, to: SlotRef) => string | null;
  setAllIncluded: (v: boolean) => void;
  /** Rewrites outdated character ids (old per-element Rover ids, roster-only ids) to current ones. */
  remapCharacters: (resolve: (id: string) => { id: string; mode?: string } | null) => void;
  importTeams: (teams: Team[], mode: 'replace' | 'append') => void;
  /**
   * Loads a full backup. 'replace' takes its boards, open planner and setup as
   * saved; 'append' adds its teams to the open board and its owned roster and
   * Vigor changes to the current ones.
   */
  importBackup: (teams: Team[], setup: Setup, mode: 'replace' | 'append') => void;
  /** Clears the open board; `fresh` gives its empty teams (one team, or the tower floors). */
  resetAll: (fresh?: Team[]) => void;
  setExportSettings: (patch: Partial<ExportSettings>) => void;
}

/** Sequence a character already has in any team, so a new placement starts from it. */
function knownSeq(teams: Team[], charId: string | null): number {
  if (!charId) return 0;
  for (const t of teams) for (const s of t.slots) if (s.charId === charId) return s.seq;
  return 0;
}

/** A character's Sequence is the same everywhere: sets it on every slot holding them. */
function syncSeq(teams: Team[], charId: string | null, seq: number): Team[] {
  if (!charId) return teams;
  return teams.map((t) =>
    t.slots.some((s) => s.charId === charId && s.seq !== seq)
      ? { ...t, slots: t.slots.map((s) => (s.charId === charId ? { ...s, seq } : s)) as Team['slots'] }
      : t,
  );
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
      exportSettings: { ...DEFAULT_EXPORT },
      mode: 'builder',
      board: 'builder',
      boards: {},
      matrixMode: false,
      switchBoard: (board, fresh) =>
        set((st) => {
          if (board === st.board) return st;
          const boards = { ...st.boards, [st.board]: st.teams };
          const teams = boards[board]?.length ? boards[board] : fresh();
          delete boards[board];
          const mode = boardMode(board);
          return { boards, teams, board, mode, matrixMode: mode === 'matrix' };
        }),

      applyPreset: (teamId, preset, keepName) =>
        set((st) => ({
          teams: st.teams.map((t) =>
            t.id !== teamId
              ? t
              : {
                  ...t,
                  name: keepName ? t.name : preset.name,
                  slots: preset.slots.map((s) => ({ ...s })) as Team['slots'],
                },
          ),
        })),

      owned: {},
      setOwned: (ids, owned) =>
        set((st) => {
          const next = { ...st.owned };
          for (const id of ids) {
            if (owned) next[id] = true;
            else delete next[id];
          }
          return { owned: next };
        }),

      vigorOverride: {},
      setVigorOverride: (group, value) =>
        set((st) => {
          const next = { ...st.vigorOverride };
          if (value === null) delete next[group];
          else next[group] = clampVigor(value);
          return { vigorOverride: next };
        }),

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

      reorderTeam: (fromId, toId, mode) =>
        set((st) => {
          const i = st.teams.findIndex((t) => t.id === fromId);
          const j = st.teams.findIndex((t) => t.id === toId);
          if (i < 0 || j < 0 || i === j) return st;
          const teams = [...st.teams];
          if (mode === 'swap') {
            [teams[i], teams[j]] = [teams[j], teams[i]];
            return { teams };
          }
          const [moved] = teams.splice(i, 1);
          const at = teams.findIndex((t) => t.id === toId) + (mode === 'after' ? 1 : 0);
          teams.splice(at, 0, moved);
          return { teams };
        }),

      updateTeam: (id, patch) => set((st) => ({ teams: st.teams.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

      updateSlot: (ref, patch) =>
        set((st) => {
          const teams = mapSlot(st.teams, ref, (s) => ({ ...s, ...patch }));
          if (patch.seq === undefined) return { teams };
          const charId = teams.find((t) => t.id === ref.teamId)?.slots[ref.index].charId ?? null;
          return { teams: syncSeq(teams, charId, patch.seq) };
        }),

      setCharacter: (ref, charId, keepWeapon) =>
        set((st) => ({
          teams: mapSlot(st.teams, ref, (s) =>
            s.charId === charId
              ? s
              : {
                  ...s,
                  charId,
                  seq: knownSeq(st.teams, charId),
                  mode: null,
                  weaponId: keepWeapon ? s.weaponId : null,
                  rank: keepWeapon ? s.rank : 1,
                },
          ),
        })),

      replaceTeamCharacters: (teamId, charIds) =>
        set((st) => ({
          teams: st.teams.map((t) =>
            t.id !== teamId
              ? t
              : {
                  ...t,
                  slots: [0, 1, 2].map((i) => {
                    const charId = charIds[i] ?? null;
                    // Keep the slot as is when the same character stays in the same place.
                    if (charId && t.slots[i].charId === charId) return t.slots[i];
                    return charId ? { ...emptySlot(), charId, seq: knownSeq(st.teams, charId) } : emptySlot();
                  }) as Team['slots'],
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
          const dupInTarget = toTeam.slots.some((s, i) => i !== to.index && sameCharacter(s.charId, a.charId));
          const dupInSource = fromTeam.slots.some((s, i) => i !== from.index && sameCharacter(s.charId, b.charId));
          if (dupInTarget || dupInSource) {
            const rover = (dupInTarget ? a.charId : b.charId)?.startsWith('rover-');
            return rover ? 'That team already has a Rover.' : 'That team already has this character.';
          }
        }

        const swap = !!b.charId;
        set((st) => {
          let next = mapSlot(st.teams, to, () => ({ ...a }));
          next = mapSlot(next, from, () => (swap ? { ...b } : emptySlot()));
          return { teams: next };
        });
        return null;
      },

      remapCharacters: (resolve) =>
        set((st) => {
          let changed = false;
          const teams = st.teams.map((t) => {
            const slots = t.slots.map((s) => {
              const hit = s.charId ? resolve(s.charId) : null;
              if (!hit) return s;
              changed = true;
              return { ...s, charId: hit.id, mode: hit.mode ?? s.mode };
            }) as Team['slots'];
            return { ...t, slots };
          });
          return changed ? { teams } : st;
        }),

      setAllIncluded: (v) => set((st) => ({ teams: st.teams.map((t) => ({ ...t, include: v })) })),

      importTeams: (incoming, mode) =>
        set((st) => ({ teams: mode === 'replace' ? (incoming.length ? incoming : [newTeam(1)]) : [...st.teams, ...incoming] })),

      importBackup: (incoming, setup, mode) =>
        set((st) => {
          if (mode === 'append')
            return {
              teams: [...st.teams, ...incoming],
              owned: { ...st.owned, ...setup.owned },
              vigorOverride: { ...st.vigorOverride, ...setup.vigorOverride },
            };
          const board = setup.board ?? (setup.matrixMode ? 'matrix' : 'builder');
          const boards = { ...(setup.boards ?? {}) };
          delete boards[board];
          const boardModeNow = boardMode(board);
          return {
            teams: incoming.length ? incoming : [newTeam(1)],
            board,
            boards,
            mode: boardModeNow,
            matrixMode: boardModeNow === 'matrix',
            owned: setup.owned,
            vigorOverride: setup.vigorOverride,
            exportSettings: setup.exportSettings,
          };
        }),

      resetAll: (fresh) => set({ teams: fresh?.length ? fresh : [newTeam(1)] }),

      setExportSettings: (patch) => set((st) => ({ exportSettings: { ...st.exportSettings, ...patch } })),
    }),
    {
      name: 'wtb:teams',
      version: 2,
      // v1 kept one list of teams for both the builder and Matrix. Each planner
      // now has its own, so that list is copied into both to start them off.
      migrate: (persisted, version) => {
        const st = (persisted ?? {}) as Partial<State>;
        if (version < 2) {
          const teams = Array.isArray(st.teams) ? st.teams : [newTeam(1)];
          const board = st.matrixMode ? 'matrix' : 'builder';
          const other = board === 'matrix' ? 'builder' : 'matrix';
          return { ...st, teams, board, mode: board, boards: { [other]: cloneTeams(teams) } } as State;
        }
        return st as State;
      },
    },
  ),
);
