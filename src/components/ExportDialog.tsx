import { toJpeg, toPng } from 'html-to-image';
import { forwardRef, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { activeMode, ELEMENTS, slotElement, UNKNOWN_ID } from '../lib/data';
import { buildPayload, downloadBlob, embedInJpg, embedInPng, timestamp } from '../lib/fileFormat';
import { lookupCharacter, modesOf, useGame } from '../lib/game';
import { chunkByLayout, describeLayout, planLayout } from '../lib/layout';
import { useStore, type ExportSettings, type Team } from '../lib/store';
import { ElementIcon, Icon, Img, Modal } from './ui';

const CELL_W = 660;
const GAP = 24;
const PAD = 40;
const GROUP_PAD = 23; // .x-group padding + border

function ExportTeam({ team, settings }: { team: Team; settings: ExportSettings }) {
  const data = useGame((s) => s.data);
  const autoModes = useGame((s) => s.autoModes);
  return (
    <div className="x-team">
      {settings.showNames && <div className="x-team-name">{team.name || ' '}</div>}
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
                {c && <span className={`x-badge seq tier-S${s.seq}`}>S{s.seq}</span>}
                {mode && c?.kind === 'dual' && <span className="x-mode">{mode}</span>}
                {c && (
                  <span className="x-name">
                    {element ? <ElementIcon id={element} size={18} /> : null}
                    <span>{c.name}</span>
                  </span>
                )}
              </div>
              <div className="x-gear">
                <div className={`x-gear-tile ${w ? `r${w.rarity}` : 'none'}`}>
                  {w && <Img src={w.icon} alt="" eager />}
                  {w && <span className={`x-badge rank tier-R${s.rank}`}>R{s.rank}</span>}
                </div>
                <div className={`x-gear-tile sonata ${so ? '' : 'none'}`}>{so && <Img src={so.icon} alt="" eager />}</div>
                <div className="x-gear-text">
                  <span>{w?.name ?? ''}</span>
                  <span className="muted">{so?.name ?? ''}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {settings.showNotes && team.notes.trim() && <div className="x-notes">{team.notes.trim()}</div>}
    </div>
  );
}

export const ExportSheet = forwardRef<HTMLDivElement, { teams: Team[]; settings: ExportSettings }>(function ExportSheet(
  { teams, settings },
  ref,
) {
  const blocks = useMemo(() => planLayout(teams.length), [teams.length]);
  const groups = chunkByLayout(teams, blocks);
  const maxCols = Math.max(1, ...blocks.map((b) => b.cols));
  const framed = groups.length > 1 ? GROUP_PAD * 2 : 0;
  const width = maxCols * CELL_W + (maxCols - 1) * GAP + PAD * 2 + framed;
  const starts = groups.map((_, i) => groups.slice(0, i).reduce((n, g) => n + g.length, 0));

  return (
    <div ref={ref} className="x-sheet" style={{ width }}>
      {settings.title.trim() && <div className="x-title">{settings.title.trim()}</div>}
      {groups.map((g, gi) => {
        const grid = (
          <div className="x-block" style={{ gridTemplateColumns: `repeat(${blocks[gi].cols}, ${CELL_W}px)`, gap: GAP }}>
            {g.map((t) => (
              <ExportTeam key={t.id} team={t} settings={settings} />
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

export function ExportDialog({ onClose, notify }: { onClose: () => void; notify: (m: string) => void }) {
  const teams = useStore((s) => s.teams);
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

  const doExport = async () => {
    const node = sheetRef.current;
    if (!node || !included.length) return;
    setBusy(true);
    try {
      await waitForImages(node);
      const opts = {
        pixelRatio,
        backgroundColor: '#0f0e0e',
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

  return (
    <Modal
      title="Export image"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="muted">
            {included.length} team{included.length === 1 ? '' : 's'} · layout {describeLayout(blocks) || '–'}
          </span>
          <button className="btn primary" disabled={busy || !included.length} onClick={doExport}>
            <Icon name="download" size={16} /> {busy ? 'Rendering' : `Download ${settings.format.toUpperCase()}`}
          </button>
        </>
      }
    >
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
    </Modal>
  );
}
