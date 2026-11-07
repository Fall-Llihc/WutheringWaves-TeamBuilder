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
import { MatrixRoster, ROSTER_MAX, ROSTER_MIN } from './components/MatrixRoster';
import { MatrixSummary } from './components/MatrixSummary';
import { TeamCard, type DragData, type PickerRequest } from './components/TeamCard';
import { Icon, Img, Modal, Toast } from './components/ui';
import { ELEMENTS, UNKNOWN_ID } from './lib/data';
import { buildBackup, downloadBlob, parseImportFile, timestamp, type ImportResult } from './lib/fileFormat';
import { lookupCharacter, useGame } from './lib/game';
import { MATRIX, useMatrix } from './lib/matrix';
import { matrixPlacementError } from './lib/matrixHooks';
import { SCORE_PLAN } from './lib/matrixPlan';
import { rosterKey } from './lib/roster';
import { useTheme } from './lib/theme';
import { useStore, type SlotRef, type Team, type TeamDropMode } from './lib/store';

// Dialogs load on first open; the export one pulls in html-to-image.
const ExportDialog = lazy(() => import('./components/ExportDialog').then((m) => ({ default: m.ExportDialog })));
const CharacterPicker = lazy(() => import('./components/Pickers').then((m) => ({ default: m.CharacterPicker })));
const WeaponPicker = lazy(() => import('./components/Pickers').then((m) => ({ default: m.WeaponPicker })));
const SonataPicker = lazy(() => import('./components/Pickers').then((m) => ({ default: m.SonataPicker })));

const ROSTER_WIDTH_KEY = 'wtb:roster-width';
const clampRosterWidth = (w: number) => Math.round(Math.min(ROSTER_MAX, Math.max(ROSTER_MIN, w)));
function readRosterWidth() {
  try {
    const v = Number(localStorage.getItem(ROSTER_WIDTH_KEY));
    return v ? clampRosterWidth(v) : ROSTER_MIN;
  } catch {
    return ROSTER_MIN;
  }
}

const isFull = (t: Team) => t.slots.every((s) => s.charId);

/** The next team after `fromId` (wrapping round) that still has an empty slot, or null. */
function nextOpenTeam(list: Team[], fromId: string): string | null {
  const start = list.findIndex((t) => t.id === fromId);
  for (let k = 1; k < list.length; k++) {
    const t = list[(start + k) % list.length];
    if (!isFull(t)) return t.id;
  }
  return null;
}

// Slots only collide with slots and teams with teams. Teams use the pointer so
// the left/right edge of a card can be targeted precisely. Roster characters
// (Matrix mode) land on slots, under the pointer since the roster sits beside the teams.
const collision: CollisionDetection = (args) => {
  const type = (args.active.data.current as DragData | undefined)?.type;
  const target = type === 'roster' ? 'slot' : type;
  const droppableContainers = args.droppableContainers.filter((c) => (c.data.current as DragData | undefined)?.type === target);
  if (type === 'team') return pointerWithin({ ...args, droppableContainers });
  if (type === 'roster') {
    const hits = pointerWithin({ ...args, droppableContainers });
    return hits.length ? hits : rectIntersection({ ...args, droppableContainers });
  }
  return rectIntersection({ ...args, droppableContainers });
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
  const matrixMode = useStore((s) => s.matrixMode);
  const vigorOverride = useStore((s) => s.vigorOverride);
  const matrixPhase = useMatrix((s) => s.tower?.phase ?? '');
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);
  // Actions never change; reading them without subscribing avoids re-rendering on every edit.
  const store = useStore.getState();
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<ImportResult | null>(null);
  // Load the backup's roster and setup along with its teams.
  const [importSetup, setImportSetup] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [dragFrom, setDragFrom] = useState<SlotRef | null>(null);
  const [dragRosterId, setDragRosterId] = useState<string | null>(null);
  // Matrix mode: the team a roster click fills. Follows the last team touched.
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  // Team that just became the target automatically; flashes briefly.
  const [flashTeamId, setFlashTeamId] = useState<string | null>(null);
  // Matrix roster width (drag its edge or use its widen button); remembered in this browser.
  const [rosterWidth, setRosterWidthState] = useState(readRosterWidth);
  const setRosterWidth = useCallback((w: number) => {
    const next = clampRosterWidth(w);
    setRosterWidthState(next);
    try {
      localStorage.setItem(ROSTER_WIDTH_KEY, String(next));
    } catch {
      /* not remembered */
    }
  }, []);
  const flashTimer = useRef(0);
  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? teams[0] ?? null;
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

  useEffect(() => {
    if (data && matrixMode) useMatrix.getState().load(data.version);
  }, [data, matrixMode]);

  const notify = useCallback((m: string) => setToast(m), []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const resetDrag = () => {
    setDragFrom(null);
    setDragRosterId(null);
    setDragTeamId(null);
    setTeamDrop(null);
  };
  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as DragData;
    if (d.type === 'team') setDragTeamId(d.teamId);
    else if (d.type === 'roster') setDragRosterId(d.charId);
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
    if (!from || !to) return;
    // Roster characters (Matrix mode) are the one drag that lands on a different kind of target.
    if (from.type === 'roster') {
      if (to.type === 'slot') placeFromRoster(from.charId, { teamId: to.teamId, index: to.index });
      return;
    }
    if (from.type !== to.type) return;
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

  /**
   * Moves the roster's target to a team: scrolls it into view when off screen and
   * flashes it, so an automatic switch is easy to follow.
   */
  const focusTeam = (id: string) => {
    setActiveTeamId(id);
    setFlashTeamId(id);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashTeamId(null), 1200);
    requestAnimationFrame(() => document.querySelector(`[data-team-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  };

  /** A roster character onto a slot: checks Vigor and duplicates, then places it. */
  const placeFromRoster = (charId: string, ref: SlotRef) => {
    const st = useStore.getState();
    const err = matrixPlacementError(data, st.teams, st.vigorOverride, ref.teamId, charId, ref.index);
    if (err) return notify(err);
    const slot = st.teams.find((t) => t.id === ref.teamId)?.slots[ref.index];
    const c = lookupCharacter(data, charId);
    const prevWeapon = slot?.weaponId ? data?.weapons[slot.weaponId] : null;
    store.setCharacter(ref, charId, !!(c && prevWeapon && prevWeapon.type === c.weaponType));
    // The team just filled up: move on to the next team with room, so roster clicks keep going.
    const after = useStore.getState().teams;
    const placed = after.find((t) => t.id === ref.teamId);
    const next = placed && isFull(placed) ? nextOpenTeam(after, placed.id) : null;
    if (next) {
      focusTeam(next);
      const i = after.findIndex((t) => t.id === next);
      notify(`${placed!.name || 'Team'} is full. Now adding to ${String(i + 1).padStart(2, '0')} · ${after[i].name || 'Team'}.`);
    } else setActiveTeamId(ref.teamId);
  };

  /** Roster click: the active team's first empty slot; a full team hands over to the next one with room, or a new team. */
  const addToActiveTeam = (charId: string) => {
    let team = activeTeam;
    if (!team) return;
    if (isFull(team)) {
      const next = nextOpenTeam(teams, team.id);
      if (next) team = teams.find((t) => t.id === next)!;
      else {
        store.addTeam();
        team = useStore.getState().teams.at(-1)!;
        notify(`Every team is full. Added ${team.name}.`);
      }
      focusTeam(team.id);
    }
    placeFromRoster(charId, { teamId: team.id, index: team.slots.findIndex((s) => !s.charId) });
  };
  const dragTeam = dragTeamId ? teams.find((t) => t.id === dragTeamId) : null;

  const dragSlot = dragFrom ? teams.find((t) => t.id === dragFrom.teamId)?.slots[dragFrom.index] : null;
  const dragChar = lookupCharacter(data, dragSlot?.charId ?? dragRosterId ?? null);

  /* ---------------- pickers ---------------- */

  const pickerTeam = picker ? teams.find((t) => t.id === (picker.kind === 'pick3' ? picker.teamId : picker.ref.teamId)) : null;
  const pickerSlot = picker && picker.kind !== 'pick3' && pickerTeam ? pickerTeam.slots[picker.ref.index] : null;

  const handleCharPick = (ids: string[]) => {
    if (!picker || !pickerTeam) return;
    if (picker.kind === 'char') {
      const id = ids[0];
      if (matrixMode && id) {
        const err = matrixPlacementError(data, teams, vigorOverride, picker.ref.teamId, id, picker.ref.index);
        if (err) return notify(err);
      }
      const c = lookupCharacter(data, id);
      const prevWeapon = pickerSlot?.weaponId ? data?.weapons[pickerSlot.weaponId] : null;
      store.setCharacter(picker.ref, id, !!(c && prevWeapon && prevWeapon.type === c.weaponType));
    } else if (picker.kind === 'pick3') {
      if (matrixMode) {
        // The whole line-up is replaced, so check it against the plan without this team's current members.
        const rest = teams.map((t) => (t.id === pickerTeam.id ? { ...t, slots: t.slots.map(() => ({ ...t.slots[0], charId: null })) as Team['slots'] } : t));
        for (const [i, id] of ids.entries()) {
          const trial = rest.map((t) =>
            t.id === pickerTeam.id ? { ...t, slots: t.slots.map((s, k) => (k < i ? { ...s, charId: ids[k] } : s)) as Team['slots'] } : t,
          );
          const err = matrixPlacementError(data, trial, vigorOverride, pickerTeam.id, id, i);
          if (err) return notify(err);
        }
      }
      store.replaceTeamCharacters(pickerTeam.id, ids);
    }
    setPicker(null);
  };

  /* ---------------- save / load ---------------- */

  const saveJson = () => {
    const { owned, vigorOverride, exportSettings } = useStore.getState();
    const backup = buildBackup(teams, { matrixMode, owned, vigorOverride, exportSettings });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `wuwa-teams-${timestamp()}.json`);
    notify(`Saved ${teams.length} team${teams.length === 1 ? '' : 's'}, ${Object.keys(owned).length} owned resonators and the Matrix setup.`);
  };

  const finishImport = (mode: 'replace' | 'append') => {
    if (!pendingImport) return;
    const { teams: incoming, setup } = pendingImport;
    store.importTeams(incoming, mode);
    const withSetup = !!setup && importSetup;
    if (withSetup) store.importSetup(setup, mode);
    const n = `${incoming.length} team${incoming.length === 1 ? '' : 's'}`;
    notify(`${mode === 'replace' ? 'Loaded' : 'Added'} ${n}${withSetup ? ' with the roster and Matrix setup' : ''}.`);
    setPendingImport(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const imported = await parseImportFile(file);
      if (!imported.teams.length) throw new Error('The file has no teams.');
      setImportSetup(true);
      setPendingImport(imported);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const includedCount = teams.filter((t) => t.include).length;
  // This patch's featured resonators from matrix.txt's bonus lines, by their game name.
  const bonusNames = SCORE_PLAN.bonus.map(
    (key) => Object.values(data?.characters ?? {}).find((c) => rosterKey(c.name) === key)?.name ?? key,
  );

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
          <button
            className="btn quiet icon-only"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
          <button className="btn quiet" onClick={() => fileRef.current?.click()} title="Import teams from a .json file or an exported image">
            <Icon name="upload" size={16} /> Import
          </button>
          <button className="btn quiet" onClick={saveJson} title="Save a .json backup: every team, the owned roster, the Matrix setup and export settings">
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
            {matrixMode && (
              <p className="patch-tag" title="Set in src/data/matrix.txt (patch and bonus lines)">
                <span className="patch-tag-key">Matrix</span>
                <span>Patch {MATRIX.patch}</span>
                {matrixPhase ? <span>{matrixPhase}</span> : null}
                {bonusNames.length ? <span>+1 Vigor: {bonusNames.join(', ')}</span> : null}
              </p>
            )}
            <p className="muted">Drag a character onto another slot to move or swap it. Drag a team by its number: drop in the middle of another team to swap, on its edge to place before or after.</p>
          </div>
          <div className="workspace-actions">
            <label className="switch" title={`Matrix (patch ${MATRIX.patch}): owned roster with Vigor, circuit buffs and a points plan`}>
              <input type="checkbox" checked={matrixMode} onChange={(e) => store.setMatrixMode(e.target.checked)} />
              <span className="switch-track" aria-hidden="true" />
              <span>Matrix</span>
            </label>
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
          <div
            className={matrixMode ? 'matrix-layout' : undefined}
            style={matrixMode ? ({ '--roster-w': `${rosterWidth}px` } as React.CSSProperties) : undefined}
          >
            {matrixMode && data && (
              <MatrixRoster
                teams={teams}
                activeTeamId={activeTeam?.id ?? null}
                onActiveTeam={setActiveTeamId}
                onAdd={addToActiveTeam}
                width={rosterWidth}
                onWidth={setRosterWidth}
              />
            )}
            <div className="matrix-main">
              {matrixMode && <MatrixSummary />}
              <div className="teams">
                {teams.map((t, i) => (
                  <TeamCard
                    key={t.id}
                    team={t}
                    index={i}
                    total={teams.length}
                    onPicker={setPicker}
                    dropMode={teamDrop?.teamId === t.id ? teamDrop.mode : null}
                    active={matrixMode && activeTeam?.id === t.id}
                    flash={flashTeamId === t.id}
                    onActivate={matrixMode ? setActiveTeamId : undefined}
                  />
                ))}
                <button className="add-team" onClick={store.addTeam}>
                  <Icon name="plus" size={22} />
                  <span>New team</span>
                </button>
              </div>
            </div>
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
          // A whole-team pick replaces everyone, so nobody in the team blocks a choice.
          teamCharIds={picker.kind === 'pick3' ? [] : pickerTeam.slots.filter((_, i) => i !== picker.ref.index).map((s) => s.charId)}
          slots={picker.kind === 'pick3' ? 3 : 1}
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
          title={`Import ${pendingImport.teams.length} team${pendingImport.teams.length === 1 ? '' : 's'}`}
          onClose={() => setPendingImport(null)}
          footer={
            <>
              <button className="btn quiet" onClick={() => setPendingImport(null)}>
                Cancel
              </button>
              <span className="row-gap">
                <button className="btn quiet" onClick={() => finishImport('append')}>
                  Add to current
                </button>
                <button className="btn primary" onClick={() => finishImport('replace')}>
                  Replace current
                </button>
              </span>
            </>
          }
        >
          {pendingImport.setup && (
            <div className="import-setup">
              <label className="switch">
                <input type="checkbox" checked={importSetup} onChange={(e) => setImportSetup(e.target.checked)} />
                <span className="switch-track" aria-hidden="true" />
                <span>Also load the roster and Matrix setup</span>
              </label>
              <p className="muted">
                {Object.keys(pendingImport.setup.owned).length} owned resonators
                {Object.keys(pendingImport.setup.vigorOverride).length
                  ? ` · ${Object.keys(pendingImport.setup.vigorOverride).length} Max Vigor change${Object.keys(pendingImport.setup.vigorOverride).length === 1 ? '' : 's'}`
                  : ''}
                {' · '}Matrix mode {pendingImport.setup.matrixMode ? 'on' : 'off'} · export settings. Replace takes them as saved; Add to current
                adds the owned resonators and Vigor changes to yours.
              </p>
            </div>
          )}
          <ul className="import-list">
            {pendingImport.teams.map((t, i) => (
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
