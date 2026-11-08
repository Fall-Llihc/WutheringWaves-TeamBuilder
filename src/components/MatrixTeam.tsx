import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { findBuff, useMatrix, type MatrixBoss, type MatrixBuff } from '../lib/matrix';
import { ELEMENTS } from '../lib/data';
import { useResistClashes, useRuns, type ResistClash } from '../lib/matrixHooks';
import { SCORE_PLAN, type BossPoint, type Progress, type TeamRun } from '../lib/matrixPlan';
import { clampScore, useStore, type Team } from '../lib/store';
import { ElementIcon, Icon, Img } from './ui';

const nf = new Intl.NumberFormat('en-US');
export const fmt = (n: number) => nf.format(Math.round(n));

export const bossOf = (bosses: MatrixBoss[] | undefined, boss: number): MatrixBoss | null => bosses?.[boss] ?? null;

/** Boss portrait with its round number; `resisted` rings it when a team member's element is resisted there. */
export function BossFace({
  bosses,
  at,
  size = 34,
  resisted,
}: {
  bosses: MatrixBoss[] | undefined;
  at: BossPoint;
  size?: number;
  resisted?: string;
}) {
  const b = bossOf(bosses, at.boss);
  return (
    <span
      className={`boss-face ${resisted ? 'resisted' : ''}`}
      style={{ width: size, height: size }}
      title={`R${at.round} · ${b?.name ?? `Boss ${at.boss + 1}`}${resisted ? ` · resists ${resisted}` : ''}`}
    >
      {b?.icon ? <Img src={b.icon} alt="" eager /> : <span className="boss-initial">{at.boss + 1}</span>}
      <span className="boss-round mono">R{at.round}</span>
    </span>
  );
}

/** A boss being fought: share already taken by earlier teams, this team's share, and HP left. */
function HpBar({ before, mine }: { before: number; mine: number }) {
  return (
    <span className="hp" aria-hidden="true">
      <i className="hp-prev" style={{ width: `${before * 100}%` }} />
      <i className="hp-mine" style={{ width: `${mine * 100}%`, left: `${before * 100}%` }} />
    </span>
  );
}

/**
 * A 0–1 share as a percentage with two decimals. A share strictly between 0 and 1
 * never rounds to 0.00% or 100.00%, so a boss still alive never reads as dead.
 */
export const pct = (n: number) => {
  const v = Math.min(100, Math.max(0, n * 100));
  const shown = v > 0 && v < 100 ? Math.min(99.99, Math.max(0.01, v)) : v;
  return `${shown.toFixed(2)}%`;
};
const damageDone = (p: Progress) => (p.done ? 1 : 1 - p.hpLeft);

/**
 * How far a team's score carries the run: the boss it arrives at, the bosses
 * it finishes (a Mimic adds its kill bonus), and the boss (and HP left) it
 * stops at. Points that end exactly on a kill stop there, with the next boss
 * untouched.
 */
export function RunSpan({
  run,
  bosses,
  compact,
  clashes = [],
}: {
  run: TeamRun;
  bosses: MatrixBoss[] | undefined;
  compact?: boolean;
  clashes?: ResistClash[];
}) {
  const { arrival, departure, kills } = run;
  if (run.end === run.start) return <p className="run-empty muted">Enter the team's points to see how far it carries the run.</p>;
  if (arrival.done) return <p className="run-empty">Run already cleared by earlier teams.</p>;
  // Ended exactly on a kill: nothing dealt to the next boss yet.
  const onEdge = !departure.done && departure.ptsIn === 0 && kills.length > 0;
  const sameBoss = !departure.done && departure.round === arrival.round && departure.boss === arrival.boss;
  // Which elements each boss on the run resists from this team, by "round-boss".
  const resisted = new Map<string, string>();
  for (const c of clashes)
    for (const b of c.bosses) {
      const k = `${b.round}-${b.boss}`;
      const el = ELEMENTS[c.element]?.name ?? '';
      resisted.set(k, [...new Set([...(resisted.get(k)?.split(', ') ?? []), el])].filter(Boolean).join(', '));
    }
  const resistAt = (p: BossPoint) => resisted.get(`${p.round}-${p.boss}`);
  const shown = compact ? kills.slice(0, 3) : kills.slice(0, 6);
  const hidden = kills.length - shown.length;
  const name = (p: BossPoint) => bossOf(bosses, p.boss)?.name ?? `Boss ${p.boss + 1}`;

  return (
    <div className="run">
      <div className="run-chain">
        {shown.map((k, i) => (
          <span key={i} className="run-kill">
            <BossFace bosses={bosses} at={k} size={compact ? 28 : 34} resisted={resistAt(k)} />
            <span className="run-check" aria-hidden="true">
              <Icon name="check" size={10} weight="bold" />
            </span>
            {k.mimic && SCORE_PLAN.mimicBonus > 0 && (
              <span className="run-bonus mono" title={`Mimic defeated: +${fmt(SCORE_PLAN.mimicBonus)} points`}>
                +{SCORE_PLAN.mimicBonus >= 1000 ? `${SCORE_PLAN.mimicBonus / 1000}k` : SCORE_PLAN.mimicBonus}
              </span>
            )}
          </span>
        ))}
        {hidden > 0 && <span className="run-more mono">+{hidden}</span>}
        {!departure.done && !onEdge && (
          <span className="run-stop">
            <BossFace bosses={bosses} at={departure} size={compact ? 28 : 34} resisted={resistAt(departure)} />
            <HpBar before={sameBoss ? damageDone(arrival) : 0} mine={damageDone(departure) - (sameBoss ? damageDone(arrival) : 0)} />
          </span>
        )}
      </div>
      <p className="run-text">
        {departure.done ? (
          <>
            <strong>Run cleared.</strong> {kills.length} boss{kills.length === 1 ? '' : 'es'} down.
          </>
        ) : onEdge ? (
          <>
            <strong>
              {kills.length} kill{kills.length === 1 ? '' : 's'}
            </strong>
            , ends right on the kill. Next up{' '}
            <strong>
              R{departure.round} {name(departure)}
            </strong>{' '}
            at full HP
          </>
        ) : (
          <>
            {kills.length ? (
              <>
                <strong>
                  {kills.length} kill{kills.length === 1 ? '' : 's'}
                </strong>
                , stops at{' '}
              </>
            ) : (
              <>Hits </>
            )}
            <strong>
              R{departure.round} {name(departure)}
            </strong>{' '}
            with <span className="mono">{pct(departure.hpLeft)}</span> HP left
            {!arrival.done && (
              <span className="muted">
                {' '}
                · from R{arrival.round} {name(arrival)}
              </span>
            )}
          </>
        )}
        {run.bonus > 0 && (
          <span className="run-bonus-text">
            {' '}
            · Mimic bonus <span className="mono">+{fmt(run.bonus)}</span>
          </span>
        )}
      </p>
    </div>
  );
}

const isDigit = (c: string) => c >= '0' && c <= '9';
const digitsIn = (s: string) => s.replace(/[^\d]/g, '');
const digitsRightOf = (s: string, at: number) => digitsIn(s.slice(at)).length;

/** Caret index in `s` that has `n` digits to its right. */
function caretFromRight(s: string, n: number) {
  if (n <= 0) return s.length;
  let seen = 0;
  for (let i = s.length - 1; i >= 0; i--) if (isDigit(s[i]) && ++seen === n) return i;
  return 0;
}

/**
 * Score field: whole points with thousands separators while typing. The caret
 * stays among the same digits when the separators move, and ArrowUp/ArrowDown
 * step the points by 1.
 */
function ScoreInput({ team }: { team: Team }) {
  const updateTeam = useStore((s) => s.updateTeam);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(team.score ? fmt(team.score) : '');
  // Digits to the right of the caret, put back after the next render.
  const caret = useRef<number | null>(null);
  const [caretTick, setCaretTick] = useState(0);
  useEffect(() => setText(team.score ? fmt(team.score) : ''), [team.score]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (caret.current === null || !el || document.activeElement !== el) return;
    const at = caretFromRight(el.value, caret.current);
    el.setSelectionRange(at, at);
    caret.current = null;
  }, [text, caretTick]);

  const show = (digits: string, keepRight: number) => {
    caret.current = keepRight;
    setText(digits ? fmt(Number(digits)) : '');
    setCaretTick((t) => t + 1);
  };

  const commit = (raw: string) => {
    const v = clampScore(digitsIn(raw));
    if (v !== (team.score ?? 0)) updateTeam(team.id, { score: v });
    setText(v ? fmt(v) : '');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (e.key === 'Enter') {
      el.blur();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const keepRight = digitsRightOf(el.value, el.selectionStart ?? el.value.length);
      const v = clampScore(Number(digitsIn(el.value) || 0) + (e.key === 'ArrowUp' ? 1 : -1));
      updateTeam(team.id, { score: v });
      show(v ? String(v) : '', keepRight);
      return;
    }
    // Backspace/Delete next to a separator removes the digit beyond it instead.
    const start = el.selectionStart ?? 0;
    if (start !== el.selectionEnd) return;
    if (e.key === 'Backspace' && start > 0 && el.value[start - 1] === ',') el.setSelectionRange(start - 1, start - 1);
    if (e.key === 'Delete' && el.value[start] === ',') el.setSelectionRange(start + 1, start + 1);
  };

  return (
    <label className="score-field">
      <span className="eyebrow">Points</span>
      <span className="score-input">
        <input
          ref={inputRef}
          inputMode="numeric"
          value={text}
          placeholder="0"
          aria-label={`${team.name} points`}
          onChange={(e) => {
            const el = e.target;
            const keepRight = digitsRightOf(el.value, el.selectionStart ?? el.value.length);
            const digits = digitsIn(el.value).replace(/^0+/, '');
            show(digits.slice(0, 7), Math.min(keepRight, Math.min(digits.length, 7)));
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <span className="mono muted">pts</span>
      </span>
    </label>
  );
}

/** Circuit buff: the picked buff as a card; opens a list of every buff with its full text. */
function BuffPicker({ team }: { team: Team }) {
  const tower = useMatrix((s) => s.tower);
  const status = useMatrix((s) => s.status);
  const teams = useStore((s) => s.teams);
  const updateTeam = useStore((s) => s.updateTeam);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const buff = findBuff(tower, team.buffId ?? null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Portal popover (team cards clip overflow): below the trigger, above it when short on room.
  useLayoutEffect(() => {
    if (!open) return setPos(null);
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      const pop = popRef.current;
      if (!r || !pop) return;
      const edge = 8;
      const vw = document.documentElement.clientWidth;
      const width = Math.min(420, vw - edge * 2);
      const h = pop.getBoundingClientRect().height;
      let top = r.bottom + 6;
      if (top + h > window.innerHeight - edge && r.top - 6 - h >= edge) top = r.top - 6 - h;
      const left = Math.min(Math.max(r.left, edge), vw - width - edge);
      setPos({ top, left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Once placed, move focus into the list (the picked buff, else the first one).
  const placed = pos !== null;
  useEffect(() => {
    if (!open || !placed) return;
    const list = popRef.current;
    (list?.querySelector<HTMLElement>('[aria-checked="true"]') ?? list?.querySelector<HTMLElement>('[role="radio"]'))?.focus();
  }, [open, placed]);

  if (!tower) {
    return <div className="buff-pick muted">{status === 'error' ? 'Circuit buffs unavailable' : 'Loading circuit buffs'}</div>;
  }

  const usedBy = (b: MatrixBuff) => teams.filter((t) => t.buffId === b.id && t.id !== team.id).length;
  const pick = (id: string | null) => {
    updateTeam(team.id, { buffId: id });
    setOpen(false);
    btnRef.current?.focus();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`buff-pick ${buff ? 'set' : ''} ${open ? 'open' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={buff ? `${buff.name}\n\n${buff.desc}` : 'Choose a circuit buff'}
      >
        <span className="buff-ink">{buff ? <Img src={buff.icon} alt="" eager /> : <Icon name="plus" size={16} />}</span>
        <span className="buff-label">
          <span className="eyebrow">Circuit buff</span>
          <span className="buff-name">{buff ? buff.name : 'Choose a buff'}</span>
        </span>
        <Icon name="caret" size={14} />
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="buff-pop"
            role="dialog"
            aria-label={`Circuit buff for ${team.name}`}
            style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { top: 0, left: 0, visibility: 'hidden' }}
          >
            <div className="buff-pop-head">
              <span className="eyebrow">Circuit buff</span>
              <span className="muted">{tower.phase || tower.name}</span>
            </div>
            <div className="buff-list" role="radiogroup" aria-label="Circuit buffs">
              {tower.buffs.map((b, i) => {
                const on = team.buffId === b.id;
                const n = usedBy(b);
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    className={`buff-card ${on ? 'on' : ''}`}
                    style={{ '--i': i } as React.CSSProperties}
                    onClick={() => pick(on ? null : b.id)}
                  >
                    <span className="buff-ink">
                      <Img src={b.icon} alt="" eager />
                    </span>
                    <span className="buff-card-text">
                      <span className="buff-card-top">
                        <strong>{b.name}</strong>
                        {n > 0 && <span className="buff-used mono">{n} other team{n === 1 ? '' : 's'}</span>}
                      </span>
                      <span className="buff-desc">{b.desc}</span>
                    </span>
                    {on && (
                      <span className="buff-on" aria-hidden="true">
                        <Icon name="check" size={12} weight="bold" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {buff && (
              <button type="button" className="buff-clear" onClick={() => pick(null)}>
                Remove buff
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Matrix block under a team's slots: buff, points, and how far those points carry the run. */
/** Team members whose element a boss on this team's run resists. */
function ResistNote({ clashes }: { clashes: ResistClash[] }) {
  if (!clashes.length) return null;
  return (
    <div className="mx-resist" role="status">
      <span className="mx-resist-head">
        <Icon name="warning" size={13} weight="bold" /> Element resisted on this run
      </span>
      <ul>
        {clashes.map((c) => {
          // Group repeat visits to the same boss: "Denia R1, R2".
          const byName = new Map<string, number[]>();
          for (const b of c.bosses) byName.set(b.name, [...(byName.get(b.name) ?? []), b.round]);
          return (
            <li key={c.name}>
              <ElementIcon id={c.element} size={15} />
              <strong>{c.name}</strong>
              <span className="muted">vs</span>
              <span>
                {[...byName.entries()].map(([n, rounds]) => `${n} ${rounds.map((r) => `R${r}`).join(', ')}`).join(' · ')}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MatrixTeamPanel({ team }: { team: Team }) {
  const { byTeam } = useRuns();
  const bosses = useMatrix((s) => s.tower?.bosses);
  const run = byTeam.get(team.id);
  const clashes = useResistClashes(team, run);
  return (
    <div className="mx-team">
      <div className="mx-row">
        <BuffPicker team={team} />
        <ScoreInput team={team} />
      </div>
      {run ? (
        <RunSpan run={run} bosses={bosses} clashes={clashes} />
      ) : (
        <p className="run-empty muted">Extra team: its points aren't counted in the plan and it isn't exported. Switch it on to count it.</p>
      )}
      <ResistNote clashes={clashes} />
    </div>
  );
}
