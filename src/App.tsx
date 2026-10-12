import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExportDialog } from './components/ExportDialog';
import { CharacterPicker, SonataPicker, WeaponPicker } from './components/Pickers';
import { TeamCard, type PickerRequest } from './components/TeamCard';
import { Icon, Img, Modal, Toast } from './components/ui';
import { ELEMENTS, UNKNOWN_ID } from './lib/data';
import { buildPayload, downloadBlob, parseImportFile, timestamp } from './lib/fileFormat';
import { UNKNOWN_CHARACTER, useGame } from './lib/game';
import { useStore, type SlotRef, type Team } from './lib/store';

export default function App() {
  const { status, error, data, load, fromCache } = useGame();
  const teams = useStore((s) => s.teams);
  const store = useStore();
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<Team[] | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dragFrom, setDragFrom] = useState<SlotRef | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  const notify = useCallback((m: string) => setToast(m), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const onDragStart = (e: DragStartEvent) => setDragFrom(e.active.data.current as SlotRef);
  const onDragEnd = (e: DragEndEvent) => {
    setDragFrom(null);
    const from = e.active.data.current as SlotRef | undefined;
    const to = e.over?.data.current as SlotRef | undefined;
    if (!from || !to) return;
    const err = store.dropSlot(from, to);
    if (err) notify(err);
  };

  const dragSlot = dragFrom ? teams.find((t) => t.id === dragFrom.teamId)?.slots[dragFrom.index] : null;
  const dragChar = dragSlot?.charId === UNKNOWN_ID ? UNKNOWN_CHARACTER : dragSlot?.charId ? data?.characters[dragSlot.charId] : null;

  /* ---------------- pickers ---------------- */

  const pickerTeam = picker ? teams.find((t) => t.id === (picker.kind === 'pick3' ? picker.teamId : picker.ref.teamId)) : null;
  const pickerSlot = picker && picker.kind !== 'pick3' && pickerTeam ? pickerTeam.slots[picker.ref.index] : null;

  const handleCharPick = (ids: string[]) => {
    if (!picker || !pickerTeam) return;
    if (picker.kind === 'char') {
      const id = ids[0];
      const c = data?.characters[id];
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
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <h1>Team Builder</h1>
            <p>Wuthering Waves · {data ? `data v${data.version}` : 'loading data'}</p>
          </div>
        </div>
        <nav className="actions" aria-label="Team actions">
          <button className="btn" onClick={() => fileRef.current?.click()} title="Import teams from a .json file or an exported image">
            <Icon name="upload" size={16} /> Import
          </button>
          <button className="btn" onClick={saveJson} title="Save all teams as a .json file">
            <Icon name="download" size={16} /> Save file
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
              {teams.length} team{teams.length === 1 ? '' : 's'}
            </h2>
            <p className="muted">
              Drag a character onto another slot to move it there, or onto a filled slot to swap. {includedCount} ticked for export.
            </p>
          </div>
          <div className="workspace-actions">
            <button className="btn sm ghost" onClick={() => store.setAllIncluded(includedCount !== teams.length)}>
              {includedCount === teams.length ? 'Untick all' : 'Tick all'}
            </button>
            {confirmReset ? (
              <span className="confirm">
                Clear every team?
                <button
                  className="btn sm danger"
                  onClick={() => {
                    store.resetAll();
                    setConfirmReset(false);
                  }}
                >
                  Clear
                </button>
                <button className="btn sm ghost" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="btn sm danger-ghost" onClick={() => setConfirmReset(true)}>
                Reset
              </button>
            )}
          </div>
        </div>

        {status === 'loading' && !data && <div className="banner">Loading character data…</div>}
        {status === 'error' && (
          <div className="banner error">
            Couldn't load game data ({error}). Check the connection and
            <button className="btn sm" onClick={load}>
              <Icon name="refresh" size={14} /> Retry
            </button>
          </div>
        )}
        {fromCache && status === 'ready' && <div className="banner subtle">Using saved game data.</div>}

        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragFrom(null)}>
          <div className="teams">
            {teams.map((t, i) => (
              <TeamCard key={t.id} team={t} index={i} total={teams.length} onPicker={setPicker} />
            ))}
            <button className="add-team" onClick={store.addTeam}>
              <Icon name="plus" size={28} />
              <span>Add team</span>
            </button>
          </div>
          <DragOverlay dropAnimation={null}>
            {dragChar ? (
              <div className="drag-ghost" style={{ '--el': ELEMENTS[dragChar.element]?.color ?? '#888' } as React.CSSProperties}>
                {dragChar.id === UNKNOWN_ID ? <span className="unknown-mark">?</span> : <Img src={dragChar.portrait} alt="" />}
                <span>{dragChar.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      <footer className="footer">
        Game data and images from{' '}
        <a href="https://ww.nanoka.cc/" target="_blank" rel="noreferrer">
          nanoka.cc
        </a>
        . Wuthering Waves and its assets belong to Kuro Games. Fan-made, not affiliated.
      </footer>

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
          weaponType={pickerSlot.charId && pickerSlot.charId !== UNKNOWN_ID ? data?.characters[pickerSlot.charId]?.weaponType ?? 0 : 0}
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

      {pendingImport && (
        <Modal
          title={`Import ${pendingImport.length} team${pendingImport.length === 1 ? '' : 's'}`}
          onClose={() => setPendingImport(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setPendingImport(null)}>
                Cancel
              </button>
              <span className="row-gap">
                <button
                  className="btn"
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
                    .map((s) => (s.charId === UNKNOWN_ID ? 'TBA' : s.charId ? data?.characters[s.charId]?.name ?? 'Unknown' : '—'))
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
