import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CopyIcon,
  DotsSixVerticalIcon,
  DownloadSimpleIcon,
  FloppyDiskIcon,
  ImageIcon,
  MagnifyingGlassIcon,
  NotePencilIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
  UsersThreeIcon,
  XIcon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { elementIcon } from '../lib/data';

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Small numeric selector shown as a badge; opens a row of values. */
export function LevelBadge({
  prefix,
  value,
  min,
  max,
  onChange,
  className = '',
  title,
}: {
  prefix: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  className?: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // The popover lives in a portal (slot cards clip overflow), so place it against
  // the viewport: below the badge, flipped above when short on room, clamped to edges.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const badge = badgeRef.current?.getBoundingClientRect();
      const pop = popRef.current;
      if (!badge || !pop) return;
      const gap = 6;
      const edge = 8;
      const { width, height } = pop.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      let top = badge.bottom + gap;
      if (top + height > vh - edge && badge.top - gap - height >= edge) top = badge.top - gap - height;
      const alignRight = className.includes('rank');
      let left = alignRight ? badge.right - width : badge.left;
      left = Math.min(Math.max(left, edge), vw - width - edge);
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, className]);

  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className={`level ${className}`} ref={ref} onPointerDown={(e) => e.stopPropagation()}>
      <button
        ref={badgeRef}
        type="button"
        className={`level-badge tier-${prefix}${value}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title={title}
        aria-label={`${title}: ${prefix}${value}`}
      >
        {prefix}
        {value}
      </button>
      {open &&
        createPortal(
        <div
          ref={popRef}
          className="level-pop"
          role="listbox"
          aria-label={title}
          style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="level-pop-label">{title}</span>
          <div className="level-pop-row">
            {values.map((v) => (
              <button
                key={v}
                type="button"
                className={v === value ? 'on' : ''}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(v);
                  setOpen(false);
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const ICONS = {
  x: XIcon,
  plus: PlusIcon,
  left: ArrowLeftIcon,
  right: ArrowRightIcon,
  copy: CopyIcon,
  grip: DotsSixVerticalIcon,
  trash: TrashIcon,
  users: UsersThreeIcon,
  image: ImageIcon,
  upload: UploadSimpleIcon,
  download: DownloadSimpleIcon,
  save: FloppyDiskIcon,
  note: NotePencilIcon,
  search: MagnifyingGlassIcon,
  refresh: ArrowClockwiseIcon,
} satisfies Record<string, PhosphorIcon>;

export function Icon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  const C = ICONS[name];
  return <C size={size} weight="regular" aria-hidden="true" />;
}

/** Image that hides itself when the source fails to load. */
export function Img({ src, alt, className, eager }: { src: string; alt: string; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      crossOrigin="anonymous"
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}

export function ElementIcon({ id, size = 18, title }: { id: number; size?: number; title?: string }) {
  const src = elementIcon(id);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={title ?? ''}
      title={title}
      width={size}
      height={size}
      className="el-icon"
      crossOrigin="anonymous"
      draggable={false}
    />
  );
}
