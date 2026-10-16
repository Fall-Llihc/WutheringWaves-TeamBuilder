import { useEffect, useRef } from 'react';
import { drawAvatar, type AvatarOffset, type AvatarOptions, type AvatarSource } from '../lib/characterCard';
import { Icon } from './ui';

const STEP = 0.02; // nudge per arrow press, as a share of the circle
const LIMIT = 0.5;

const clamp = (v: number) => Math.min(LIMIT, Math.max(-LIMIT, Math.round(v * 1000) / 1000));

/** Live avatar preview: drag the picture (or use the arrows) to recentre the character. */
export function AvatarTile({
  name,
  src,
  options,
  offset,
  onOffset,
}: {
  name: string;
  src: AvatarSource;
  options: Omit<AvatarOptions, 'offset'>;
  offset: AvatarOffset;
  onOffset: (o: AvatarOffset) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; start: AvatarOffset; w: number } | null>(null);

  useEffect(() => {
    if (canvasRef.current) drawAvatar(src, { ...options, offset }, canvasRef.current);
  }, [src, options, offset]);

  const nudge = (dx: number, dy: number) => onOffset({ x: clamp(offset.x + dx), y: clamp(offset.y + dy) });
  const moved = offset.x !== 0 || offset.y !== 0;

  return (
    <figure className="char-card avatar-tile">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label={`${name} avatar. Drag or use arrow keys to move the character.`}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, start: offset, w: e.currentTarget.clientWidth };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          onOffset({ x: clamp(d.start.x + (e.clientX - d.x) / d.w), y: clamp(d.start.y + (e.clientY - d.y) / d.w) });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? STEP * 4 : STEP;
          const dir = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
          if (!dir) return;
          e.preventDefault();
          nudge(dir[0], dir[1]);
        }}
      />
      <figcaption>
        <span>{name}</span>
        <span className="avatar-nudge">
          <button type="button" className="icon-btn" aria-label="Move left" onClick={() => nudge(-STEP, 0)}>
            <Icon name="left" size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label="Move up" onClick={() => nudge(0, -STEP)}>
            <Icon name="up" size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label="Move down" onClick={() => nudge(0, STEP)}>
            <Icon name="down" size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label="Move right" onClick={() => nudge(STEP, 0)}>
            <Icon name="right" size={14} />
          </button>
          <button type="button" className="icon-btn" aria-label="Reset position" disabled={!moved} onClick={() => onOffset({ x: 0, y: 0 })}>
            <Icon name="refresh" size={14} />
          </button>
        </span>
      </figcaption>
    </figure>
  );
}
