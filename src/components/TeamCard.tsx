import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useEffect, useState } from 'react';
import { ELEMENTS, UNKNOWN_ID } from '../lib/data';
import { useCharacter, useGame } from '../lib/game';
import { useStore, type Slot, type SlotRef, type Team } from '../lib/store';
import { Icon, Img, LevelBadge } from './ui';

export type PickerRequest =
  | { kind: 'char'; ref: SlotRef }
  | { kind: 'pick3'; teamId: string }
  | { kind: 'weapon'; ref: SlotRef }
  | { kind: 'sonata'; ref: SlotRef };

export const slotKey = (r: SlotRef) => `${r.teamId}:${r.index}`;

export function ModeToggle({ modes, value, onChange }: { modes: string[]; value: string; onChange: (m: string) => void }) {
  return (
    <div className="mode-toggle" role="radiogroup" aria-label="Combat mode" onPointerDown={(e) => e.stopPropagation()}>
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={m === value}
          className={m === value ? 'on' : ''}
          onClick={() => onChange(m)}
          title={m}
          aria-label={m}
        >
          {m.replace(/^Tune /, '')}
        </button>
      ))}
    </div>
  );
}

function SlotCard({ team, index, slot, onPicker }: { team: Team; index: number; slot: Slot; onPicker: (r: PickerRequest) => void }) {
  const ref: SlotRef = { teamId: team.id, index };
  const id = slotKey(ref);
  const char = useCharacter(slot.charId);
  const data = useGame((s) => s.data);
  const modes = useGame((s) => (slot.charId ? s.modes[slot.charId] : undefined));
  const ensureModes = useGame((s) => s.ensureModes);
  const updateSlot = useStore((s) => s.updateSlot);
  const clearSlot = useStore((s) => s.clearSlot);

  useEffect(() => ensureModes(slot.charId), [slot.charId, ensureModes]);

  const drag = useDraggable({ id, data: ref, disabled: !slot.charId });
  const drop = useDroppable({ id, data: ref });

  const weapon = slot.weaponId ? data?.weapons[slot.weaponId] : null;
  const sonata = slot.sonataId ? data?.sonatas[slot.sonataId] : null;
  const elColor = char ? ELEMENTS[char.element]?.color ?? '#7d8597' : '#3a4050';
  const dual = modes && modes.length >= 2 ? modes : null;
  const isUnknown = slot.charId === UNKNOWN_ID;

  return (
    <div
      ref={drop.setNodeRef}
      className={`slot ${drop.isOver ? 'drop-over' : ''} ${drag.isDragging ? 'dragging' : ''}`}
      style={{ '--el': elColor } as React.CSSProperties}
    >
      <div
        ref={drag.setNodeRef}
        {...drag.attributes}
        {...drag.listeners}
        role="button"
        tabIndex={0}
        aria-disabled={false}
        aria-label={char ? `${char.name}. Click to change, drag to move` : 'Choose character'}
        className={`portrait ${char ? `r${char.rarity}` : 'empty'}`}
        onClick={() => onPicker({ kind: 'char', ref })}
        onKeyDown={(e) => e.key === 'Enter' && onPicker({ kind: 'char', ref })}
      >
        {char ? (
          <>
            {isUnknown ? <span className="unknown-mark">?</span> : <Img src={char.portrait} alt="" className="portrait-img" />}
            <LevelBadge
              prefix="S"
              value={slot.seq}
              min={0}
              max={6}
              title="Sequence"
              className="seq"
              onChange={(v) => updateSlot(ref, { seq: v })}
            />
            <button
              className="slot-x"
              aria-label="Remove character"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                clearSlot(ref);
              }}
            >
              <Icon name="x" size={14} />
            </button>
            <span className="portrait-name">{char.name}</span>
          </>
        ) : (
          <span className="portrait-add">
            <Icon name="plus" size={26} />
            <span>Choose character</span>
          </span>
        )}
      </div>

      <div className="mode-row">
        {dual && slot.charId && (
          <ModeToggle modes={dual} value={slot.mode && dual.includes(slot.mode) ? slot.mode : dual[0]} onChange={(m) => updateSlot(ref, { mode: m })} />
        )}
      </div>

      <div className="gear">
        <div className={`gear-tile ${weapon ? `r${weapon.rarity}` : ''}`}>
          <button
            className="gear-btn"
            disabled={!slot.charId}
            onClick={() => onPicker({ kind: 'weapon', ref })}
            title={weapon ? weapon.name : 'Choose weapon'}
            aria-label={weapon ? `Weapon: ${weapon.name}` : 'Choose weapon'}
          >
            {weapon ? <Img src={weapon.icon} alt="" /> : <Icon name="plus" />}
          </button>
          {weapon && (
            <LevelBadge prefix="R" value={slot.rank} min={1} max={5} title="Weapon rank" className="rank" onChange={(v) => updateSlot(ref, { rank: v })} />
          )}
        </div>
        <div className="gear-tile sonata">
          <button
            className="gear-btn"
            disabled={!slot.charId}
            onClick={() => onPicker({ kind: 'sonata', ref })}
            title={sonata ? sonata.name : 'Choose Sonata Set'}
            aria-label={sonata ? `Sonata: ${sonata.name}` : 'Choose Sonata Set'}
          >
            {sonata ? <Img src={sonata.icon} alt="" /> : <Icon name="plus" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TeamCard({
  team,
  index,
  total,
  onPicker,
}: {
  team: Team;
  index: number;
  total: number;
  onPicker: (r: PickerRequest) => void;
}) {
  const { updateTeam, moveTeam, duplicateTeam, removeTeam } = useStore();
  const [notesOpen, setNotesOpen] = useState(!!team.notes);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hasEmpty = team.slots.some((s) => !s.charId);

  return (
    <section className={`team ${team.include ? '' : 'excluded'}`} aria-label={team.name}>
      <header className="team-head">
        <span className="team-index">
          Team {index + 1}
          <small> / {total}</small>
        </span>
        <input
          className="team-name"
          value={team.name}
          maxLength={80}
          onChange={(e) => updateTeam(team.id, { name: e.target.value })}
          aria-label="Team name"
          placeholder="Team name"
        />
        <label className="include" title="Include this team in the image export">
          <input type="checkbox" checked={team.include} onChange={(e) => updateTeam(team.id, { include: e.target.checked })} />
          <span>Export</span>
        </label>
      </header>

      <div className="team-tools">
        <button className="icon-btn" disabled={index === 0} onClick={() => moveTeam(team.id, -1)} aria-label="Move team earlier" title="Move earlier">
          <Icon name="left" />
        </button>
        <button className="icon-btn" disabled={index === total - 1} onClick={() => moveTeam(team.id, 1)} aria-label="Move team later" title="Move later">
          <Icon name="right" />
        </button>
        <button className="btn sm" disabled={!hasEmpty} onClick={() => onPicker({ kind: 'pick3', teamId: team.id })}>
          <Icon name="users" size={16} /> Pick 3
        </button>
        <button className="btn sm" onClick={() => duplicateTeam(team.id)}>
          <Icon name="copy" size={16} /> Duplicate
        </button>
        <button className={`btn sm ${notesOpen ? 'active' : ''}`} onClick={() => setNotesOpen((o) => !o)}>
          <Icon name="note" size={16} /> Notes
        </button>
        <span className="spacer" />
        {confirmDelete ? (
          <span className="confirm">
            Delete?
            <button className="btn sm danger" onClick={() => removeTeam(team.id)}>
              Yes
            </button>
            <button className="btn sm ghost" onClick={() => setConfirmDelete(false)}>
              No
            </button>
          </span>
        ) : (
          <button className="btn sm danger-ghost" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={16} /> Delete
          </button>
        )}
      </div>

      <div className="slots">
        {team.slots.map((s, i) => (
          <SlotCard key={i} team={team} index={i} slot={s} onPicker={onPicker} />
        ))}
      </div>

      {notesOpen && (
        <textarea
          className="notes"
          value={team.notes}
          maxLength={2000}
          rows={3}
          placeholder="Notes: rotation, echo main stats, who the team is for…"
          onChange={(e) => updateTeam(team.id, { notes: e.target.value })}
          aria-label="Team notes"
        />
      )}
    </section>
  );
}
