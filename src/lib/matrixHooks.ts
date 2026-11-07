/**
 * React glue for Matrix mode: Vigor per character, the tower's enhanced
 * resonators, and every team's slice of the boss run.
 */
import { useMemo } from 'react';
import { findCharacter, sameCharacter, UNKNOWN_ID, type Character, type GameData } from './data';
import { useGame } from './game';
import { useMatrix } from './matrix';
import { SCORE_PLAN, teamRuns, vigorGroup, vigorMax, vigorUsage } from './matrixPlan';
import { useStore, type Team } from './store';

export interface VigorInfo {
  max: number;
  used: number;
  left: number;
}

export function vigorOf(char: Character, teams: Team[], overrides: Record<string, number>, usage = vigorUsage(teams)): VigorInfo {
  const max = vigorMax(char, overrides);
  const used = usage[vigorGroup(char.id)] ?? 0;
  return { max, used, left: Math.max(0, max - used) };
}

/** Vigor lookups for the current plan. */
export function useVigor() {
  const teams = useStore((s) => s.teams);
  const overrides = useStore((s) => s.vigorOverride);
  return useMemo(() => {
    const usage = vigorUsage(teams);
    return (char: Character) => vigorOf(char, teams, overrides, usage);
  }, [teams, overrides]);
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

/** Each team's slice of the boss run, in team order, and whether a boss index is the Matrix Mimic. */
export function useRuns() {
  const teams = useStore((s) => s.teams);
  const tower = useMatrix((s) => s.tower);
  return useMemo(() => {
    const isMimic = (b: number) => /mimic/i.test(tower?.bosses?.[b]?.name ?? (b === 4 ? 'Matrix Mimic' : ''));
    const runs = teamRuns(
      teams.map((t) => t.score ?? 0),
      SCORE_PLAN,
      isMimic,
    );
    return { runs, byTeam: new Map(teams.map((t, i) => [t.id, runs[i]])), isMimic };
  }, [teams, tower]);
}
