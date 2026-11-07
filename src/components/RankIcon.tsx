import { RANK_LABELS } from '../lib/matrixPlan';

/**
 * Matrix rank medals, one per tier of the game's score_level_rule
 * (C, B, A, S, SS, SSS, Crown, Crown II).
 *
 * The pictures are the game's own medals, kept in public/ranks/ (b.png ...
 * crown2.png). The tier below B has no medal in the game, so it shows as a letter.
 */
export const RANK_KEYS = ['c', 'b', 'a', 's', 'ss', 'sss', 'crown', 'crown2'] as const;

/** Glow behind each medal, in the medal's own colour. */
const GLOW = [
  'transparent',
  'rgba(52, 211, 153, 0.45)',
  'rgba(96, 165, 250, 0.45)',
  'rgba(251, 146, 60, 0.45)',
  'rgba(245, 158, 11, 0.5)',
  'rgba(251, 191, 36, 0.55)',
  'rgba(250, 204, 21, 0.55)',
  'rgba(192, 132, 252, 0.6)',
];

/** Rank medal for a tier, sized to fit a square of `size` px. */
export function RankIcon({ tier, size = 48 }: { tier: number; size?: number }) {
  const key = RANK_KEYS[tier];
  const label = RANK_LABELS[tier] ?? '';
  if (!key || key === 'c') {
    return (
      <span className="rank-emblem rank-letter" style={{ width: size, height: size, fontSize: size * 0.62 }} role="img" aria-label={`Rank ${label}`}>
        {label}
      </span>
    );
  }
  return (
    <img
      className="rank-emblem"
      src={`ranks/${key}.png`}
      alt={`Rank ${label}`}
      width={size}
      height={size}
      draggable={false}
      style={{ '--glow': GLOW[tier] } as React.CSSProperties}
    />
  );
}

/** Every tier from B up with its points, the current one marked and the ones reached lit. */
export function RankLadder({ tier, thresholds }: { tier: number; thresholds: number[] }) {
  return (
    <ol className="rank-ladder" aria-label="Rank list">
      {thresholds.map((min, i) =>
        i === 0 ? null : (
          <li key={i} className={`${i <= tier ? 'reached' : ''} ${i === tier ? 'current' : ''}`} title={`${RANK_LABELS[i]} · ${min.toLocaleString('en-US')} pts`}>
            <span className="rank-ink">
              <RankIcon tier={i} size={26} />
            </span>
            <span className="mono">{min >= 1000 ? `${min / 1000}k` : min}</span>
          </li>
        ),
      )}
    </ol>
  );
}
