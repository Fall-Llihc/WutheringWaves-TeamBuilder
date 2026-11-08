import { useMemo } from 'react';
import { MATRIX, patchOfPage, towerPageUrl, useMatrix, type MatrixBoss } from '../lib/matrix';
import { mimicOf, useRuns, useVigor } from '../lib/matrixHooks';
import { bossPool, FALLBACK_RANKS, planMax, RANK_LABELS, rankOf, runTotal, SCORE_PLAN, type TeamRun } from '../lib/matrixPlan';
import { lookupCharacter, useGame } from '../lib/game';
import { useStore, type Team } from '../lib/store';
import { fmt, pct } from './MatrixTeam';
import { RankIcon, RankLadder } from './RankIcon';
import { Icon, Img, VigorIcon } from './ui';

/** One colour per team in the run ribbon; cycles after eight. */
export const TEAM_COLORS = ['#b73a3a', '#3f6e8c', '#c08a3e', '#5b8a6b', '#7d5ba6', '#a8576f', '#4d7f86', '#8a7a4a'];
export const teamColor = (i: number) => TEAM_COLORS[i % TEAM_COLORS.length];

interface Segment {
  team: number;
  from: number;
  to: number;
}

/** Each boss's HP (its damage pool) split into the teams that dealt it. */
export function ribbon(runs: TeamRun[], isMimic: (boss: number) => boolean) {
  let cum = 0;
  return SCORE_PLAN.rounds.map((round, r) =>
    round.map((_, b) => {
      const pts = bossPool(SCORE_PLAN, r, b, isMimic);
      const start = cum;
      cum += pts;
      const segs: Segment[] = [];
      runs.forEach((r, team) => {
        const a = Math.max(r.start, start);
        const b = Math.min(r.end, start + pts);
        if (b > a) segs.push({ team, from: (a - start) / pts, to: (b - start) / pts });
      });
      return { pts, segs, filled: segs.reduce((n, s) => n + (s.to - s.from), 0) };
    }),
  );
}

/**
 * Rounds as rows of bosses, each boss cell filled by the teams that hit it.
 * Only the rounds reached so far are shown: up to the round with the boss
 * still being fought (all of them once the run is cleared).
 */
/**
 * `names` and `colors` are per run (active team). `colors` holds each one's place
 * among all teams, so a team keeps its colour when another is switched off.
 */
export function RunRibbon({
  runs,
  bosses,
  names,
  colors,
}: {
  runs: TeamRun[];
  bosses: MatrixBoss[] | undefined;
  names: string[];
  colors?: number[];
}) {
  const rows = useMemo(() => {
    const all = ribbon(runs, mimicOf(bosses));
    const current = all.findIndex((row) => row.some((c) => c.filled < 1 - 1e-9));
    return current === -1 ? all : all.slice(0, current + 1);
  }, [runs, bosses]);
  return (
    <div className="ribbon" role="img" aria-label="Boss progress by round">
      {rows.map((row, r) => {
        const sum = SCORE_PLAN.rounds[r].reduce((a, b) => a + b, 0);
        return (
          <div className="ribbon-row" key={r}>
            <span className="ribbon-label">
              <strong>R{r + 1}</strong>
              <span className="mono muted">{fmt(sum)}</span>
            </span>
            <div className="ribbon-cells" style={{ gridTemplateColumns: row.map((c) => `${c.pts}fr`).join(' ') }}>
              {row.map((cell, b) => {
                const boss = bosses?.[b];
                const who = cell.segs.map((s) => names[s.team]).join(', ');
                const tip = `R${r + 1} · ${boss?.name ?? `Boss ${b + 1}`} · ${fmt(cell.pts)} pts${cell.filled >= 1 - 1e-9 ? ' · defeated' : cell.filled > 0 ? ` · ${pct(1 - cell.filled)} HP left` : ''}${who ? ` · ${who}` : ''}`;
                return (
                  <span key={b} className={`ribbon-cell ${cell.filled >= 1 - 1e-9 ? 'dead' : cell.filled > 0 ? 'hit' : ''}`} title={tip}>
                    {cell.segs.map((s, k) => (
                      <i key={k} style={{ left: `${s.from * 100}%`, width: `${(s.to - s.from) * 100}%`, background: teamColor(colors?.[s.team] ?? s.team) }} />
                    ))}
                    {boss?.icon ? <Img src={boss.icon} alt="" eager className="ribbon-boss" /> : null}
                    {cell.filled >= 1 - 1e-9 && mimicOf(bosses)(b) && SCORE_PLAN.mimicBonus > 0 ? (
                      <span className="ribbon-bonus mono">+{fmt(SCORE_PLAN.mimicBonus)}</span>
                    ) : null}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Teams that use more Vigor than a character has. */
function useVigorIssues(teams: Team[]) {
  const data = useGame((s) => s.data);
  const vigorFor = useVigor();
  return useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of teams)
      for (const s of t.slots) {
        const c = lookupCharacter(data, s.charId);
        if (!c || c.id === 'unknown') continue;
        const v = vigorFor(c);
        if (v.used > v.max) seen.set(c.id.startsWith('rover-') ? 'rover' : c.id, `${c.id.startsWith('rover-') ? 'Rover' : c.name} ${v.used}/${v.max}`);
      }
    return [...seen.values()];
  }, [teams, data, vigorFor]);
}

/**
 * Matrix overview above the teams: which cycle (the active patch or the next),
 * total, rank, the run so far, and Vigor problems.
 */
export function MatrixSummary({ which, onWhich }: { which: 'current' | 'next'; onWhich: (w: 'current' | 'next') => void }) {
  const page = useMatrix((s) => s.page);
  const nextMissing = useMatrix((s) => !!MATRIX.next && !!s.missing[MATRIX.next.page] && !s.towers[MATRIX.next.page]);
  const allTeams = useStore((s) => s.teams);
  const tower = useMatrix((s) => s.tower);
  const error = useMatrix((s) => s.error);
  // Only active teams count; extra ones are left out of the total, the ribbon and the legend.
  const { runs, teams, byTeam } = useRuns();
  const extra = allTeams.length - teams.length;
  const issues = useVigorIssues(teams);
  const total = runTotal(runs);
  const bonus = runs.reduce((n, r) => n + r.bonus, 0);
  const thresholds = tower?.ranks?.length ? tower.ranks : FALLBACK_RANKS;
  const rank = rankOf(total, thresholds);
  const toNext = rank.next === null ? 0 : rank.next - total;
  const span = rank.next === null ? 1 : (total - rank.floor) / (rank.next - rank.floor);
  const max = planMax();
  // Colours and default names follow each team's place among all teams, extras included.
  const place = (id: string) => allTeams.findIndex((t) => t.id === id);
  const names = teams.map((t) => t.name || `Team ${place(t.id) + 1}`);
  const colors = teams.map((t) => place(t.id));
  const scored = teams.filter((t) => (t.score ?? 0) > 0).length;

  return (
    <section className="mx-summary" aria-label="Matrix score plan">
      <div className="mx-top">
        <div className="mx-total">
          <span className="eyebrow">Total points</span>
          <strong className="mono">{fmt(total)}</strong>
          <span className="muted">
            {scored}/{teams.length} teams scored{extra ? ` · ${extra} extra not counted` : ''}{bonus ? ` · incl. +${fmt(bonus)} Mimic bonus` : ''} · max {fmt(max)}
          </span>
        </div>

        <div className={`mx-rank tier-${rank.tier}`}>
          <span className="rank-medal" title={`Rank ${RANK_LABELS[rank.tier]}`}>
            <RankIcon tier={rank.tier} size={64} />
          </span>
          <div className="mx-rank-meta">
            <span className="mx-rank-name">
              <span className="eyebrow">Rank</span>
              <strong>{RANK_LABELS[rank.tier] ?? `Tier ${rank.tier}`}</strong>
            </span>
            <span className="mx-rank-track" aria-hidden="true">
              <i style={{ transform: `scaleX(${Math.min(1, Math.max(0, span))})` }} />
            </span>
            <span className="muted">
              {rank.next === null ? (
                'Top rank reached'
              ) : (
                <>
                  <span className="mono">{fmt(toNext)}</span> to {RANK_LABELS[rank.tier + 1]} ({fmt(rank.next)})
                </>
              )}
            </span>
          </div>
        </div>

        <div className="mx-meta">
          {MATRIX.next && (
            <div className="seg tw-switch" role="tablist" aria-label="Matrix cycle">
              <button role="tab" aria-selected={which === 'current'} className={which === 'current' ? 'on' : ''} onClick={() => onWhich('current')}>
                <span className="tw-dot live" aria-hidden="true" /> {MATRIX.patch}
              </button>
              <button
                role="tab"
                aria-selected={which === 'next'}
                className={which === 'next' ? 'on' : ''}
                onClick={() => onWhich('next')}
                title={nextMissing ? `Patch ${MATRIX.next.patch} (page ${MATRIX.next.page}) isn't on nanoka yet` : `Plan patch ${MATRIX.next.patch}`}
              >
                <Icon name="hourglass" size={14} /> {MATRIX.next.patch}
              </button>
            </div>
          )}
          <span>
            Matrix · patch {patchOfPage(page)}
            {tower?.phase ? ` · ${tower.phase}` : ''}
          </span>
          <a href={towerPageUrl(page)} target="_blank" rel="noreferrer">
            Tower data
          </a>
          {error && !tower ? (
            <span className="error-text">
              {which === 'next' && nextMissing ? `Patch ${patchOfPage(page)} isn't on nanoka yet; plan with names only.` : error}
            </span>
          ) : null}
        </div>
      </div>

      <RankLadder tier={rank.tier} thresholds={thresholds} />

      <RunRibbon runs={runs} bosses={tower?.bosses} names={names} colors={colors} />

      <div className="mx-legend">
        {allTeams.map((t, i) => {
          const run = byTeam.get(t.id);
          return (
            <span
              key={t.id}
              className={`mx-legend-item ${!t.include ? 'extra' : (t.score ?? 0) > 0 ? '' : 'idle'}`}
              title={!t.include ? 'Extra team: not counted' : run?.bonus ? `incl. +${fmt(run.bonus)} Mimic bonus` : undefined}
            >
              <i style={{ background: teamColor(i) }} />
              <span>{t.name || `Team ${i + 1}`}</span>
              <span className="mono muted">{!t.include ? 'extra' : fmt((t.score ?? 0) + (run?.bonus ?? 0))}</span>
            </span>
          );
        })}
      </div>

      {issues.length > 0 && (
        <p className="mx-warn" role="status">
          <VigorIcon size={15} /> Over Vigor: {issues.join(' · ')}. Each use in a team costs 1 Vigor.
        </p>
      )}
    </section>
  );
}
