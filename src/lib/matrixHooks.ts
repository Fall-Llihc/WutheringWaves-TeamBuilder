/**
 * React glue for Matrix mode: Vigor per character, the tower's enhanced
 * resonators, and every team's slice of the boss run.
 */
import { useMemo } from 'react';
import { activeMode, elementByName, ELEMENTS, findCharacter, sameCharacter, slotElement, UNKNOWN_ID, type Character, type GameData } from './data';
import { lookupCharacter, modesOf, useGame } from './game';
import { useMatrix, type MatrixBoss } from './matrix';
import { bonusFor, SCORE_PLAN, teamRuns, vigorGroup, vigorMax, vigorUsage, type BossPoint, type TeamRun } from './matrixPlan';
import { useStore, type Team } from './store';

export interface VigorInfo {
  max: number;
  used: number;
  left: number;
}

export function vigorOf(
  char: Character,
  teams: Team[],
  overrides: Record<string, number>,
  usage = vigorUsage(teams),
  bonus: string[] = bonusFor(useStore.getState().board),
): VigorInfo {
  const max = vigorMax(char, overrides, bonus);
  const used = usage[vigorGroup(char.id)] ?? 0;
  return { max, used, left: Math.max(0, max - used) };
}

/** Vigor lookups for the current plan. */
export function useVigor() {
  const teams = useStore((s) => s.teams);
  const overrides = useStore((s) => s.vigorOverride);
  const board = useStore((s) => s.board);
  return useMemo(() => {
    const usage = vigorUsage(teams);
    const bonus = bonusFor(board);
    return (char: Character) => vigorOf(char, teams, overrides, usage, bonus);
  }, [teams, overrides, board]);
}

/**
 * Whether a character may join a team in Matrix mode. Already in the team
 * (or another Rover there) means it costs no extra Vigor; otherwise it needs
 * Vigor left. Returns an error message, or null when it fits.
 */
export function matrixPlacementError(
  data: GameData | null,
  teams: Team[],
  overrides: Record<string, number>,
  teamId: string,
  charId: string,
  replacingIndex: number | null,
): string | null {
  if (charId === UNKNOWN_ID) return null;
  const team = teams.find((t) => t.id === teamId);
  const char = findCharacter(data, charId);
  if (!team || !char) return null;
  const others = team.slots.filter((_, i) => i !== replacingIndex);
  if (others.some((s) => sameCharacter(s.charId, charId))) {
    return charId.startsWith('rover-') ? 'That team already has a Rover.' : 'That team already has this character.';
  }
  // Replacing the same Vigor group in place (e.g. switching Rover gender) costs nothing.
  const replaced = replacingIndex === null ? null : team.slots[replacingIndex]?.charId;
  if (replaced && vigorGroup(replaced) === vigorGroup(charId)) return null;
  const v = vigorOf(char, teams, overrides);
  if (v.left > 0) return null;
  if (charId.startsWith('rover-')) return 'Rover has no Vigor left: one Rover, in one element, for the whole plan.';
  return `${char.name} has no Vigor left (${v.used}/${v.max} teams).`;
}

/** Characters the tower enhances this cycle, by app character id. */
export function useEnhanced(): Map<string, string> {
  const tower = useMatrix((s) => s.tower);
  const data = useGame((s) => s.data);
  return useMemo(() => {
    const out = new Map<string, string>();
    if (!tower?.enhanced || !data) return out;
    for (const e of tower.enhanced) {
      const id = data.characters[e.id] ? e.id : data.aliases[e.id]?.id;
      if (id && !out.has(id)) out.set(id, e.desc);
    }
    return out;
  }, [tower, data]);
}

/**
 * Each active team's slice of the boss run, in team order, and whether a boss
 * index is the Matrix Mimic. Extra teams (switched off) have no run and aren't counted.
 */
export function useRuns() {
  const all = useStore((s) => s.teams);
  const teams = useMemo(() => all.filter((t) => t.include), [all]);
  const tower = useMatrix((s) => s.tower);
  return useMemo(() => {
    const isMimic = mimicOf(tower?.bosses);
    const runs = teamRuns(
      teams.map((t) => t.score ?? 0),
      SCORE_PLAN,
      isMimic,
    );
    return { runs, teams, byTeam: new Map(teams.map((t, i) => [t.id, runs[i]])), isMimic };
  }, [teams, tower]);
}

/** Whether a boss slot (0-based, in a round) is the Matrix Mimic; the last boss when names aren't loaded. */
export const mimicOf = (bosses: MatrixBoss[] | undefined) => (b: number) =>
  /mimic/i.test(bosses?.[b]?.name ?? (b === 4 ? 'Matrix Mimic' : ''));

/** A team member whose element a boss on the team's run resists. */
export interface ResistClash {
  name: string;
  element: number;
  /** The bosses on this team's run that resist it, in order. */
  bosses: Array<BossPoint & { name: string }>;
}

/** Element ids a boss resists, from its "Fusion RES" style tags. */
export const bossResists = (b: MatrixBoss | null | undefined) =>
  (b?.res ?? []).map((t) => elementByName(t.replace(/\s*RES$/i, '').trim())).filter((el) => ELEMENTS[el]);

/**
 * Members of a team whose element is resisted by a boss its points reach:
 * every boss it kills, and the one it stops at if it deals damage there.
 * Empty until the team has points.
 */
export function useResistClashes(team: Team, run: TeamRun | undefined): ResistClash[] {
  const data = useGame((s) => s.data);
  const autoModes = useGame((s) => s.autoModes);
  const bosses = useMatrix((s) => s.tower?.bosses);
  return useMemo(() => {
    if (!run || run.end <= run.start || !bosses?.length) return [];
    const hit: BossPoint[] = [...run.kills];
    const d = run.departure;
    if (!d.done && d.ptsIn > 0 && !hit.some((k) => k.round === d.round && k.boss === d.boss)) hit.push({ round: d.round, boss: d.boss });
    const out: ResistClash[] = [];
    for (const s of team.slots) {
      const c = lookupCharacter(data, s.charId);
      if (!c || c.id === UNKNOWN_ID) continue;
      const el = slotElement(c, activeMode(modesOf(c, autoModes), s.mode));
      if (!el) continue;
      const against = hit
        .filter((p) => bossResists(bosses[p.boss]).includes(el))
        .map((p) => ({ ...p, name: bosses[p.boss]?.name ?? `Boss ${p.boss + 1}` }));
      if (against.length) out.push({ name: c.name, element: el, bosses: against });
    }
    return out;
  }, [team.slots, run, bosses, data, autoModes]);
}
