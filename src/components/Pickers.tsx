import { useMemo, useState, type ReactNode } from 'react';
import { ELEMENTS, UNKNOWN_ID, WEAPON_TYPES, type Character } from '../lib/data';
import { UNKNOWN_CHARACTER, useGame } from '../lib/game';
import { useStore } from '../lib/store';
import { ElementIcon, Icon, Img, Modal } from './ui';

function SearchBox({ value, onChange, count }: { value: string; onChange: (v: string) => void; count: number }) {
  return (
    <div className="search">
      <Icon name="search" size={16} />
      <input autoFocus placeholder="Search" value={value} onChange={(e) => onChange(e.target.value)} />
      <span className="search-count">{count}</span>
    </div>
  );
}

function Chips<T extends string | number>({
  options,
  value,
  onChange,
  allLabel = 'All',
}: {
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  value: T | null;
  onChange: (v: T | null) => void;
  allLabel?: string;
}) {
  return (
    <div className="chips">
      <button className={value === null ? 'chip on' : 'chip'} aria-pressed={value === null} onClick={() => onChange(null)}>
        {allLabel}
      </button>
      {options.map((o) => (
        <button
          key={String(o.value)}
          className={value === o.value ? 'chip on' : 'chip'}
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? null : o.value)}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function CharacterPicker({
  teamCharIds,
  slots,
  onPick,
  onClose,
}: {
  /** Characters already in the team being edited (can't be picked twice). */
  teamCharIds: Array<string | null>;
  /** How many characters to pick (1 for a slot, up to 3 for "Pick 3"). */
  slots: number;
  onPick: (ids: string[]) => void;
  onClose: () => void;
}) {
  const data = useGame((s) => s.data);
  const teams = useStore((s) => s.teams);
  const [q, setQ] = useState('');
  const [el, setEl] = useState<number | null>(null);
  const [wt, setWt] = useState<number | null>(null);
  const [rar, setRar] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const usage = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of teams) for (const s of t.slots) if (s.charId) m[s.charId] = (m[s.charId] ?? 0) + 1;
    return m;
  }, [teams]);

  const list = useMemo(() => {
    const all = Object.values(data?.characters ?? {});
    const term = q.trim().toLowerCase();
    return all
      .filter(
        (c) =>
          (!term || c.name.toLowerCase().includes(term)) &&
          (!el || c.elements.includes(el)) &&
          (!wt || c.weaponType === wt) &&
          (!rar || c.rarity === rar),
      )
      .sort((a, b) => a.order - b.order);
  }, [data, q, el, wt, rar]);

  const showUnknown = !q && !el && !wt && !rar;
  const multi = slots > 1;

  const choose = (c: Character) => {
    if (!multi) return onPick([c.id]);
    if (picked.includes(c.id)) return setPicked(picked.filter((x) => x !== c.id));
    const next = [...picked, c.id];
    if (next.length >= slots) return onPick(next);
    setPicked(next);
  };

  const tiles = showUnknown ? [UNKNOWN_CHARACTER, ...list] : list;

  return (
    <Modal
      title={multi ? `Pick up to ${slots} characters · ${picked.length}/${slots}` : 'Choose a character'}
      onClose={onClose}
      wide
      footer={
        multi ? (
          <>
            <span className="muted">Picks fill the team's empty slots in order.</span>
            <button className="btn" disabled={!picked.length} onClick={() => onPick(picked)}>
              Use {picked.length} selected
            </button>
          </>
        ) : undefined
      }
    >
      <SearchBox value={q} onChange={setQ} count={tiles.length} />
      <div className="filters">
        <Chips
          options={Object.entries(ELEMENTS).map(([k, v]) => ({ value: Number(k), label: v.name, icon: <ElementIcon id={Number(k)} size={16} /> }))}
          value={el}
          onChange={setEl}
          allLabel="All elements"
        />
        <Chips
          options={Object.entries(WEAPON_TYPES).map(([k, v]) => ({ value: Number(k), label: v }))}
          value={wt}
          onChange={setWt}
          allLabel="All weapons"
        />
        <Chips options={[{ value: 5, label: '5★' }, { value: 4, label: '4★' }]} value={rar} onChange={setRar} allLabel="Any rarity" />
      </div>
      <div className="char-grid">
        {tiles.map((c) => {
          const inTeam = c.id !== UNKNOWN_ID && teamCharIds.includes(c.id);
          const order = picked.indexOf(c.id);
          return (
            <button
              key={c.id}
              className={`char-tile r${c.rarity} ${order >= 0 ? 'picked' : ''}`}
              disabled={inTeam}
              title={inTeam ? 'Already in this team' : c.modes.length >= 2 && c.kind === 'dual' ? `${c.name} · ${c.modes.join(' / ')}` : c.name}
              style={{ '--el': ELEMENTS[c.element]?.color ?? 'transparent' } as React.CSSProperties}
              onClick={() => choose(c)}
            >
              {c.id === UNKNOWN_ID ? (
                <span className="unknown-mark">?</span>
              ) : c.portrait ? (
                <Img src={c.portrait} alt="" className="char-tile-img" />
              ) : (
                <span className="unknown-mark initial">{c.name.slice(0, 1)}</span>
              )}
              {usage[c.id] ? (
                <span className="use-count" title={`In ${usage[c.id]} team${usage[c.id] === 1 ? '' : 's'}`}>
                  {usage[c.id]}
                </span>
              ) : null}
              {order >= 0 && <span className="pick-order">{order + 1}</span>}
              <span className="char-tile-els">
                {(c.kind === 'element' ? c.elements : [c.element]).map((e) => (
                  <ElementIcon key={e} id={e} size={c.kind === 'element' ? 14 : 18} />
                ))}
              </span>
              <span className="char-tile-name">
                {c.name}
                {c.kind === 'dual' && <small>Dual mode</small>}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function WeaponPicker({
  weaponType,
  onPick,
  onClose,
}: {
  weaponType: number;
  onPick: (id: string | null) => void;
  onClose: () => void;
}) {
  const data = useGame((s) => s.data);
  const [q, setQ] = useState('');
  const [rar, setRar] = useState<number | null>(null);
  const [anyType, setAnyType] = useState(!weaponType);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return Object.values(data?.weapons ?? {})
      .filter((w) => (anyType || w.type === weaponType) && (!term || w.name.toLowerCase().includes(term)) && (!rar || w.rarity === rar))
      .sort((a, b) => b.rarity - a.rarity || Number(b.id) - Number(a.id));
  }, [data, q, rar, anyType, weaponType]);

  return (
    <Modal
      title={anyType ? 'Choose a weapon' : `Choose a weapon · ${WEAPON_TYPES[weaponType] ?? ''}`}
      onClose={onClose}
      wide
      footer={
        <>
          {weaponType ? (
            <label className="check">
              <input type="checkbox" checked={anyType} onChange={(e) => setAnyType(e.target.checked)} /> Show all weapon types
            </label>
          ) : (
            <span />
          )}
          <button className="btn quiet" onClick={() => onPick(null)}>
            Clear weapon
          </button>
        </>
      }
    >
      <SearchBox value={q} onChange={setQ} count={list.length} />
      <div className="filters">
        <Chips
          options={[5, 4, 3, 2, 1].map((r) => ({ value: r, label: `${r}★` }))}
          value={rar}
          onChange={setRar}
          allLabel="Any rarity"
        />
      </div>
      <div className="item-grid">
        {list.map((w) => (
          <button key={w.id} className={`item-tile r${w.rarity}`} onClick={() => onPick(w.id)} title={w.name}>
            <Img src={w.icon} alt="" />
            <span>{w.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function SonataPicker({ onPick, onClose }: { onPick: (id: string | null) => void; onClose: () => void }) {
  const data = useGame((s) => s.data);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return Object.values(data?.sonatas ?? {})
      .filter((s) => !term || s.name.toLowerCase().includes(term))
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [data, q]);

  return (
    <Modal
      title="Choose a Sonata Set"
      onClose={onClose}
      wide
      footer={
        <>
          <span />
          <button className="btn quiet" onClick={() => onPick(null)}>
            Clear Sonata
          </button>
        </>
      }
    >
      <SearchBox value={q} onChange={setQ} count={list.length} />
      <div className="item-grid">
        {list.map((s) => (
          <button key={s.id} className="item-tile sonata" onClick={() => onPick(s.id)} title={s.name}>
            <Img src={s.icon} alt="" />
            <span>{s.name}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
