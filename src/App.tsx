import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Aurora } from './components/Aurora';
import { TeamCard, type DragData, type PickerRequest } from './components/TeamCard';
import { Icon, Img, Modal, Toast } from './components/ui';
import { ELEMENTS, UNKNOWN_ID } from './lib/data';
import { buildPayload, downloadBlob, parseImportFile, timestamp } from './lib/fileFormat';
import { lookupCharacter, useGame } from './lib/game';
import { useStore, type SlotRef, type Team, type TeamDropMode } from './lib/store';

// Dialogs load on first open; the export one pulls in html-to-image.
const ExportDialog = lazy(() => import('./components/ExportDialog').then((m) => ({ default: m.ExportDialog })));
const CharacterPicker = lazy(() => import('./components/Pickers').then((m) => ({ default: m.CharacterPicker })));
const WeaponPicker = lazy(() => import('./components/Pickers').then((m) => ({ default: m.WeaponPicker })));
const SonataPicker = lazy(() => import('./components/Pickers').then((m) => ({ default: m.SonataPicker })));

// Slots only collide with slots and teams with teams. Teams use the pointer so
// the left/right edge of a card can be targeted precisely.
const collision: CollisionDetection = (args) => {
  const type = (args.active.data.current as DragData | undefined)?.type;
  const droppableContainers = args.droppableContainers.filter((c) => (c.data.current as DragData | undefined)?.type === type);
  return type === 'team' ? pointerWithin({ ...args, droppableContainers }) : rectIntersection({ ...args, droppableContainers });
};

/** Pointer position where a drag started; keyboard drags have none. */
function startPoint(e: Event | null): { x: number; y: number } | null {
  if (!e) return null;
  if ('touches' in e) {
    const t = (e as TouchEvent).touches[0] ?? (e as TouchEvent).changedTouches[0];
    return t ? { x: t.clientX, y: t.clientY } : null;
  }
  if ('clientX' in e) return { x: (e as PointerEvent).clientX, y: (e as PointerEvent).clientY };
  return null;
}

/** Middle of a team swaps; its outer quarter on either side inserts before/after. */
function teamDropMode(e: DragMoveEvent | DragEndEvent): TeamDropMode | null {
  const over = e.over;
  if (!over) return null;
  const start = startPoint(e.activatorEvent);
  const box = e.active.rect.current.translated;
  const x = start ? start.x + e.delta.x : box ? box.left + box.width / 2 : null;
  if (x === null) return 'swap';
  const rel = (x - over.rect.left) / over.rect.width;
  return rel < 0.25 ? 'before' : rel > 0.75 ? 'after' : 'swap';
}

export default function App() {
  const { status, error, data, load, fromCache } = useGame();
  const teams = useStore((s) => s.teams);
  // Actions never change; reading them without subscribing avoids re-rendering on every edit.
  const store = useStore.getState();
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<Team[] | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dragFrom, setDragFrom] = useState<SlotRef | null>(null);
  const [dragTeamId, setDragTeamId] = useState<string | null>(null);
  const [teamDrop, setTeamDrop] = useState<{ teamId: string; mode: TeamDropMode } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  // Saved or imported teams may hold outdated ids (per-element Rovers, roster-only names).
  const remap = store.remapCharacters;
  useEffect(() => {
    if (!data) return;
    remap((id) => (id === UNKNOWN_ID || data.characters[id] ? null : data.aliases[id] ?? null));
  }, [data, teams, remap]);

  const notify = useCallback((m: string) => setToast(m), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const resetDrag = () => {
    setDragFrom(null);
    setDragTeamId(null);
    setTeamDrop(null);
  };
  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as DragData;
    if (d.type === 'team') setDragTeamId(d.teamId);
    else setDragFrom(d);
  };
  const onDragMove = (e: DragMoveEvent) => {
    const from = e.active.data.current as DragData;
    const to = e.over?.data.current as DragData | undefined;
    if (from.type !== 'team' || to?.type !== 'team' || to.teamId === from.teamId) {
      if (teamDrop) setTeamDrop(null);
      return;
    }
    const mode = teamDropMode(e);
    if (mode && (teamDrop?.teamId !== to.teamId || teamDrop.mode !== mode)) setTeamDrop({ teamId: to.teamId, mode });
  };
  const onDragEnd = (e: DragEndEvent) => {
    resetDrag();
    const from = e.active.data.current as DragData | undefined;
    const to = e.over?.data.current as DragData | undefined;
    if (!from || !to || from.type !== to.type) return;
    if (from.type === 'team' && to.type === 'team') {
      const mode = teamDropMode(e);
      if (mode) store.reorderTeam(from.teamId, to.teamId, mode);
      return;
    }
    if (from.type === 'slot' && to.type === 'slot') {
      const err = store.dropSlot(from, to);
      if (err) notify(err);
    }
  };
  const dragTeam = dragTeamId ? teams.find((t) => t.id === dragTeamId) : null;

  const dragSlot = dragFrom ? teams.find((t) => t.id === dragFrom.teamId)?.slots[dragFrom.index] : null;
  const dragChar = lookupCharacter(data, dragSlot?.charId ?? null);

  /* ---------------- pickers ---------------- */

  const pickerTeam = picker ? teams.find((t) => t.id === (picker.kind === 'pick3' ? picker.teamId : picker.ref.teamId)) : null;
  const pickerSlot = picker && picker.kind !== 'pick3' && pickerTeam ? pickerTeam.slots[picker.ref.index] : null;

  const handleCharPick = (ids: string[]) => {
    if (!picker || !pickerTeam) return;
    if (picker.kind === 'char') {
      const id = ids[0];
      const c = lookupCharacter(data, id);
      const prevWeapon = pickerSlot?.weaponId ? data?.weapons[pickerSlot.weaponId] : null;
      store.setCharacter(picker.ref, id, !!(c && prevWeapon && prevWeapon.type === c.weaponType));
    } else if (picker.kind === 'pick3') {
      const empty = pickerTeam.slots.map((s, i) => (s.charId ? -1 : i)).filter((i) => i >= 0);
      ids.slice(0, empty.length).forEach((id, k) => store.setCharacter({ teamId: pickerTeam.id, index: empty[k] }, id, false));
    }
    setPicker(null);
  };

  /* ---------------- save / load ---------------- */

  const saveJson = () => {
    const blob = new Blob([JSON.stringify(buildPayload(teams), null, 2)], { type: 'application/json' });
    downloadBlob(blob, `wuwa-teams-${timestamp()}.json`);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = await parseImportFile(file);
      if (!imported.length) throw new Error('The file has no teams.');
      setPendingImport(imported);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const includedCount = teams.filter((t) => t.include).length;

  return (
    <>
    <Aurora />
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src="llihc-logo.png" alt="Llihc" width={64} height={40} />
          <span className="brand-rule" aria-hidden="true" />
          <div className="brand-text">
            <h1>Team Builder</h1>
            <p>Wuthering Waves{data ? <span className="mono"> · v{data.version}</span> : null}</p>
          </div>
        </div>
        <nav className="actions" aria-label="File">
          <button className="btn quiet" onClick={() => fileRef.current?.click()} title="Import teams from a .json file or an exported image">
            <Icon name="upload" size={16} /> Import
          </button>
          <button className="btn quiet" onClick={saveJson} title="Save all teams as a .json file">
            <Icon name="save" size={16} /> Save
          </button>
          <button className="btn primary" onClick={() => setExportOpen(true)} disabled={!data}>
            <Icon name="image" size={16} /> Export image
          </button>
        </nav>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json,image/png,image/jpeg"
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </header>

      <main>
        <div className="workspace-head">
          <div>
            <h2>
              Teams <span className="mono count">{teams.length}</span>
            </h2>
            <p className="muted">Drag a character onto another slot to move or swap it. Drag a team by its number: drop in the middle of another team to swap, on its edge to place before or after.</p>
          </div>
          <div className="workspace-actions">
            <button className="link" onClick={() => store.setAllIncluded(includedCount !== teams.length)}>
              {includedCount === teams.length ? 'Exclude all from export' : 'Include all in export'}
            </button>
            <span className="mono muted">
              {includedCount}/{teams.length} in export
            </span>
            {confirmReset ? (
              <span className="confirm">
                <button
                  className="btn sm danger"
                  onClick={() => {
                    store.resetAll();
                    setConfirmReset(false);
                  }}
                >
                  Clear every team
                </button>
                <button className="btn sm quiet" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="btn sm quiet" onClick={() => setConfirmReset(true)}>
                Reset
              </button>
            )}
          </div>
        </div>

        {status === 'loading' && !data && <div className="banner">Loading character data</div>}
        {status === 'error' && (
          <div className="banner error">
            Couldn't load game data ({error}). Check the connection and
            <button className="btn sm" onClick={load}>
              <Icon name="refresh" size={14} /> Retry
            </button>
          </div>
        )}
        {fromCache && status === 'ready' && <p className="cache-note mono">Offline copy of game data</p>}

        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onDragCancel={resetDrag}
        >
          <div className="teams">
            {teams.map((t, i) => (
              <TeamCard
                key={t.id}
                team={t}
                index={i}
                total={teams.length}
                onPicker={setPicker}
                dropMode={teamDrop?.teamId === t.id ? teamDrop.mode : null}
              />
            ))}
            <button className="add-team" onClick={store.addTeam}>
              <Icon name="plus" size={22} />
              <span>New team</span>
            </button>
          </div>
          <DragOverlay dropAnimation={null}>
            {dragChar ? (
              <div className="drag-ghost" style={{ '--el': ELEMENTS[dragChar.element]?.color ?? 'transparent' } as React.CSSProperties}>
                {dragChar.portrait ? <Img src={dragChar.portrait} alt="" /> : <span className="unknown-mark">{dragChar.id === UNKNOWN_ID ? '?' : dragChar.name[0]}</span>}
                <span>{dragChar.name}</span>
              </div>
            ) : dragTeam ? (
              <div className="team-ghost">
                <span className="team-ghost-name">{dragTeam.name || 'Team'}</span>
                <span className="team-ghost-slots">
                  {dragTeam.slots.map((s, i) => {
                    const c = lookupCharacter(data, s.charId);
                    return <span key={i}>{c?.portrait ? <Img src={c.portrait} alt="" /> : null}</span>;
                  })}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      <footer className="footer">
        <span>
          Made by Llihc. Images from{' '}
          <a href="https://ww.nanoka.cc/" target="_blank" rel="noreferrer">
            nanoka.cc
          </a>
          , release order from{' '}
          <a href="https://encore.moe/" target="_blank" rel="noreferrer">
            encore.moe
          </a>
          .
        </span>
        <span>Wuthering Waves belongs to Kuro Games. Fan-made, not affiliated.</span>
      </footer>

      <Suspense fallback={null}>
      {picker && pickerTeam && (picker.kind === 'char' || picker.kind === 'pick3') && (
        <CharacterPicker
          teamCharIds={pickerTeam.slots
            .filter((_, i) => picker.kind === 'pick3' || i !== picker.ref.index)
            .map((s) => s.charId)}
          slots={picker.kind === 'pick3' ? pickerTeam.slots.filter((s) => !s.charId).length : 1}
          onPick={handleCharPick}
          onClose={() => setPicker(null)}
        />
      )}
      {picker?.kind === 'weapon' && pickerSlot && (
        <WeaponPicker
          weaponType={lookupCharacter(data, pickerSlot.charId)?.weaponType ?? 0}
          onPick={(id) => {
            store.updateSlot(picker.ref, { weaponId: id, ...(id !== pickerSlot.weaponId ? { rank: 1 } : {}) });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {picker?.kind === 'sonata' && (
        <SonataPicker
          onPick={(id) => {
            store.updateSlot(picker.ref, { sonataId: id });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} notify={notify} />}
      </Suspense>

      {pendingImport && (
        <Modal
          title={`Import ${pendingImport.length} team${pendingImport.length === 1 ? '' : 's'}`}
          onClose={() => setPendingImport(null)}
          footer={
            <>
              <button className="btn quiet" onClick={() => setPendingImport(null)}>
                Cancel
              </button>
              <span className="row-gap">
                <button
                  className="btn quiet"
                  onClick={() => {
                    store.importTeams(pendingImport, 'append');
                    notify(`Added ${pendingImport.length} teams.`);
                    setPendingImport(null);
                  }}
                >
                  Add to current
                </button>
                <button
                  className="btn primary"
                  onClick={() => {
                    store.importTeams(pendingImport, 'replace');
                    notify(`Loaded ${pendingImport.length} teams.`);
                    setPendingImport(null);
                  }}
                >
                  Replace current
                </button>
              </span>
            </>
          }
        >
          <ul className="import-list">
            {pendingImport.map((t, i) => (
              <li key={i}>
                <strong>{t.name}</strong>
                <span className="muted">
                  {t.slots
                    .map((s) => (s.charId === UNKNOWN_ID ? 'TBA' : s.charId ? lookupCharacter(data, s.charId)?.name ?? 'Unknown' : 'Empty'))
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
    </>
  );
}
