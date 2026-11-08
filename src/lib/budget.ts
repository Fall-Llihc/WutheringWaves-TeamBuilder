/**
 * What a resonator spends per team, whichever planner is open: Vigor in
 * Matrix (1 per team), cost in Tower of Adversity (the floor's cost, out of
 * 10). The builder has no limit.
 */
import { useMemo } from 'react';
import type { Character, GameData } from './data';
import { matrixPlacementError, vigorOf } from './matrixHooks';
import { vigorGroup, vigorUsage } from './matrixPlan';
import { useStore, type Team } from './store';
import { costUsage, floorCost, TOWER, towerPlacementError, useTower, type TowerCycle } from './tower';

export interface Budget {
  kind: 'vigor' | 'cost';
  max: number;
  used: number;
  left: number;
  /** Least a further team can take: 1 Vigor, or the cheapest planned floor. */
  step: number;
}

/** Cycle id of a tower board key, or null. */
export const boardCycle = (board: string) => (board.startsWith('tower:') ? Number(board.slice(6)) || null : null);

/** The Tower cycle the open board plans for (null outside Tower mode). */
export function useBoardCycle(): TowerCycle | null {
  const board = useStore((s) => s.board);
  const cycles = useTower((s) => s.cycles);
  const id = boardCycle(board);
  return id ? cycles[id] ?? null : null;
}

export const cheapestFloor = (cycle: TowerCycle | null | undefined) => Math.min(...TOWER.floors.map((f) => floorCost(f, cycle)));

/** Budget lookup for the open planner, or null in the builder. */
export function useBudget(): ((c: Character) => Budget) | null {
  const mode = useStore((s) => s.mode);
  const teams = useStore((s) => s.teams);
  const overrides = useStore((s) => s.vigorOverride);
  const cycle = useBoardCycle();
  return useMemo(() => {
    if (mode === 'matrix') {
      const usage = vigorUsage(teams);
      return (c: Character) => ({ kind: 'vigor' as const, step: 1, ...vigorOf(c, teams, overrides, usage) });
    }
    if (mode === 'tower') {
      const usage = costUsage(teams, cycle);
      const step = cheapestFloor(cycle);
      return (c: Character) => {
        const used = usage[vigorGroup(c.id)] ?? 0;
        return { kind: 'cost' as const, max: TOWER.cost, used, left: Math.max(0, TOWER.cost - used), step };
      };
    }
    return null;
  }, [mode, teams, overrides, cycle]);
}

/** Whether a character may join a team in the open planner; an error message, or null when it fits. */
export function placementError(
  data: GameData | null,
  teamId: string,
  charId: string,
  replacingIndex: number | null,
  teams: Team[] = useStore.getState().teams,
): string | null {
  const st = useStore.getState();
  if (st.mode === 'matrix') return matrixPlacementError(data, teams, st.vigorOverride, teamId, charId, replacingIndex);
  if (st.mode === 'tower') {
    const id = boardCycle(st.board);
    return towerPlacementError(data, teams, id ? useTower.getState().cycles[id] : null, teamId, charId, replacingIndex);
  }
  return null;
}
