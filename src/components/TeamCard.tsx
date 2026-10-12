import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useEffect, useState } from 'react';
import { activeMode, ELEMENTS, elementByName, slotElement, UNKNOWN_ID, type Character } from '../lib/data';
import { modesOf, useCharacter, useGame } from '../lib/game';
import { useStore, type Slot, type SlotRef, type Team } from '../lib/store';
import { ElementIcon, Icon, Img, LevelBadge } from './ui';

export type PickerRequest =
  | { kind: 'char'; ref: SlotRef }
  | { kind: 'pick3'; teamId: string }
  | { kind: 'weapon'; ref: SlotRef }
  | { kind: 'sonata'; ref: SlotRef };

export const slotKey = (r: SlotRef) => `${r.teamId}:${r.index}`;

export function ModeToggle({
  char,
  modes,
  value,
  onChange,
}: {
  char: Character;
  modes: string[];
  value: string;
  onChange: (m: string) => void;
}) {
  const byElement = char.kind === 'element';
  return (
    <div
      className={`mode-toggle ${byElement ? 'by-element' : ''}`}
      role="radiogroup"
      aria-label={byElement ? 'Element' : 'Resonance mode'}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={m === value}
          className={m === value ? 'on' : ''}
          onClick={() => onChange(m)}
          title={byElement ? m : `Resonance Mode: ${m}`}
          aria-label={m}
        >
          {byElement ? <ElementIcon id={elementByName(m)} size={20} title={m} /> : <span>{m}</span>}
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
  const autoModes = useGame((s) => s.autoModes);
  const ensureModes = useGame((s) => s.ensureModes);
  const updateSlot = useStore((s) => s.updateSlot);
  const clearSlot = useStore((s) => s.clearSlot);

  useEffect(() => ensureModes(slot.charId), [slot.charId, ensureModes, data]);

  const drag = useDraggable({ id, data: ref, disabled: !slot.charId });
  const drop = useDroppable({ id, data: ref });

  const weapon = slot.weaponId ? data?.weapons[slot.weaponId] : null;
  const sonata = slot.sonataId ? data?.sonatas[slot.sonataId] : null;
  const modes = modesOf(char, autoModes);
  const mode = activeMode(modes, slot.mode);
  const element = char ? slotElement(char, mode) : 0;
  const isUnknown = slot.charId === UNKNOWN_ID;

  return (
    <div
      ref={drop.setNodeRef}
      className={`slot ${drop.isOver ? 'drop-over' : ''} ${drag.isDragging ? 'dragging' : ''}`}
      style={{ '--el': ELEMENTS[element]?.color ?? 'transparent' } as React.CSSProperties}
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
            {isUnknown ? (
              <span className="unknown-mark">?</span>
            ) : char.portrait ? (
              <Img src={char.portrait} alt="" className="portrait-img" />
            ) : (
              <span className="unknown-mark initial">{char.name.slice(0, 1)}</span>
            )}
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
            <span className="portrait-name">
              {element ? <ElementIcon id={element} size={16} /> : null}
              <span>{char.name}</span>
            </span>
          </>
        ) : (
          <span className="portrait-add">
            <Icon name="plus" size={22} />
            <span>Add</span>
          </span>
        )}
      </div>

      <div className="mode-row">
        {char && mode && <ModeToggle char={char} modes={modes} value={mode} onChange={(m) => updateSlot(ref, { mode: m })} />}
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
            {weapon ? <Img src={weapon.icon} alt="" /> : <span className="gear-empty">Weapon</span>}
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
            {sonata ? <Img src={sonata.icon} alt="" /> : <span className="gear-empty">Sonata</span>}
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
        <span className="team-index" aria-label={`Team ${index + 1} of ${total}`}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <input
          className="team-name"
          value={team.name}
          maxLength={80}
          onChange={(e) => updateTeam(team.id, { name: e.target.value })}
          aria-label="Team name"
          placeholder="Team name"
        />
        <label className="switch" title="Include this team in the image export">
          <input type="checkbox" checked={team.include} onChange={(e) => updateTeam(team.id, { include: e.target.checked })} />
          <span className="switch-track" aria-hidden="true" />
          <span>Export</span>
        </label>
      </header>

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
          placeholder="Rotation, echo main stats, who the team is for"
          onChange={(e) => updateTeam(team.id, { notes: e.target.value })}
          aria-label="Team notes"
        />
      )}

      <footer className="team-tools">
        <button className="tool" disabled={!hasEmpty} onClick={() => onPicker({ kind: 'pick3', teamId: team.id })}>
          <Icon name="users" size={16} /> Fill slots
        </button>
        <button className={`tool ${notesOpen ? 'active' : ''}`} onClick={() => setNotesOpen((o) => !o)} aria-pressed={notesOpen}>
          <Icon name="note" size={16} /> Notes
        </button>
        <button className="tool" onClick={() => duplicateTeam(team.id)}>
          <Icon name="copy" size={16} /> Duplicate
        </button>
        <span className="spacer" />
        <button className="tool icon" disabled={index === 0} onClick={() => moveTeam(team.id, -1)} aria-label="Move team earlier" title="Move earlier">
          <Icon name="left" size={16} />
        </button>
        <button
          className="tool icon"
          disabled={index === total - 1}
          onClick={() => moveTeam(team.id, 1)}
          aria-label="Move team later"
          title="Move later"
        >
          <Icon name="right" size={16} />
        </button>
        {confirmDelete ? (
          <span className="confirm">
            <button className="tool danger" onClick={() => removeTeam(team.id)}>
              Delete team
            </button>
            <button className="tool" onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button className="tool icon" onClick={() => setConfirmDelete(true)} aria-label="Delete team" title="Delete team">
            <Icon name="trash" size={16} />
          </button>
        )}
      </footer>
    </section>
  );
}
