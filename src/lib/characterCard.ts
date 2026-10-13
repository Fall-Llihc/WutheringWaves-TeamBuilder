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
