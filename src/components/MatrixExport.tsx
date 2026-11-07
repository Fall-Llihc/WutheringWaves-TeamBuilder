import { forwardRef, useMemo } from 'react';
import { activeMode, ELEMENTS, slotElement, UNKNOWN_ID } from '../lib/data';
import { lookupCharacter, modesOf, useGame } from '../lib/game';
import { findBuff, MATRIX, useMatrix } from '../lib/matrix';
import { FALLBACK_RANKS, RANK_LABELS, rankOf, SCORE_PLAN, teamRuns, type TeamRun } from '../lib/matrixPlan';
import type { Team } from '../lib/store';
import { RunRibbon, teamColor } from './MatrixSummary';
import { BossFace, bossOf, fmt, pct } from './MatrixTeam';
import { RankIcon } from './RankIcon';
import { Img } from './ui';

export const MATRIX_SHEET_W = 1080;

function SheetTeam({ team, index, run, showRanks }: { team: Team; index: number; run: TeamRun; showRanks: boolean }) {
  const data = useGame((s) => s.data);
  const autoModes = useGame((s) => s.autoModes);
  const tower = useMatrix((s) => s.tower);
  const buff = findBuff(tower, team.buffId ?? null);
  const stop = run.departure;
  const stopName = !stop.done ? bossOf(tower?.bosses, stop.boss)?.name ?? `Boss ${stop.boss + 1}` : '';

  return (
    <div className="xm-team" style={{ '--team': teamColor(index) } as React.CSSProperties}>
      <span className="xm-index mono">{String(index + 1).padStart(2, '0')}</span>
      <div className="xm-who">
        <span className="xm-name">{team.name || `Team ${index + 1}`}</span>
        <div className="xm-chars">
          {team.slots.map((s, i) => {
            const c = lookupCharacter(data, s.charId);
            const mode = activeMode(modesOf(c, autoModes), s.mode);
            const el = c ? slotElement(c, mode) : 0;
            return (
              <span key={i} className={`xm-char ${c ? `r${c.rarity}` : 'empty'}`} style={{ '--el': ELEMENTS[el]?.color ?? 'transparent' } as React.CSSProperties}>
                {c?.icon || c?.portrait ? <Img src={c.icon || c.portrait} alt="" eager /> : c ? <span className="unknown-mark">{c.id === UNKNOWN_ID ? '?' : c.name[0]}</span> : null}
                {c && showRanks && <span className={`x-badge seq tier-S${s.seq}`}>S{s.seq}</span>}
              </span>
            );
          })}
        </div>
      </div>
      <div className={`xm-buff ${buff ? '' : 'none'}`}>
        <span className="buff-ink">{buff ? <Img src={buff.icon} alt="" eager /> : null}</span>
        <span className="xm-buff-name">{buff?.name ?? 'No buff'}</span>
      </div>
      <div className="xm-run">
        <strong className="mono">{fmt(team.score ?? 0)}</strong>
        <span>
          {!team.score ? (
            'No points yet'
          ) : stop.done ? (
            'Run cleared'
          ) : (
            <>
              {run.kills.length ? `${run.kills.length} kill${run.kills.length === 1 ? '' : 's'} · ` : ''}R{stop.round} {stopName}{' '}
              {pct(stop.hpLeft)}
            </>
          )}
        </span>
      </div>
      {!stop.done && team.score ? (
        <span className="xm-stop">
          <BossFace bosses={tower?.bosses} at={stop} size={44} />
        </span>
      ) : (
        <span className="xm-stop" />
      )}
    </div>
  );
}

/** Matrix plan as one shareable image: total, rank, the run, and every team. */
export const MatrixSheet = forwardRef<HTMLDivElement, { teams: Team[]; title: string; showRanks: boolean }>(function MatrixSheet(
  { teams, title, showRanks },
  ref,
) {
  const tower = useMatrix((s) => s.tower);
  const runs = useMemo(
    () =>
      teamRuns(
        teams.map((t) => t.score ?? 0),
        SCORE_PLAN,
        (b) => /mimic/i.test(tower?.bosses?.[b]?.name ?? (b === 4 ? 'Mimic' : '')),
      ),
    [teams, tower],
  );
  const total = runs.at(-1)?.end ?? 0;
  const rank = rankOf(total, tower?.ranks?.length ? tower.ranks : FALLBACK_RANKS);
  const names = teams.map((t, i) => t.name || `Team ${i + 1}`);

  return (
    <div ref={ref} className="x-sheet xm-sheet" style={{ width: MATRIX_SHEET_W }}>
      <header className="xm-head">
        <div>
          <span className="eyebrow">
            Matrix · patch {MATRIX.patch}
            {tower?.phase ? ` · ${tower.phase}` : ''}
          </span>
          <div className="x-title">{title.trim() || 'Matrix plan'}</div>
        </div>
        <div className={`mx-rank tier-${rank.tier} xm-rank`}>
          <span className="rank-medal" title={`Rank ${RANK_LABELS[rank.tier]}`}>
            <RankIcon tier={rank.tier} size={104} />
          </span>
          <div className="xm-total">
            <span className="eyebrow">Total points</span>
            <strong className="mono">{fmt(total)}</strong>
          </div>
        </div>
      </header>

      <RunRibbon runs={runs} bosses={tower?.bosses} names={names} />

      <div className="xm-teams">
        {teams.map((t, i) => (
          <SheetTeam key={t.id} team={t} index={i} run={runs[i]} showRanks={showRanks} />
        ))}
      </div>

      <div className="x-foot">
        <span>Wuthering Waves · Matrix plan</span>
        <img src="llihc-logo.png" alt="Llihc" className="x-logo" />
      </div>
    </div>
  );
});
