/**
 * Per-character export: the character's full transparent art with the
 * Sequence and the weapon (icon + rank) written over the lower half, drawn
 * straight onto a canvas so the PNG keeps its transparency.
 */
import type { Character, Weapon } from './data';

export interface CharacterCardInput {
  char: Character;
  seq: number;
  weapon: Weapon | null;
  rank: number;
}

const FONT_FAMILY = '"Geist Variable", ui-sans-serif, system-ui, sans-serif';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const PLATE = 'rgba(28, 21, 21, 0.78)';
const PLATE_MAX = 'rgba(183, 58, 58, 0.92)';
const FONT_WEIGHT = 700;

/** Rounded dark plate behind a label, so it reads over any art colour. */
function drawPlate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = h * 0.35;
  ctx.shadowOffsetY = h * 0.06;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h * 0.28);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = Math.max(1, h * 0.025);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h * 0.28);
  ctx.stroke();
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  ctx.save();
  ctx.font = `${FONT_WEIGHT} ${size}px ${FONT_FAMILY}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fbf8f5';
  // Nudge down a touch: cap-height digits sit high on a 'middle' baseline.
  ctx.fillText(text, x, y + size * 0.04);
  ctx.restore();
}

/** Renders one character card. Returns null when the character has no art. */
export async function renderCharacterCard({ char, seq, weapon, rank }: CharacterCardInput): Promise<HTMLCanvasElement | null> {
  const [art, icon] = await Promise.all([loadImage(char.portrait), loadImage(weapon?.icon ?? '')]);
  if (!art) return null;

  const w = art.naturalWidth;
  const h = art.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(art, 0, 0, w, h);

  const size = Math.round(w * 0.1);
  const font = `${FONT_WEIGHT} ${size}px ${FONT_FAMILY}`;
  await document.fonts.load(font).catch(() => undefined);
  ctx.font = font;

  const padX = size * 0.45;
  const plateH = size * 1.5;

  const seqText = `S${seq}`;
  const seqW = ctx.measureText(seqText).width;
  const seqPlateW = seqW + padX * 2;
  const seqY = h * 0.7;
  drawPlate(ctx, (w - seqPlateW) / 2, seqY - plateH / 2, seqPlateW, plateH, seq === 6 ? PLATE_MAX : PLATE);
  drawText(ctx, seqText, (w - seqW) / 2, seqY, size);

  if (weapon) {
    const rankText = `R${rank}`;
    const rankW = ctx.measureText(rankText).width;
    const iconSize = icon ? plateH * 1.05 : 0;
    const gap = icon ? size * 0.1 : 0;
    const innerW = iconSize + gap + rankW;
    const plateW = innerW + padX * (icon ? 1.2 : 2);
    const y = seqY + plateH * 1.35;
    const plateX = (w - plateW) / 2;
    drawPlate(ctx, plateX, y - plateH / 2, plateW, plateH, rank === 5 ? PLATE_MAX : PLATE);
    // The icon overhangs the plate slightly so the weapon reads larger.
    const left = plateX + (icon ? padX * 0.35 : padX);
    if (icon) ctx.drawImage(icon, left, y - iconSize / 2, iconSize, iconSize);
    drawText(ctx, rankText, left + iconSize + gap, y, size);
  }
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), 'image/png'),
  );
}

export const fileSafe = (s: string) =>
  s
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'team';

export type AvatarZoom = 'close' | 'medium' | 'wide';
export type AvatarBackground = 'none' | 'light' | 'element';

/** Manual nudge, as a share of the circle's diameter. */
export interface AvatarOffset {
  x: number;
  y: number;
}

export interface AvatarSource {
  art: HTMLImageElement;
  /** Top of the head and its horizontal centre, in art pixels. */
  top: number;
  cx: number;
}

export interface AvatarOptions {
  zoom: AvatarZoom;
  background: AvatarBackground;
  /** Element colour, used when background is 'element'. */
  color?: string;
  offset?: AvatarOffset;
  size?: number;
}

// Circle diameter as a share of the art's width.
const AVATAR_SPAN: Record<AvatarZoom, number> = { close: 0.42, medium: 0.56, wide: 0.74 };
const HEAD_BAND = 0.2; // share of the art's width scanned below the hairline

/**
 * Finds the top of the head and its horizontal centre from the art's alpha:
 * the first row with a solid run of pixels, then the opaque centroid of the
 * band just below it.
 */
function findHead(art: HTMLImageElement) {
  const scan = 160;
  const k = scan / art.naturalWidth;
  const w = scan;
  const h = Math.round(art.naturalHeight * k);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(art, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const solid = (x: number, y: number) => px[(y * w + x) * 4 + 3] > 140;

  let top = 0;
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (solid(x, y)) n++;
    if (n > w * 0.06) {
      top = y;
      break;
    }
  }
  const bandH = Math.round(w * HEAD_BAND);
  let sum = 0;
  let n = 0;
  for (let y = top; y < Math.min(h, top + bandH); y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y)) {
        sum += x;
        n++;
      }
    }
  }
  return { top: top / k, cx: n ? sum / n / k : art.naturalWidth / 2 };
}

/** Loads a character's art and locates the head. Returns null when there is no art. */
export async function loadAvatarSource(char: Character): Promise<AvatarSource | null> {
  const art = await loadImage(char.portrait);
  if (!art) return null;
  return { art, ...findHead(art) };
}

/** Draws the circle-cropped head shot; synchronous so it can follow a drag. */
export function drawAvatar(
  src: AvatarSource,
  { zoom, background, color, offset = { x: 0, y: 0 }, size = 512 }: AvatarOptions,
  canvas = document.createElement('canvas'),
): HTMLCanvasElement {
  const d = src.art.naturalWidth * AVATAR_SPAN[zoom];
  // Leave a little air above the hair, then let the shoulders fill the rest.
  const sx = src.cx - d / 2 - offset.x * d;
  const sy = src.top - d * 0.06 - offset.y * d;

  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (background !== 'none') {
    ctx.fillStyle = background === 'element' && color ? color : '#f6f2ee';
    ctx.fillRect(0, 0, size, size);
  }
  ctx.drawImage(src.art, sx, sy, d, d, 0, 0, size, size);
  ctx.restore();

  // White ring, drawn inside the edge so it isn't cut off by the canvas.
  const ring = Math.max(2, Math.round(size * 0.025));
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - ring / 2, 0, Math.PI * 2);
  ctx.lineWidth = ring;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  return canvas;
}
