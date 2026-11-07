import { useDraggable } from '@dnd-kit/core';
import { memo, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { ELEMENTS, WEAPON_TYPES, type Character } from '../lib/data';
import { useGame } from '../lib/game';
import { useEnhanced, useVigor, type VigorInfo } from '../lib/matrixHooks';
import { isRover, vigorGroup } from '../lib/matrixPlan';
import { useStore, type Team } from '../lib/store';
import { ElementIcon, Icon, Img, VigorIcon } from './ui';

/** Roster width range in px; the widen button jumps to ROSTER_WIDE. */
export const ROSTER_MIN = 300;
export const ROSTER_MAX = 760;
const ROSTER_WIDE = 560;

/** Drag payload for a roster character (dropped onto a team slot). */
export interface RosterDragData {
  type: 'roster';
  charId: string;
}

/** Vigor as pips: filled = left to use. */
export function VigorPips({ v, compact }: { v: VigorInfo; compact?: boolean }) {
  return (
    <span
      className={`vigor ${v.left === 0 ? 'out' : v.left < v.max ? 'part' : 'full'} ${compact ? 'compact' : ''}`}
      title={`Vigor ${v.left}/${v.max}: usable in ${v.left} more team${v.left === 1 ? '' : 's'}`}
    >
      <VigorIcon size={13} />
      {v.max <= 4 ? (
        <span className="vigor-pips" aria-hidden="true">
          {Array.from({ length: v.max }, (_, i) => (
            <i key={i} className={i < v.left ? 'on' : ''} />
          ))}
        </span>
      ) : null}
      <span className="mono">
        {v.left}/{v.max}
      </span>
    </span>
  );
}

const RosterTile = memo(function RosterTile({
  char,
  vigor,
  enhanced,
  onAdd,
}: {
  char: Character;
  vigor: VigorInfo;
  enhanced: string | undefined;
  onAdd: (id: string) => void;
}) {
  const out = vigor.left === 0;
  const drag = useDraggable({ id: `roster:${char.id}`, data: { type: 'roster', charId: char.id } satisfies RosterDragData, disabled: out });
  return (
    <button
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      type="button"
      className={`r-tile r${char.rarity} ${out ? 'is-out' : ''} ${drag.isDragging ? 'dragging' : ''}`}
      style={{ '--el': ELEMENTS[char.element]?.color ?? 'transparent' } as React.CSSProperties}
      onClick={() => !out && onAdd(char.id)}
      aria-disabled={out}
      aria-label={`${char.name}, Vigor ${vigor.left} of ${vigor.max}${out ? ', none left' : '. Click to add to the active team, or drag onto a slot'}`}
      title={out ? `${char.name}: no Vigor left` : `${char.name}: click to add, or drag onto a slot`}
    >
      <span className="r-art">
        {char.portrait ? <Img src={char.icon || char.portrait} alt="" /> : <span className="unknown-mark initial">{char.name[0]}</span>}
        {enhanced && (
          <span className="r-enh" title={`Enhanced this cycle: ${enhanced}`}>
            <Icon name="sparkle" size={11} weight="fill" />
          </span>
        )}
        {char.element ? (
          <span className="r-el">
            <ElementIcon id={char.element} size={14} />
          </span>
        ) : null}
      </span>
      <span className="r-name">{isRover(char.id) ? char.name.replace(/^Rover\s*/i, 'Rover ').trim() : char.name}</span>
      <VigorPips v={vigor} compact />
    </button>
  );
});

type Tab = 'owned' | 'manage';

/**
 * Matrix roster: the characters the player owns, with Vigor left. Owned
 * characters can be dragged onto any slot, or clicked to fill the active
 * team's next empty slot. The Manage tab picks which characters are owned
 * and lets a Max Vigor be adjusted by hand.
 */
export function MatrixRoster({
  teams,
  activeTeamId,
  onActiveTeam,
  onAdd,
  width,
  onWidth,
}: {
  teams: Team[];
  activeTeamId: string | null;
  onActiveTeam: (id: string) => void;
  onAdd: (charId: string) => void;
  /** Panel width in px; drag the right edge or use the widen button to change it. */
  width: number;
  onWidth: (w: number) => void;
}) {
  const resizeFrom = useRef<{ x: number; w: number } | null>(null);
  const wide = width >= ROSTER_WIDE - 20;
  const onResizeDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeFrom.current = { x: e.clientX, w: width };
    document.body.classList.add('is-resizing');
  };
  const onResizeMove = (e: PointerEvent<HTMLDivElement>) => {
    if (resizeFrom.current) onWidth(resizeFrom.current.w + e.clientX - resizeFrom.current.x);
  };
  const onResizeUp = () => {
    resizeFrom.current = null;
    document.body.classList.remove('is-resizing');
  };
  const onResizeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 80 : 20;
    const to = { ArrowLeft: width - step, ArrowRight: width + step, Home: ROSTER_MIN, End: ROSTER_MAX }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    onWidth(to);
  };
  const data = useGame((s) => s.data);
  const owned = useStore((s) => s.owned);
  const setOwned = useStore((s) => s.setOwned);
  const overrides = useStore((s) => s.vigorOverride);
  const setVigorOverride = useStore((s) => s.setVigorOverride);
  const vigorFor = useVigor();
  const enhanced = useEnhanced();
  const ownedCount = Object.keys(owned).length;
  const [tab, setTab] = useState<Tab>(ownedCount ? 'owned' : 'manage');
  const [q, setQ] = useState('');
  const [el, setEl] = useState<number | null>(null);
  const [wt, setWt] = useState<number | null>(null);

  const all = useMemo(() => Object.values(data?.characters ?? {}).sort((a, b) => a.order - b.order), [data]);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter(
      (c) =>
        (tab === 'manage' || owned[c.id]) &&
        (!term || c.name.toLowerCase().includes(term)) &&
        (!el || c.elements.includes(el)) &&
        (!wt || c.weaponType === wt),
    );
  }, [all, tab, owned, q, el, wt]);

  const activeIndex = teams.findIndex((t) => t.id === activeTeamId);

  return (
    <aside className="roster" aria-label="Matrix roster">
      <div className="roster-head">
        <div className="roster-title">
          <span className="eyebrow">Roster</span>
          <h3>
            {tab === 'owned' ? 'Owned' : 'Pick owned'} <span className="mono count">{tab === 'owned' ? list.length : ownedCount}</span>
          </h3>
        </div>
        <div className="roster-head-tools">
        <button
          type="button"
          className="icon-btn sm"
          onClick={() => onWidth(wide ? ROSTER_MIN : ROSTER_WIDE)}
          aria-label={wide ? 'Narrow the roster' : 'Widen the roster'}
          title={wide ? 'Narrow the roster' : 'Widen the roster (or drag its right edge)'}
        >
          <Icon name={wide ? 'narrow' : 'widen'} size={16} />
        </button>
        <div className="seg sm" role="tablist" aria-label="Roster view">
          <button role="tab" aria-selected={tab === 'owned'} className={tab === 'owned' ? 'on' : ''} onClick={() => setTab('owned')}>
            Owned
          </button>
          <button role="tab" aria-selected={tab === 'manage'} className={tab === 'manage' ? 'on' : ''} onClick={() => setTab('manage')}>
            Manage
          </button>
        </div>
        </div>
      </div>

      {tab === 'owned' && teams.length > 0 && (
        <label className="roster-target" title="Click a resonator to fill this team. When it is full, the next team with room takes over.">
          <span className="target-dot" aria-hidden="true" />
          <span className="roster-target-text">
            <span className="eyebrow">Click adds to</span>
            <select value={activeTeamId ?? ''} onChange={(e) => onActiveTeam(e.target.value)}>
              {teams.map((t, i) => (
                <option key={t.id} value={t.id}>
                  {String(i + 1).padStart(2, '0')} · {t.name || 'Team'}
                </option>
              ))}
            </select>
          </span>
          {activeIndex >= 0 && (
            <span className="target-pips" aria-label={`${teams[activeIndex].slots.filter((s) => s.charId).length} of 3 slots filled`}>
              {teams[activeIndex].slots.map((s, i) => (
                <i key={i} className={s.charId ? 'on' : ''} />
              ))}
            </span>
          )}
        </label>
      )}

      <div className="roster-filters">
        <div className="search sm">
          <Icon name="search" size={14} />
          <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search roster" />
        </div>
        <div className="el-filter" role="group" aria-label="Element">
          {Object.entries(ELEMENTS).map(([id, e]) => {
            const n = Number(id);
            return (
              <button
                key={id}
                type="button"
                className={el === n ? 'on' : ''}
                aria-pressed={el === n}
                onClick={() => setEl(el === n ? null : n)}
                title={e.name}
                aria-label={e.name}
              >
                <ElementIcon id={n} size={18} />
              </button>
            );
          })}
        </div>
        <div className="chips tight" role="group" aria-label="Weapon">
          {Object.entries(WEAPON_TYPES).map(([id, name]) => {
            const n = Number(id);
            return (
              <button key={id} className={wt === n ? 'chip on' : 'chip'} aria-pressed={wt === n} onClick={() => setWt(wt === n ? null : n)}>
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'manage' ? (
        <>
          <div className="roster-bulk">
            <span className="muted">Tap to mark owned. The number is Max Vigor; tap it to change.</span>
            <span className="row-gap">
              <button className="btn sm quiet" onClick={() => setOwned(list.map((c) => c.id), true)}>
                All
              </button>
              <button className="btn sm quiet" onClick={() => setOwned(list.map((c) => c.id), false)}>
                None
              </button>
            </span>
          </div>
          <div className="roster-grid manage">
            {list.map((c) => {
              const on = !!owned[c.id];
              const v = vigorFor(c);
              const group = vigorGroup(c.id);
              return (
                <div key={c.id} className={`m-tile r${c.rarity} ${on ? 'on' : ''}`} style={{ '--el': ELEMENTS[c.element]?.color ?? 'transparent' } as React.CSSProperties}>
                  <button type="button" className="m-pick" aria-pressed={on} onClick={() => setOwned([c.id], !on)} title={on ? `${c.name}: owned` : `Mark ${c.name} as owned`}>
                    <span className="r-art">
                      {c.portrait ? <Img src={c.icon || c.portrait} alt="" /> : <span className="unknown-mark initial">{c.name[0]}</span>}
                      <span className="m-check" aria-hidden="true">
                        <Icon name="check" size={12} weight="bold" />
                      </span>
                    </span>
                    <span className="r-name">{c.name}</span>
                  </button>
                  <button
                    type="button"
                    className={`m-vigor ${overrides[group] ? 'custom' : ''}`}
                    onClick={() => setVigorOverride(group, v.max >= 4 ? null : v.max + 1)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setVigorOverride(group, null);
                    }}
                    title={`Max Vigor ${v.max}${overrides[group] ? ' (set by hand; right-click to reset)' : ''}. Click to change.`}
                    aria-label={`${c.name} Max Vigor ${v.max}. Click to change`}
                  >
                    <VigorIcon size={13} />
                    <span className="mono">{v.max}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : list.length ? (
        <div className="roster-grid">
          {list.map((c) => (
            <RosterTile key={c.id} char={c} vigor={vigorFor(c)} enhanced={enhanced.get(c.id)} onAdd={onAdd} />
          ))}
        </div>
      ) : (
        <div className="roster-empty">
          <Icon name="users" size={22} />
          <p>{ownedCount ? 'No owned resonator matches these filters.' : 'Mark the resonators you own, then drag them into teams.'}</p>
          {!ownedCount && (
            <button className="btn sm primary" onClick={() => setTab('manage')}>
              Pick owned resonators
            </button>
          )}
        </div>
      )}

      <div
        className="roster-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Roster width"
        aria-valuemin={ROSTER_MIN}
        aria-valuemax={ROSTER_MAX}
        aria-valuenow={width}
        tabIndex={0}
        title="Drag to resize the roster. Double-click to reset."
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
        onPointerCancel={onResizeUp}
        onDoubleClick={() => onWidth(ROSTER_MIN)}
        onKeyDown={onResizeKey}
      />

      <p className="roster-foot muted">
        <VigorIcon size={13} /> Vigor: each use in a team costs 1. All Rovers share one.
        {enhanced.size ? (
          <>
            {' '}
            <Icon name="sparkle" size={11} weight="fill" /> Enhanced this cycle.
          </>
        ) : null}
      </p>
    </aside>
  );
}
