import { toJpeg, toPng } from 'html-to-image';
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { activeMode, ELEMENTS, slotElement, UNKNOWN_ID } from '../lib/data';
import {
  canvasToBlob,
  fileSafe,
  drawAvatar,
  loadAvatarSource,
  renderCharacterCard,
  type AvatarBackground,
  type AvatarOffset,
  type AvatarSource,
  type AvatarZoom,
} from '../lib/characterCard';
import { buildPayload, downloadBlob, embedInJpg, embedInPng, timestamp } from '../lib/fileFormat';
import { lookupCharacter, modesOf, useGame } from '../lib/game';
import { chunkByLayout, describeLayout, planLayout } from '../lib/layout';
import { findBuff, useMatrix, type MatrixTower } from '../lib/matrix';
import { useStore, type ExportSettings, type Team } from '../lib/store';
import { AvatarTile } from './AvatarTile';
import { ElementIcon, Icon, Img, Modal } from './ui';

const CELL_W = 660;
const GAP = 24;
const PAD = 40;
const GROUP_PAD = 23; // .x-group padding + border
const BUFF_COL = 100; // .x-buff width + gap, added to each cell in Matrix mode

function ExportTeam({ team, settings, tower }: { team: Team; settings: ExportSettings; tower: MatrixTower | null }) {
  const data = useGame((s) => s.data);
  const autoModes = useGame((s) => s.autoModes);
  // Older saved settings lack these keys; missing means shown.
  const showWeapons = settings.showWeapons !== false;
  const showEchoes = settings.showEchoes !== false;
  const showRanks = settings.showRanks !== false;
  const gearCols = [showWeapons && '52px', showEchoes && '52px', '1fr'].filter(Boolean).join(' ');
  return (
    <div className="x-team">
      {settings.showNames && <div className="x-team-name">{team.name || ' '}</div>}
      <div className="x-body">
      <div className="x-slots">
        {team.slots.map((s, i) => {
          const c = lookupCharacter(data, s.charId);
          const w = s.weaponId ? data?.weapons[s.weaponId] : null;
          const so = s.sonataId ? data?.sonatas[s.sonataId] : null;
          const mode = activeMode(modesOf(c, autoModes), s.mode);
          const element = c ? slotElement(c, mode) : 0;
          return (
            <div key={i} className={`x-slot ${c ? `r${c.rarity}` : 'empty'}`} style={{ '--el': ELEMENTS[element]?.color ?? 'transparent' } as React.CSSProperties}>
              <div className="x-portrait">
                {c && c.portrait && <Img src={c.portrait} alt="" eager />}
                {c && !c.portrait && <span className="unknown-mark">{c.id === UNKNOWN_ID ? '?' : c.name[0]}</span>}
                {c && showRanks && <span className={`x-badge seq tier-S${s.seq}`}>S{s.seq}</span>}
                {mode && c?.kind === 'dual' && <span className="x-mode">{mode}</span>}
                {c && (
                  <span className="x-name">
                    {element ? <ElementIcon id={element} size={18} /> : null}
                    <span>{c.name}</span>
                  </span>
                )}
              </div>
              {(showWeapons || showEchoes) && (
                <div className="x-gear" style={{ gridTemplateColumns: gearCols }}>
                  {showWeapons && (
                    <div className={`x-gear-tile ${w ? `r${w.rarity}` : 'none'}`}>
                      {w && <Img src={w.icon} alt="" eager />}
                      {w && showRanks && <span className={`x-badge rank tier-R${s.rank}`}>R{s.rank}</span>}
                    </div>
                  )}
                  {showEchoes && <div className={`x-gear-tile sonata ${so ? '' : 'none'}`}>{so && <Img src={so.icon} alt="" eager />}</div>}
                  <div className="x-gear-text">
                    {showWeapons && <span>{w?.name ?? ''}</span>}
                    {showEchoes && <span className="muted">{so?.name ?? ''}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {tower && <ExportBuff tower={tower} buffId={team.buffId ?? null} />}
      </div>
      {settings.showNotes && team.notes.trim() && <div className="x-notes">{team.notes.trim()}</div>}
    </div>
  );
}

function ExportBuff({ tower, buffId }: { tower: MatrixTower; buffId: string | null }) {
  const buff = findBuff(tower, buffId);
  return <div className={`x-buff ${buff ? '' : 'none'}`}>{buff && <Img src={buff.icon} alt="" eager />}</div>;
}

export const ExportSheet = forwardRef<HTMLDivElement, { teams: Team[]; settings: ExportSettings }>(function ExportSheet(
  { teams, settings },
  ref,
) {
  const blocks = useMemo(() => planLayout(teams.length), [teams.length]);
  const groups = chunkByLayout(teams, blocks);
  const maxCols = Math.max(1, ...blocks.map((b) => b.cols));
  const matrixMode = useStore((s) => s.matrixMode);
  const matrixTower = useMatrix((s) => s.tower);
  const tower = matrixMode ? matrixTower : null;
  const cellW = CELL_W + (tower ? BUFF_COL : 0);
  const framed = groups.length > 1 ? GROUP_PAD * 2 : 0;
  const width = maxCols * cellW + (maxCols - 1) * GAP + PAD * 2 + framed;
  const starts = groups.map((_, i) => groups.slice(0, i).reduce((n, g) => n + g.length, 0));

  return (
    <div ref={ref} className="x-sheet" style={{ width }}>
      {settings.title.trim() && <div className="x-title">{settings.title.trim()}</div>}
      {groups.map((g, gi) => {
        const grid = (
          <div className="x-block" style={{ gridTemplateColumns: `repeat(${blocks[gi].cols}, ${cellW}px)`, gap: GAP }}>
            {g.map((t) => (
              <ExportTeam key={t.id} team={t} settings={settings} tower={tower} />
            ))}
          </div>
        );
        // With more than one block, frame each so the grids read as separate sets.
        return groups.length > 1 ? (
          <div key={gi} className="x-group">
            <div className="x-group-label">
              Set {gi + 1} · {g.length === 1 ? `Team ${starts[gi] + 1}` : `Teams ${starts[gi] + 1}–${starts[gi] + g.length}`}
            </div>
            {grid}
          </div>
        ) : (
          <div key={gi}>{grid}</div>
        );
      })}
      <div className="x-foot">
        <span>Wuthering Waves team sheet</span>
        <img src="llihc-logo.png" alt="Llihc" className="x-logo" />
      </div>
    </div>
  );
});

async function waitForImages(node: HTMLElement) {
  const imgs = Array.from(node.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth ? Promise.resolve() : new Promise<void>((r) => {
        img.addEventListener('load', () => r(), { once: true });
        img.addEventListener('error', () => r(), { once: true });
        setTimeout(r, 8000);
      }),
    ),
  );
}

const TRANSPARENT_PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function dataUrlToBytes(url: string) {
  const b64 = url.slice(url.indexOf(',') + 1);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

interface CharCard {
  name: string;
  url: string;
  canvas: HTMLCanvasElement;
}

interface AvatarEntry {
  id: string;
  name: string;
  src: AvatarSource;
  color?: string;
}

// Nudges are remembered per character, since the art never changes position.
const OFFSETS_KEY = 'wtb:avatar-offsets';
const NO_OFFSET: AvatarOffset = { x: 0, y: 0 };

function readOffsets(): Record<string, AvatarOffset> {
  try {
    return JSON.parse(localStorage.getItem(OFFSETS_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function writeOffsets(o: Record<string, AvatarOffset>) {
  try {
    localStorage.setItem(OFFSETS_KEY, JSON.stringify(o));
  } catch {
    /* storage blocked: nudges last for this session only */
  }
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ExportDialog({ onClose, notify }: { onClose: () => void; notify: (m: string) => void }) {
  const teams = useStore((s) => s.teams);
  const data = useGame((s) => s.data);
  const [mode, setMode] = useState<'sheet' | 'chars' | 'avatars'>('sheet');
  const [avZoom, setAvZoom] = useState<AvatarZoom>('medium');
  const [avBg, setAvBg] = useState<AvatarBackground>('none');
  const autoModes = useGame((s) => s.autoModes);
  const [avatars, setAvatars] = useState<AvatarEntry[]>([]);
  const [offsets, setOffsets] = useState(readOffsets);
  const avOptions = useMemo(() => ({ zoom: avZoom, background: avBg }), [avZoom, avBg]);
  const [charTeamId, setCharTeamId] = useState(() => (teams.find((t) => t.include) ?? teams[0])?.id);
  const charTeam = teams.find((t) => t.id === charTeamId) ?? teams[0];
  const [cards, setCards] = useState<CharCard[]>([]);
  const [noArt, setNoArt] = useState(0);
  const [rendering, setRendering] = useState(false);
  const settings = useStore((s) => s.exportSettings);
  const setSettings = useStore((s) => s.setExportSettings);
  const included = teams.filter((t) => t.include);
  const blocks = planLayout(included.length);
  const sheetRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [sheetH, setSheetH] = useState(0);
  const [pixelRatio, setPixelRatio] = useState(1);
  const [busy, setBusy] = useState(false);

  useLayoutEffect(() => {
    const fit = () => {
      const sheet = sheetRef.current;
      const wrap = wrapRef.current;
      if (!sheet || !wrap) return;
      setScale(Math.min(1, wrap.clientWidth / sheet.offsetWidth));
      setSheetH(sheet.offsetHeight);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (sheetRef.current) ro.observe(sheetRef.current);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [included.length, settings]);

  // Per-character cards re-render whenever the chosen team changes.
  useEffect(() => {
    if (mode !== 'chars' || !charTeam || !data) return;
    let cancelled = false;
    setRendering(true);
    (async () => {
      const out: CharCard[] = [];
      let missing = 0;
      for (const s of charTeam.slots) {
        const char = lookupCharacter(data, s.charId);
        if (!char) continue;
        const weapon = s.weaponId ? data.weapons[s.weaponId] ?? null : null;
        const canvas = await renderCharacterCard({ char, seq: s.seq, weapon, rank: s.rank });
        if (!canvas) {
          missing++;
          continue;
        }
        out.push({ name: char.name, url: canvas.toDataURL('image/png'), canvas });
      }
      if (cancelled) return;
      setCards(out);
      setNoArt(missing);
      setRendering(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, charTeam, data]);

  // Avatars follow the chosen team; art loads once, drawing happens per tile.
  useEffect(() => {
    if (mode !== 'avatars' || !charTeam || !data) return;
    let cancelled = false;
    setRendering(true);
    (async () => {
      const out: AvatarEntry[] = [];
      let missing = 0;
      for (const s of charTeam.slots) {
        const char = lookupCharacter(data, s.charId);
        if (!char) continue;
        const src = await loadAvatarSource(char);
        if (!src) {
          missing++;
          continue;
        }
        const element = slotElement(char, activeMode(modesOf(char, autoModes), s.mode));
        out.push({ id: char.id, name: char.name, src, color: ELEMENTS[element]?.color });
      }
      if (cancelled) return;
      setAvatars(out);
      setNoArt(missing);
      setRendering(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, charTeam, data, autoModes]);

  const setOffset = (id: string, o: AvatarOffset) =>
    setOffsets((prev) => {
      const next = { ...prev, [id]: o };
      if (!o.x && !o.y) delete next[id];
      writeOffsets(next);
      return next;
    });

  const outputs =
    mode === 'avatars'
      ? avatars.map((a) => ({
          name: a.name,
          canvas: () => drawAvatar(a.src, { ...avOptions, color: a.color, offset: offsets[a.id] }),
          suffix: '-avatar',
        }))
      : cards.map((c) => ({ name: c.name, canvas: () => c.canvas, suffix: '' }));

  const doCharExport = async () => {
    if (!charTeam || !outputs.length) return;
    setBusy(true);
    try {
      for (const [i, o] of outputs.entries()) {
        downloadBlob(await canvasToBlob(o.canvas()), `${fileSafe(charTeam.name)}-${i + 1}-${fileSafe(o.name)}${o.suffix}.png`);
        // Browsers drop rapid back-to-back downloads; space them out.
        if (i < outputs.length - 1) await pause(400);
      }
      notify(`Exported ${outputs.length} character image${outputs.length === 1 ? '' : 's'}.`);
    } catch (e) {
      notify(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    const node = sheetRef.current;
    if (!node || !included.length) return;
    setBusy(true);
    try {
      await waitForImages(node);
      const opts = {
        pixelRatio,
        backgroundColor: '#efe8e2',
        cacheBust: false,
        // A missing picture shouldn't sink the whole export; it renders blank instead.
        imagePlaceholder: TRANSPARENT_PX,
        onImageErrorHandler: () => undefined,
      };
      const render = settings.format === 'png' ? toPng : (n: HTMLElement, o: typeof opts) => toJpeg(n, { ...o, quality: 0.93 });
      let url: string;
      try {
        url = await render(node, opts);
      } catch {
        // Webfont embedding can fail on some networks; fall back to system fonts.
        url = await render(node, { ...opts, skipFonts: true } as typeof opts);
      }
      const payload = JSON.stringify(buildPayload(included));
      const bytes = dataUrlToBytes(url);
      const withData = settings.format === 'png' ? embedInPng(bytes, payload) : embedInJpg(bytes, payload);
      const ext = settings.format === 'png' ? 'png' : 'jpg';
      downloadBlob(new Blob([withData as BlobPart], { type: settings.format === 'png' ? 'image/png' : 'image/jpeg' }), `wuwa-teams-${timestamp()}.${ext}`);
      notify(`Exported ${included.length} team${included.length === 1 ? '' : 's'} as ${ext.toUpperCase()}.`);
    } catch (e) {
      notify(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const teamPicker = (
      <label className="field">
        <span>Team</span>
        <select value={charTeam?.id} onChange={(e) => setCharTeamId(e.target.value)}>
          {teams.map((t, i) => (
            <option key={t.id} value={t.id}>
              {String(i + 1).padStart(2, '0')} · {t.name || 'Untitled team'}
            </option>
          ))}
        </select>
      </label>
  );

  return (
    <Modal
      title="Export image"
      onClose={onClose}
      wide
      footer={
        mode === 'sheet' ? (
          <>
            <span className="muted">
              {included.length} team{included.length === 1 ? '' : 's'} · layout {describeLayout(blocks) || '–'}
            </span>
            <button className="btn primary" disabled={busy || !included.length} onClick={doExport}>
              <Icon name="download" size={16} /> {busy ? 'Rendering' : `Download ${settings.format.toUpperCase()}`}
            </button>
          </>
        ) : (
          <>
            <span className="muted">
              {outputs.length} character{outputs.length === 1 ? '' : 's'}
              {noArt ? ` · ${noArt} without art skipped` : ''}
            </span>
            <button className="btn primary" disabled={busy || rendering || !outputs.length} onClick={doCharExport}>
              <Icon name="download" size={16} />{' '}
              {busy ? 'Saving' : outputs.length > 1 ? `Download ${outputs.length} PNGs` : 'Download PNG'}
            </button>
          </>
        )
      }
    >
      <div className="export-mode">
        <div className="seg" role="tablist" aria-label="Export type">
          <button role="tab" aria-selected={mode === 'sheet'} className={mode === 'sheet' ? 'on' : ''} onClick={() => setMode('sheet')}>
            Team sheet
          </button>
          <button role="tab" aria-selected={mode === 'chars'} className={mode === 'chars' ? 'on' : ''} onClick={() => setMode('chars')}>
            Per character
          </button>
          <button role="tab" aria-selected={mode === 'avatars'} className={mode === 'avatars' ? 'on' : ''} onClick={() => setMode('avatars')}>
            Avatars
          </button>
        </div>
      </div>
      {mode === 'avatars' ? (
        <>
          <div className="export-opts">
            {teamPicker}
            <div className="field">
              <span>Framing</span>
              <div className="seg">
                {(['close', 'medium', 'wide'] as const).map((z) => (
                  <button key={z} className={avZoom === z ? 'on' : ''} onClick={() => setAvZoom(z)}>
                    {z[0].toUpperCase() + z.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Background</span>
              <div className="seg">
                {([
                  ['none', 'Transparent'],
                  ['light', 'Light'],
                  ['element', 'Element'],
                ] as const).map(([b, label]) => (
                  <button key={b} className={avBg === b ? 'on' : ''} onClick={() => setAvBg(b)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="hint">
            One round 512px PNG for each character in the team. If someone sits off-centre, drag the picture or use the arrows
            (Shift for bigger steps); the position is remembered for that character.
          </p>
          {avatars.length ? (
            <div className={`char-cards avatars ${rendering ? 'rendering' : ''}`}>
              {avatars.map((a, i) => (
                <AvatarTile
                  key={`${i}-${a.id}`}
                  name={a.name}
                  src={a.src}
                  options={avBg === 'element' ? { ...avOptions, color: a.color } : avOptions}
                  offset={offsets[a.id] ?? NO_OFFSET}
                  onOffset={(o) => setOffset(a.id, o)}
                />
              ))}
            </div>
          ) : (
            <p className="empty-note">{rendering ? 'Rendering' : 'This team has no characters with art yet.'}</p>
          )}
        </>
      ) : mode === 'chars' ? (
        <>
          <div className="export-opts">
            {teamPicker}
          </div>
          <p className="hint">
            One transparent PNG per character: full art with Sequence, weapon and weapon rank. Characters without art (TBA or not
            yet in the game data) are skipped.
          </p>
          {cards.length ? (
            <div className={`char-cards ${rendering ? 'rendering' : ''}`}>
              {cards.map((c, i) => (
                <figure key={i} className="char-card">
                  <img src={c.url} alt={`${c.name} export preview`} />
                  <figcaption>{c.name}</figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="empty-note">{rendering ? 'Rendering' : 'This team has no characters with art yet.'}</p>
          )}
        </>
      ) : (
        <>
          <div className="export-opts">
            <label className="field">
              <span>Title (optional)</span>
              <input value={settings.title} maxLength={80} placeholder="e.g. Tower of Adversity teams" onChange={(e) => setSettings({ title: e.target.value })} />
            </label>
            <div className="field">
              <span>Format</span>
              <div className="seg">
                <button className={settings.format === 'png' ? 'on' : ''} onClick={() => setSettings({ format: 'png' })}>
                  PNG
                </button>
                <button className={settings.format === 'jpg' ? 'on' : ''} onClick={() => setSettings({ format: 'jpg' })}>
                  JPG
                </button>
              </div>
            </div>
            <div className="field">
              <span>Resolution</span>
              <div className="seg">
                <button className={pixelRatio === 1 ? 'on' : ''} onClick={() => setPixelRatio(1)}>
                  1x
                </button>
                <button className={pixelRatio === 2 ? 'on' : ''} onClick={() => setPixelRatio(2)}>
                  2x
                </button>
              </div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={settings.showNames} onChange={(e) => setSettings({ showNames: e.target.checked })} />
              <span className="switch-track" aria-hidden="true" />
              <span>Team names</span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={settings.showNotes} onChange={(e) => setSettings({ showNotes: e.target.checked })} />
              <span className="switch-track" aria-hidden="true" />
              <span>Notes</span>
            </label>
            {([
              ['showWeapons', 'Weapons'],
              ['showEchoes', 'Echoes'],
              ['showRanks', 'Ranks (S / R)'],
            ] as const).map(([key, label]) => (
              <label key={key} className="switch">
                <input type="checkbox" checked={settings[key] !== false} onChange={(e) => setSettings({ [key]: e.target.checked })} />
                <span className="switch-track" aria-hidden="true" />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p className="hint">
            PNG stays sharp; JPG is smaller. Both files carry the team data, so you can import them back here. Turn off Export on a
            team to leave it out.
          </p>
          {included.length ? (
            <div className="preview-wrap" ref={wrapRef} style={{ height: sheetH * scale }}>
              <div className="preview-scale" style={{ transform: `scale(${scale})` }}>
                <ExportSheet ref={sheetRef} teams={included} settings={settings} />
              </div>
            </div>
          ) : (
            <p className="empty-note">No team is set to export. Turn on Export on at least one team.</p>
          )}
        </>
      )}
    </Modal>
  );
}
