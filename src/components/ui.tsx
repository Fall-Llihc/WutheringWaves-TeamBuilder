import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CopyIcon,
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
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div className={`level ${className}`} ref={ref} onPointerDown={(e) => e.stopPropagation()}>
      <button
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
      {open && (
        <div className="level-pop" role="listbox" aria-label={title}>
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
        </div>
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
