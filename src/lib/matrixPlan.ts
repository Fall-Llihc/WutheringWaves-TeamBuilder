/**
 * Matrix score plan: Vigor limits and boss progress.
 *
 * Point values, the Mimic bonus and Vigor come from src/data/matrix.txt. The
 * progress maths follows wuwamatrix.com: every team's score is spent on the
 * bosses in order (R1 boss 1 ... R5 boss 5), carrying on from where the teams
 * before it stopped. A boss whose points are not fully covered is where the
 * team ends, with the uncovered part read as HP left.
 *
 * The Matrix Mimic: the points entered are damage. Its HP is its points minus
 * the kill bonus; dealing that much kills it, the bonus is added on top, and
 * anything past that goes into the next boss.
 */
import matrixText from '../data/matrix.txt?raw';
import type { Character } from './data';
import { isNextBoard } from './matrix';
import { rosterKey } from './roster';
import type { Team } from './store';

export interface ScorePlan {
  /** Points per boss, one array per round. */
  rounds: number[][];
  mimicBonus: number;
  /** Base Vigor by roster name key; anyone missing has 1. */
  vigor: Record<string, number>;
  /** Roster name keys with +1 Vigor in the active cycle (bonus_now). */
  bonusNow: string[];
  /** And in the next cycle (bonus_next). */
  bonusNext: string[];
}

export function parseScorePlan(text: string): ScorePlan {
  const plan: ScorePlan = { rounds: [], mimicBonus: 0, vigor: {}, bonusNow: [], bonusNext: [] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (key === 'round') {
      const pts = value.split(',').map((v) => Number(v.trim().replace(/[^\d]/g, '')));
      if (pts.length && pts.every((n) => Number.isFinite(n) && n > 0)) plan.rounds.push(pts);
    } else if (key === 'mimic_bonus') {
      plan.mimicBonus = Math.max(0, Number(value) || 0);
    } else if (key === 'vigor') {
      const [name, n] = value.split(':');
      const v = Math.round(Number(n));
      if (name?.trim() && v >= 1) plan.vigor[rosterKey(name)] = v;
    } else if ((key === 'bonus' || key === 'bonus_now') && value) {
      plan.bonusNow.push(rosterKey(value));
    } else if (key === 'bonus_next' && value) {
      plan.bonusNext.push(rosterKey(value));
    }
  }
  return plan;
}

export const SCORE_PLAN = parseScorePlan(matrixText);

/** Highest possible total: every boss's points, Mimic kill bonuses included. */
export const planMax = (plan: ScorePlan = SCORE_PLAN) => plan.rounds.flat().reduce((a, b) => a + b, 0);

/** +1 Vigor resonators of the cycle a board plans. */
export const bonusFor = (board: string, plan: ScorePlan = SCORE_PLAN) => (isNextBoard(board) ? plan.bonusNext : plan.bonusNow);

/* ------------------------------------------------------------------ */
/* Vigor                                                               */
/* ------------------------------------------------------------------ */

export const isRover = (id: string | null | undefined) => !!id?.startsWith('rover-');

/** Characters that share one pool of Vigor: every Rover is one. */
export const vigorGroup = (id: string) => (isRover(id) ? 'rover' : id);

/** Max Vigor: a manual override, else matrix.txt (+1 for the cycle's bonus resonators), else 1. Rover is always 1. */
export function vigorMax(
  char: Pick<Character, 'id' | 'name'>,
  overrides: Record<string, number>,
  bonus: string[] = SCORE_PLAN.bonusNow,
  plan: ScorePlan = SCORE_PLAN,
): number {
  const group = vigorGroup(char.id);
  if (overrides[group]) return overrides[group];
  if (group === 'rover') return 1;
  const key = rosterKey(char.name);
  return (plan.vigor[key] ?? 1) + (bonus.includes(key) ? 1 : 0);
}

/**
 * How many teams use each Vigor group. A team counts once even if it held a
 * Rover twice. Extra teams (switched off) aren't part of the plan and use none.
 */
export function vigorUsage(teams: Team[]): Record<string, number> {
  const used: Record<string, number> = {};
  for (const t of teams) {
    if (t.include === false) continue;
    const groups = new Set(t.slots.map((s) => s.charId).filter((id): id is string => !!id && id !== 'unknown').map(vigorGroup));
    for (const g of groups) used[g] = (used[g] ?? 0) + 1;
  }
  return used;
}

/* ------------------------------------------------------------------ */
/* Boss progress                                                       */
/* ------------------------------------------------------------------ */

export interface BossPoint {
  /** 1-based round. */
  round: number;
  /** 0-based boss in the round. */
  boss: number;
}

export type Progress =
  | ({ done: false; hpLeft: number; ptsIn: number; pool: number } & BossPoint)
  | { done: true };

/** Damage a boss takes to die: its points, less the kill bonus for the Mimic. */
export const bossPool = (plan: ScorePlan, round: number, boss: number, isMimic: (boss: number) => boolean) =>
  Math.max(1, plan.rounds[round][boss] - (isMimic(boss) ? plan.mimicBonus : 0));

/** Total damage to clear the whole run (bonuses not included). */
export const damageMax = (plan: ScorePlan = SCORE_PLAN, isMimic: (boss: number) => boolean = () => false) =>
  plan.rounds.reduce((n, round, r) => n + round.reduce((m, _, b) => m + bossPool(plan, r, b, isMimic), 0), 0);

/**
 * Where a running total of damage stands: the boss being fought and its HP
 * left (0–1). Damage that exactly kills a boss moves on to the next one, at
 * full HP with nothing dealt yet (ptsIn 0).
 */
export function calcProgress(score: number, plan: ScorePlan = SCORE_PLAN, isMimic: (boss: number) => boolean = () => false): Progress {
  let rem = Math.max(0, score);
  for (let r = 0; r < plan.rounds.length; r++) {
    for (let b = 0; b < plan.rounds[r].length; b++) {
      const pool = bossPool(plan, r, b, isMimic);
      if (rem >= pool) {
        rem -= pool;
        continue;
      }
      return { done: false, round: r + 1, boss: b, hpLeft: Math.max(0, 1 - Math.min(1, rem / pool)), ptsIn: rem, pool };
    }
  }
  return { done: true };
}

export interface TeamRun {
  /** Total of every team before this one. */
  start: number;
  end: number;
  arrival: Progress;
  departure: Progress;
  /** Bosses this team finished off (including the one it arrived at, when it was finished); `mimic` ones paid a kill bonus. */
  kills: Array<BossPoint & { mimic: boolean }>;
  /** Kill bonus points this team earned (Mimics it finished). */
  bonus: number;
}

const position = (p: Progress, plan: ScorePlan) => {
  if (p.done) return plan.rounds.flat().length;
  return plan.rounds.slice(0, p.round - 1).reduce((n, r) => n + r.length, 0) + p.boss;
};

const pointAt = (index: number, plan: ScorePlan): BossPoint => {
  let i = index;
  for (let r = 0; r < plan.rounds.length; r++) {
    if (i < plan.rounds[r].length) return { round: r + 1, boss: i };
    i -= plan.rounds[r].length;
  }
  return { round: plan.rounds.length, boss: plan.rounds.at(-1)!.length - 1 };
};

/** Every team's slice of the run, in team order. */
export function teamRuns(scores: number[], plan: ScorePlan = SCORE_PLAN, isMimic?: (boss: number) => boolean): TeamRun[] {
  let start = 0;
  return scores.map((raw) => {
    const score = Math.max(0, raw || 0);
    const end = start + score;
    const arrival = calcProgress(start, plan, isMimic);
    const departure = calcProgress(end, plan, isMimic);
    const from = position(arrival, plan);
    const to = position(departure, plan);
    const kills =
      score > 0
        ? Array.from({ length: Math.max(0, to - from) }, (_, k) => {
            const at = pointAt(from + k, plan);
            return { ...at, mimic: !!isMimic?.(at.boss) };
          })
        : [];
    const bonus = kills.filter((k) => k.mimic).length * plan.mimicBonus;
    const run = { start, end, arrival, departure, kills, bonus };
    start = end;
    return run;
  });
}

/** Plan total: damage entered plus every Mimic kill bonus earned. */
export const runTotal = (runs: TeamRun[]) => (runs.at(-1)?.end ?? 0) + runs.reduce((n, r) => n + r.bonus, 0);

/** Rank tier for a total: index into the tower's thresholds (0 = lowest), and the next threshold if any. */
export function rankOf(total: number, thresholds: number[]): { tier: number; next: number | null; floor: number } {
  const list = thresholds.length ? thresholds : FALLBACK_RANKS;
  let tier = 0;
  list.forEach((min, i) => {
    if (total >= min) tier = i;
  });
  return { tier, floor: list[tier] ?? 0, next: list[tier + 1] ?? null };
}

/** The game's score_level_rule for patch 3.7, used until the tower data loads. */
export const FALLBACK_RANKS = [0, 12000, 16000, 21000, 29000, 37000, 45000, 58000];
export const RANK_LABELS = ['C', 'B', 'A', 'S', 'SS', 'SSS', 'Crown', 'Crown II'];
