import { useMemo } from 'react';
import { MATRIX, towerPageUrl, useMatrix, type MatrixBoss } from '../lib/matrix';
import { useRuns, useVigor } from '../lib/matrixHooks';
import { FALLBACK_RANKS, planMax, RANK_LABELS, rankOf, SCORE_PLAN, type TeamRun } from '../lib/matrixPlan';
import { lookupCharacter, useGame } from '../lib/game';
import { useStore, type Team } from '../lib/store';
import { fmt, pct } from './MatrixTeam';
import { RankIcon, RankLadder } from './RankIcon';
import { Img, VigorIcon } from './ui';

/** One colour per team in the run ribbon; cycles after eight. */
export const TEAM_COLORS = ['#b73a3a', '#3f6e8c', '#c08a3e', '#5b8a6b', '#7d5ba6', '#a8576f', '#4d7f86', '#8a7a4a'];
export const teamColor = (i: number) => TEAM_COLORS[i % TEAM_COLORS.length];

interface Segment {
  team: number;
  from: number;
  to: number;
}

/** Each boss's points split into the teams that dealt them. */
export function ribbon(runs: TeamRun[]) {
  let cum = 0;
  return SCORE_PLAN.rounds.map((round) =>
    round.map((pts) => {
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
export function RunRibbon({ runs, bosses, names }: { runs: TeamRun[]; bosses: MatrixBoss[] | undefined; names: string[] }) {
  const rows = useMemo(() => {
    const all = ribbon(runs);
    const current = all.findIndex((row) => row.some((c) => c.filled < 1 - 1e-9));
    return current === -1 ? all : all.slice(0, current + 1);
  }, [runs]);
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
                      <i key={k} style={{ left: `${s.from * 100}%`, width: `${(s.to - s.from) * 100}%`, background: teamColor(s.team) }} />
                    ))}
                    {boss?.icon ? <Img src={boss.icon} alt="" eager className="ribbon-boss" /> : null}
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

/** Matrix overview above the teams: total, rank, the run so far, and Vigor problems. */
export function MatrixSummary() {
  const teams = useStore((s) => s.teams);
  const tower = useMatrix((s) => s.tower);
  const error = useMatrix((s) => s.error);
  const { runs } = useRuns();
  const issues = useVigorIssues(teams);
  const total = runs.at(-1)?.end ?? 0;
  const thresholds = tower?.ranks?.length ? tower.ranks : FALLBACK_RANKS;
  const rank = rankOf(total, thresholds);
  const toNext = rank.next === null ? 0 : rank.next - total;
  const span = rank.next === null ? 1 : (total - rank.floor) / (rank.next - rank.floor);
  const max = planMax();
  const names = teams.map((t, i) => t.name || `Team ${i + 1}`);
  const scored = teams.filter((t) => (t.score ?? 0) > 0).length;

  return (
    <section className="mx-summary" aria-label="Matrix score plan">
      <div className="mx-top">
        <div className="mx-total">
          <span className="eyebrow">Total points</span>
          <strong className="mono">{fmt(total)}</strong>
          <span className="muted">
            {scored}/{teams.length} teams scored · max {fmt(max)}
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
          <span>
            Matrix · patch {MATRIX.patch}
            {tower?.phase ? ` · ${tower.phase}` : ''}
          </span>
          <a href={towerPageUrl(MATRIX.page)} target="_blank" rel="noreferrer">
            Tower data
          </a>
          {error && !tower ? <span className="error-text">{error}</span> : null}
        </div>
      </div>

      <RankLadder tier={rank.tier} thresholds={thresholds} />

      <RunRibbon runs={runs} bosses={tower?.bosses} names={names} />

      <div className="mx-legend">
        {teams.map((t, i) => (
          <span key={t.id} className={`mx-legend-item ${(t.score ?? 0) > 0 ? '' : 'idle'}`}>
            <i style={{ background: teamColor(i) }} />
            <span>{names[i]}</span>
            <span className="mono muted">{fmt(t.score ?? 0)}</span>
          </span>
        ))}
      </div>

      {issues.length > 0 && (
        <p className="mx-warn" role="status">
          <VigorIcon size={15} /> Over Vigor: {issues.join(' · ')}. Each use in a team costs 1 Vigor.
        </p>
      )}
    </section>
  );
}
