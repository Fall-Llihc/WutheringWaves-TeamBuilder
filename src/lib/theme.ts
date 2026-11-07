/**
 * Light / dark theme. The choice lives in localStorage ('wtb:theme'); with no
 * choice saved the system setting is followed. index.html applies it before
 * the first paint, so the page never flashes the wrong theme.
 */
import { create } from 'zustand';

export type Theme = 'light' | 'dark';
const KEY = 'wtb:theme';

const systemTheme = (): Theme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

function savedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme, animate: boolean) {
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theme-fade');
    window.setTimeout(() => root.classList.remove('theme-fade'), 350);
  }
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141011' : '#efe8e2');
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

export const useTheme = create<ThemeState>()((set, get) => {
  const initial = savedTheme() ?? systemTheme();
  apply(initial, false);
  // Follow the system until the user picks a theme themselves.
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (savedTheme()) return;
    const t = systemTheme();
    apply(t, true);
    set({ theme: t });
  });
  return {
    theme: initial,
    toggle: () => {
      const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* not remembered */
      }
      apply(next, true);
      set({ theme: next });
    },
  };
});

/** The page background of the current theme, for image exports. */
export const themeBackground = () => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#efe8e2';
