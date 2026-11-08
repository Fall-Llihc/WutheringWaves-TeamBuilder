import { useMemo } from 'react';
import { ELEMENTS } from '../lib/data';
import { lookupCharacter, useGame } from '../lib/game';
import { vigorGroup } from '../lib/matrixPlan';
import { useStore } from '../lib/store';
import { costUsage, TOWER, towerPageUrl, useTower, type RichText, type TowerCycle, type TowerFloor } from '../lib/tower';
import { ElementIcon, Icon, Img, VigorIcon } from './ui';

const day = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const fmtDay = (d: Date | null) => (d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const daysBetween = (a: number, b: number) => Math.max(0, Math.ceil((b - a) / 86_400_000));

/** Buff text with the game's element colour tags drawn in the element's colour. */
export function Rich({ text }: { text: RichText }) {
  return (
    <>
      {text.map((r, i) =>
        r.el ? (
          <span key={i} className="rich-el" style={{ '--el': ELEMENTS[r.el]?.color } as React.CSSProperties}>
            {r.text}
          </span>
        ) : (
          <span key={i}>{r.text}</span>
        ),
      )}
    </>
  );
}

/** Right side of a floor row: the enemies with their element, the recommended elements and the floor's buffs. */
export function TowerFloorPanel({ floor, loading }: { floor: TowerFloor | null; loading: boolean }) {
  if (!floor) {
    return (
      <aside className={`floor-info ${loading ? 'is-loading' : 'is-empty'}`} aria-busy={loading}>
        {loading ? (
          <>
            <span className="skel w60" />
            <span className="skel w90" />
            <span className="skel w75" />
          </>
        ) : (
          <p className="muted">No data for this floor yet.</p>
        )}
      </aside>
    );
  }
  const resists = [...new Set(floor.enemies.flatMap((e) => e.elements))];
  return (
    <aside className="floor-info" aria-label={`Floor ${floor.key} enemies and buffs`}>
      <div className="fi-tags">
        {resists.length > 0 && (
          <span className="fi-tag" title="Enemies take less damage from their own element">
            <span className="eyebrow">Enemy element</span>
            <span className="fi-els">
              {resists.map((el) => (
                <ElementIcon key={el} id={el} size={18} title={ELEMENTS[el]?.name} />
              ))}
            </span>
          </span>
        )}
        {floor.recommend.length > 0 && (
          <span className="fi-tag rec" title="Elements the game recommends for this floor">
            <span className="eyebrow">Recommended</span>
            <span className="fi-els">
              {floor.recommend.map((el) => (
                <ElementIcon key={el} id={el} size={18} title={ELEMENTS[el]?.name} />
              ))}
            </span>
          </span>
        )}
      </div>

      <ul className="fi-enemies">
        {floor.enemies.map((e, i) => (
          <li key={i} style={{ '--el': ELEMENTS[e.elements[0]]?.color ?? 'transparent' } as React.CSSProperties}>
            <span className="fi-face">
              <Img src={e.icon} alt="" />
            </span>
            <span className="fi-name">
              <span>{e.name}</span>
              <span className="mono muted">Lv {e.level}</span>
            </span>
            <span className="fi-el" title={e.elements.map((el) => `${ELEMENTS[el]?.name} RES`).join(', ')}>
              {e.elements.map((el) => (
                <ElementIcon key={el} id={el} size={16} />
              ))}
            </span>
          </li>
        ))}
      </ul>

      {floor.buffs.length > 0 && (
        <ul className="fi-buffs" aria-label="Floor buffs">
          {floor.buffs.map((b, i) => (
            <li key={i}>
              <span className="buff-ink">
                <Img src={b.icon} alt="" />
              </span>
              <p>
                <Rich text={b.desc} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/**
 * Above the floors: which cycle is being planned (the active one, or the one
 * after it), its dates, and the cost each resonator in the plan has spent.
 */
export function TowerSummary({ which, onWhich }: { which: 'current' | 'next'; onWhich: (w: 'current' | 'next') => void }) {
  const activeId = useTower((s) => s.activeId);
  const cycles = useTower((s) => s.cycles);
  const status = useTower((s) => s.status);
  const errors = useTower((s) => s.errors);
  const teams = useStore((s) => s.teams);
  const data = useGame((s) => s.data);
  const id = which === 'current' ? activeId : activeId + 1;
  const cycle: TowerCycle | undefined = cycles[id];
  const nextMissing = status[activeId + 1] === 'error';

  const begin = day(cycle?.begin ?? '');
  const end = day(cycle?.end ?? '');
  const now = Date.now();
  const when =
    which === 'current'
      ? end
        ? `${daysBetween(now, end.getTime())} day${daysBetween(now, end.getTime()) === 1 ? '' : 's'} left`
        : ''
      : begin
        ? `starts in ${daysBetween(now, begin.getTime())} day${daysBetween(now, begin.getTime()) === 1 ? '' : 's'}`
        : '';

  // Every resonator in the plan with the cost they have spent, most first.
  const spent = useMemo(() => {
    const usage = costUsage(teams, cycle);
    const seen = new Map<string, { name: string; icon: string; used: number }>();
    for (const t of teams)
      for (const s of t.slots) {
        const c = lookupCharacter(data, s.charId);
        if (!c || c.id === 'unknown') continue;
        const g = vigorGroup(c.id);
        if (!seen.has(g)) seen.set(g, { name: g === 'rover' ? 'Rover' : c.name, icon: c.icon || c.portrait, used: usage[g] ?? 0 });
      }
    return [...seen.values()].sort((a, b) => b.used - a.used || a.name.localeCompare(b.name));
  }, [teams, cycle, data]);
  const over = spent.filter((s) => s.used > TOWER.cost);

  return (
    <section className="tw-summary" aria-label="Tower of Adversity cycle">
      <div className="tw-top">
        <div className="tw-cycle">
          <span className="eyebrow">Tower of Adversity</span>
          <strong>
            Cycle <span className="mono">{id}</span>
          </strong>
          <span className="muted">
            {begin && end ? `${fmtDay(begin)} – ${fmtDay(end)}` : status[id] === 'loading' ? 'Loading dates' : ''}
            {when ? <span className="tw-when"> · {when}</span> : null}
          </span>
        </div>

        <div className="seg tw-switch" role="tablist" aria-label="Cycle">
          <button role="tab" aria-selected={which === 'current'} className={which === 'current' ? 'on' : ''} onClick={() => onWhich('current')}>
            <span className="tw-dot live" aria-hidden="true" /> Active
          </button>
          <button
            role="tab"
            aria-selected={which === 'next'}
            className={which === 'next' ? 'on' : ''}
            onClick={() => onWhich('next')}
            disabled={nextMissing && which !== 'next'}
            title={nextMissing ? `Cycle ${activeId + 1} isn't in the data yet` : `Plan cycle ${activeId + 1}`}
          >
            <Icon name="hourglass" size={14} /> Next
          </button>
        </div>

        <div className="tw-meta">
          <span>
            <VigorIcon size={13} /> {TOWER.cost} cost per resonator
          </span>
          <a href={towerPageUrl(id)} target="_blank" rel="noreferrer">
            Tower data
          </a>
          {status[id] === 'error' && <span className="error-text">Cycle {id}: {errors[id]}</span>}
        </div>
      </div>

      {spent.length > 0 ? (
        <ul className="tw-spent" aria-label="Cost spent per resonator">
          {spent.map((s) => {
            const state = s.used > TOWER.cost ? 'over' : s.used === TOWER.cost ? 'full' : '';
            return (
              <li key={s.name} className={state} title={`${s.name}: ${s.used} of ${TOWER.cost} cost spent`}>
                <span className="tw-face">{s.icon ? <Img src={s.icon} alt="" /> : null}</span>
                <span className="tw-bar" aria-hidden="true">
                  <i style={{ transform: `scaleX(${Math.min(1, s.used / TOWER.cost)})` }} />
                </span>
                <span className="mono">
                  {s.used}/{TOWER.cost}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="tw-empty muted">Drag owned resonators from the roster onto the floors. Each floor takes its cost from everyone on it.</p>
      )}

      {over.length > 0 && (
        <p className="mx-warn" role="status">
          <VigorIcon size={15} /> Over cost: {over.map((s) => `${s.name} ${s.used}/${TOWER.cost}`).join(' · ')}.
        </p>
      )}
    </section>
  );
}
