import { useMemo } from 'react';

/** Soft washes in the page palette: sakura, shu red, warm cream, a hint of wisteria. */
const COLORS = ['240, 191, 194', '233, 163, 163', '243, 220, 196', '220, 201, 224', '245, 205, 184', '236, 195, 207'];

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/**
 * Background aurora: a few large soft radial gradients, placed at random on
 * every page load. Painted once as one static layer: no blur filter and no
 * animation, so it costs nothing while scrolling or dragging.
 */
export function Aurora() {
  const background = useMemo(() => {
    const colors = [...COLORS].sort(() => Math.random() - 0.5);
    return Array.from({ length: 5 }, (_, i) => {
      const w = rand(45, 75);
      const h = w * rand(0.6, 0.85);
      const a = rand(0.35, 0.55).toFixed(2);
      return `radial-gradient(${w.toFixed(1)}vmax ${h.toFixed(1)}vmax at ${rand(-5, 105).toFixed(1)}% ${rand(-10, 100).toFixed(1)}%, rgba(${colors[i % colors.length]}, ${a}), transparent 70%)`;
    }).join(', ');
  }, []);

  return <div className="aurora" aria-hidden="true" style={{ background }} />;
}
