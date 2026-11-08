import { useMemo } from 'react';
import { boardCycle } from '../lib/budget';
import { ELEMENTS, UNKNOWN_ID } from '../lib/data';
import { lookupCharacter, useGame } from '../lib/game';
import { bonusFor, vigorMax, vigorGroup, vigorUsage } from '../lib/matrixPlan';
import { useStore, type Team } from '../lib/store';
import { costUsage, TOWER, useTower } from '../lib/tower';
import { Icon, Img, Modal, VigorIcon } from './ui';

export interface PresetCheck {
  /** Per slot: spent / max after loading the preset, when it goes over. */
  over: Array<{ used: number; max: number } | null>;
  /** Per slot: not marked owned in the roster. */
  missing: boolean[];
}

/**
 * Builder teams to load into a Matrix or Tower team. Each one is checked as if
 * it replaced the target team: resonators that would go over their Vigor (or
 * Tower cost) are marked, and so are ones not marked owned. Loading is still
 * allowed; the slots keep showing the over-limit mark afterwards.
 */
export function PresetPicker({ teamId, onPick, onClose }: { teamId: string; onPick: (preset: Team, check: PresetCheck) => void; onClose: () => void }) {
  const presets = useStore((s) => s.boards.builder ?? []);
  const teams = useStore((s) => s.teams);
  const mode = useStore((s) => s.mode);
  const board = useStore((s) => s.board);
  const owned = useStore((s) => s.owned);
  const overrides = useStore((s) => s.vigorOverride);
  const cycles = useTower((s) => s.cycles);
  const data = useGame((s) => s.data);
  const target = teams.find((t) => t.id === teamId);
  const cycleId = boardCycle(board);
  const cycle = cycleId ? cycles[cycleId] : null;
  const unit = mode === 'tower' ? 'cost' : 'Vigor';

  const checked = useMemo(
    () =>
      presets
        .filter((p) => p.slots.some((s) => s.charId))
        .map((p) => {
          const trial = teams.map((t) => (t.id === teamId ? { ...t, slots: p.slots } : t));
          const usage = mode === 'tower' ? costUsage(trial, cycle) : vigorUsage(trial);
          const check: PresetCheck = {
            over: p.slots.map((s) => {
              const c = lookupCharacter(data, s.charId);
              if (!c || c.id === UNKNOWN_ID) return null;
              const used = usage[vigorGroup(c.id)] ?? 0;
              const max = mode === 'tower' ? TOWER.cost : vigorMax(c, overrides, bonusFor(board));
              return used > max ? { used, max } : null;
            }),
            missing: p.slots.map((s) => !!s.charId && s.charId !== UNKNOWN_ID && !owned[s.charId]),
          };
          return { preset: p, check, overCount: check.over.filter(Boolean).length };
        }),
    [presets, teams, teamId, mode, cycle, data, overrides, owned],
  );

  return (
    <Modal title={`Load a builder team${target ? ` into ${target.name || 'this team'}` : ''}`} onClose={onClose} wide>
      {checked.length === 0 ? (
        <div className="roster-empty">
          <Icon name="stack" size={22} />
          <p>No builder teams yet. Switch to Builder, make your teams there, then load them here as presets.</p>
        </div>
      ) : (
        <>
          <p className="preset-hint muted">
            Your builder teams, checked against this plan. <span className="preset-key over">2/1</span> would go over {unit};{' '}
            <span className="preset-key missing">dim</span> isn't marked owned. Loading replaces this team's line-up and gear.
          </p>
          <ul className="preset-list">
            {checked.map(({ preset, check, overCount }, i) => (
              <li key={preset.id}>
                <button type="button" className={`preset ${overCount ? 'has-over' : ''}`} onClick={() => onPick(preset, check)}>
                  <span className="preset-head">
                    <span className="mono muted">{String(i + 1).padStart(2, '0')}</span>
                    <strong>{preset.name || `Team ${i + 1}`}</strong>
                    {overCount > 0 ? (
                      <span className="preset-flag">
                        <VigorIcon size={12} /> {overCount} over {unit}
                      </span>
                    ) : (
                      <span className="preset-flag ok">
                        <Icon name="check" size={12} weight="bold" /> Fits
                      </span>
                    )}
                  </span>
                  <span className="preset-slots">
                    {preset.slots.map((s, k) => {
                      const c = lookupCharacter(data, s.charId);
                      const over = check.over[k];
                      return (
                        <span
                          key={k}
                          className={`preset-face ${c ? `r${c.rarity}` : 'empty'} ${check.missing[k] ? 'missing' : ''} ${over ? 'over' : ''}`}
                          style={{ '--el': c ? ELEMENTS[c.element]?.color : 'transparent' } as React.CSSProperties}
                          title={c ? `${c.name}${over ? `: ${over.used}/${over.max} ${unit}` : ''}${check.missing[k] ? ' (not owned)' : ''}` : 'Empty'}
                        >
                          {c?.icon || c?.portrait ? <Img src={c.icon || c.portrait} alt="" /> : null}
                          {over && (
                            <span className="preset-over mono">
                              {over.used}/{over.max}
                            </span>
                          )}
                          {c ? <span className="preset-name">{c.name}</span> : null}
                        </span>
                      );
                    })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
