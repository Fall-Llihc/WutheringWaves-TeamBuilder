import { useDraggable, useDroppable } from '@dnd-kit/core';
import { memo, useEffect, useState } from 'react';
import { activeMode, ELEMENTS, elementByName, slotElement, UNKNOWN_ID, type Character } from '../lib/data';
import { modesOf, useCharacter, useGame } from '../lib/game';
import { useBudget } from '../lib/budget';
import { floorLabel, type TowerFloor } from '../lib/tower';
import { useStore, type Slot, type SlotRef, type Team, type TeamDropMode } from '../lib/store';
import { MatrixTeamPanel } from './MatrixTeam';
import { ElementIcon, Icon, Img, LevelBadge, VigorIcon } from './ui';

export type PickerRequest =
  | { kind: 'char'; ref: SlotRef }
  | { kind: 'pick3'; teamId: string }
  | { kind: 'weapon'; ref: SlotRef }
  | { kind: 'sonata'; ref: SlotRef };

export const slotKey = (r: SlotRef) => `${r.teamId}:${r.index}`;

/**
 * Drag payloads; collision detection keeps slot drags on slots and team drags on teams.
 * Roster drags (Matrix mode) land on slots too.
 */
export type DragData = ({ type: 'slot' } & SlotRef) | { type: 'team'; teamId: string } | { type: 'roster'; charId: string };

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

function SlotCard({
  team,
  index,
  slot,
  onPicker,
  next,
  square,
}: {
  team: Team;
  index: number;
  slot: Slot;
  onPicker: (r: PickerRequest) => void;
  /** Matrix mode: the empty slot the next roster click fills. */
  next?: boolean;
  /** Tower rows: a square slot, so it shows the square icon (as in the roster) instead of the tall portrait. */
  square?: boolean;
}) {
  const ref: SlotRef = { teamId: team.id, index };
  const id = slotKey(ref);
  const char = useCharacter(slot.charId);
  const data = useGame((s) => s.data);
  const autoModes = useGame((s) => s.autoModes);
  const ensureModes = useGame((s) => s.ensureModes);
  const updateSlot = useStore((s) => s.updateSlot);
  const clearSlot = useStore((s) => s.clearSlot);

  useEffect(() => ensureModes(slot.charId), [slot.charId, ensureModes, data]);

  const drag = useDraggable({ id, data: { type: 'slot', ...ref } satisfies DragData, disabled: !slot.charId });
  const drop = useDroppable({ id, data: { type: 'slot', ...ref } satisfies DragData });

  const weapon = slot.weaponId ? data?.weapons[slot.weaponId] : null;
  const sonata = slot.sonataId ? data?.sonatas[slot.sonataId] : null;
  const modes = modesOf(char, autoModes);
  const mode = activeMode(modes, slot.mode);
  const element = char ? slotElement(char, mode) : 0;
  const isUnknown = slot.charId === UNKNOWN_ID;
  const budgetFor = useBudget();
  const vigor = budgetFor && char && !isUnknown ? budgetFor(char) : null;
  const overVigor = !!vigor && vigor.used > vigor.max;
  // Matrix and Tower plan with owned resonators: flag one that isn't marked owned (e.g. loaded from a preset).
  const ownedHere = useStore((s) => (slot.charId ? !!s.owned[slot.charId] : true));
  const notOwned = !!budgetFor && !!char && !isUnknown && !ownedHere;

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
        className={`portrait ${char ? `r${char.rarity}` : 'empty'} ${next && !char ? 'is-next' : ''} ${notOwned ? 'not-owned' : ''}`}
        onClick={() => onPicker({ kind: 'char', ref })}
        onKeyDown={(e) => e.key === 'Enter' && onPicker({ kind: 'char', ref })}
      >
        {char ? (
          <>
            {isUnknown ? (
              <span className="unknown-mark">?</span>
            ) : square && (char.icon || char.portrait) ? (
              <Img src={char.icon || char.portrait} alt="" className="portrait-img is-icon" />
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
            {overVigor && vigor && (
              <span
                className="slot-vigor"
                title={
                  vigor.kind === 'cost'
                    ? `Over cost: floors take ${vigor.used}, every resonator has ${vigor.max}`
                    : `Over Vigor: in ${vigor.used} teams, Max Vigor ${vigor.max}`
                }
              >
                <VigorIcon size={13} />
                <span className="mono">
                  {vigor.used}/{vigor.max}
                </span>
              </span>
            )}
            {notOwned && (
              <span className="slot-unowned" title={`${char.name} isn't marked owned. Mark it in the roster's Manage tab.`}>
                <Icon name="warning" size={12} weight="bold" />
                Not owned
              </span>
            )}
            <span className="portrait-name">
              {element ? <ElementIcon id={element} size={16} /> : null}
              <span>{char.name}</span>
            </span>
          </>
        ) : (
          <span className="portrait-add">
            <Icon name={next ? 'target' : 'plus'} size={22} />
            <span>{next ? 'Next' : 'Add'}</span>
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

export const TeamCard = memo(function TeamCard({
  team,
  index,
  total,
  onPicker,
  dropMode,
  active,
  flash,
  onActivate,
  onPreset,
  floor,
}: {
  team: Team;
  index: number;
  total: number;
  onPicker: (r: PickerRequest) => void;
  /** Where a dragged team would land relative to this one, while hovering it. */
  dropMode: TeamDropMode | null;
  /** Matrix mode: the team that roster clicks fill. */
  active?: boolean;
  /** Just became the target automatically (the previous team filled up). */
  flash?: boolean;
  onActivate?: (teamId: string) => void;
  /** Matrix and Tower: load a builder team into this one. */
  onPreset?: (teamId: string) => void;
  /** Tower of Adversity: this team's floor (fixed place, no reordering). */
  floor?: { key: string; data: TowerFloor | null };
}) {
  const { updateTeam, moveTeam, duplicateTeam, removeTeam } = useStore.getState();
  const matrixMode = useStore((s) => s.matrixMode);
  const tower = !!floor;
  const label = floor ? floorLabel(floor.key, floor.data ?? undefined) : null;
  const [notesOpen, setNotesOpen] = useState(!!team.notes);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const data: DragData = { type: 'team', teamId: team.id };
  const drag = useDraggable({ id: `team:${team.id}`, data, disabled: tower });
  const drop = useDroppable({ id: `team-drop:${team.id}`, data });
  const filled = team.slots.filter((s) => s.charId).length;
  const nextSlot = active ? team.slots.findIndex((s) => !s.charId) : -1;

  return (
    <section
      ref={drop.setNodeRef}
      className={`team ${tower ? 'tower-team' : ''} ${team.include ? '' : 'excluded'} ${drag.isDragging ? 'dragging' : ''} ${dropMode ? `drop-${dropMode}` : ''} ${active ? 'is-active' : ''} ${flash ? 'is-flash' : ''}`}
      aria-label={team.name}
      aria-current={active ? 'true' : undefined}
      data-team-id={team.id}
      onPointerDownCapture={() => onActivate?.(team.id)}
      onFocusCapture={() => onActivate?.(team.id)}
    >
      <header className="team-head">
        {floor && label ? (
          <div className="floor-head">
            <span className="floor-num mono" aria-hidden="true">
              {label.short}
            </span>
            <span className="floor-title">
              <strong>{label.area}</strong>
              <span className="muted">Floor {label.floor}</span>
            </span>
            <span className="floor-cost" title={`Each resonator on this floor spends ${floor.data?.cost ?? '?'} of their cost`}>
              <VigorIcon size={13} />
              <span className="mono">{floor.data?.cost ?? '–'}</span>
              <span>per resonator</span>
            </span>
          </div>
        ) : (
        <>
        <button
          ref={drag.setNodeRef}
          {...drag.attributes}
          {...drag.listeners}
          type="button"
          className="team-grip"
          aria-label={`Team ${index + 1} of ${total}. Drag to reorder: drop in the middle of a team to swap, on its left or right edge to place before or after it`}
          title="Drag to reorder. Middle of a team: swap. Left or right edge: place before or after."
        >
          <Icon name="grip" size={16} />
          <span className="team-index">{String(index + 1).padStart(2, '0')}</span>
        </button>
        <input
          className="team-name"
          value={team.name}
          maxLength={80}
          onChange={(e) => updateTeam(team.id, { name: e.target.value })}
          aria-label="Team name"
          placeholder="Team name"
        />
        </>
        )}
        {active && (
          <span className="target-chip" title="Roster clicks fill this team. When it is full, the next team with room takes over.">
            <span className="target-dot" aria-hidden="true" />
            <span>{filled === 3 ? 'Target · full' : 'Adding here'}</span>
            <span className="target-pips" aria-label={`${filled} of 3 slots filled`}>
              {[0, 1, 2].map((i) => (
                <i key={i} className={team.slots[i].charId ? 'on' : ''} />
              ))}
            </span>
          </span>
        )}
        <label className="switch" title="Include this team in the image export">
          <input type="checkbox" checked={team.include} onChange={(e) => updateTeam(team.id, { include: e.target.checked })} />
          <span className="switch-track" aria-hidden="true" />
          <span>Export</span>
        </label>
      </header>

      <div className="slots">
        {team.slots.map((s, i) => (
          <SlotCard key={i} team={team} index={i} slot={s} onPicker={onPicker} next={i === nextSlot} square={tower} />
        ))}
      </div>

      {matrixMode && <MatrixTeamPanel team={team} />}

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
        <button className="tool" onClick={() => onPicker({ kind: 'pick3', teamId: team.id })} title="Pick a whole new team; applies when you confirm">
          <Icon name="users" size={16} /> Fill slots
        </button>
        {onPreset && (
          <button className="tool" onClick={() => onPreset(team.id)} title="Load one of your builder teams into this one">
            <Icon name="stack" size={16} /> Preset
          </button>
        )}
        <button className={`tool ${notesOpen ? 'active' : ''}`} onClick={() => setNotesOpen((o) => !o)} aria-pressed={notesOpen}>
          <Icon name="note" size={16} /> Notes
        </button>
        {!tower && (
          <button className="tool" onClick={() => duplicateTeam(team.id)}>
            <Icon name="copy" size={16} /> Duplicate
          </button>
        )}
        <span className="spacer" />
        {!tower && (
        <>
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
        </>
        )}
      </footer>
    </section>
  );
});
