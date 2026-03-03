/**
 * ApplySharp — Midnight Forge Theme Constants
 *
 * Single source of truth for all inline-style colors used across components.
 * CSS custom properties (options.css) mirror these values.
 * Import from here instead of hardcoding hex values.
 */

// ── Surface Colors (dark → light) ──────────────────────────────────────

export const surface = {
  void: '#06070a',
  base: '#0a0d13',
  raised: '#0e1219',
  overlay: '#141820',
  elevated: '#1a1f2b',
  floating: '#212838',
  hover: '#283044',
} as const;

// ── Text Colors ─────────────────────────────────────────────────────────

export const text = {
  primary: '#e8ecf4',
  secondary: '#94a3b8',
  faint: '#64748b',
  dim: '#475569',
  muted: '#cbd5e1',
} as const;

// ── Accent Colors ───────────────────────────────────────────────────────

export const accent = {
  amber: '#e8a832',
  amberDark: '#c48a1a',
  amberDim: 'rgba(232, 168, 50, 0.15)',
  amberGlow: 'rgba(232, 168, 50, 0.3)',
} as const;

// ── Semantic Colors ─────────────────────────────────────────────────────

export const semantic = {
  success: '#22c55e',
  successLight: '#34d399',
  successDim: 'rgba(52, 211, 153, 0.12)',
  successBg: 'rgba(34, 197, 94, 0.08)',

  error: '#ef4444',
  errorLight: '#f87171',
  errorDim: 'rgba(248, 113, 113, 0.12)',
  errorBg: 'rgba(239, 68, 68, 0.06)',

  warning: '#f59e0b',
  warningLight: '#fbbf24',
  warningDim: 'rgba(245, 158, 11, 0.12)',

  info: '#38bdf8',
  infoDim: 'rgba(56, 189, 248, 0.12)',

  blue: '#38bdf8',
  violet: '#a78bfa',
  violetDark: '#7c3aed',
  violetDim: 'rgba(167, 139, 250, 0.12)',
  cyan: '#06b6d4',
  pink: '#ec4899',
} as const;

// ── Border Colors ───────────────────────────────────────────────────────

export const border = {
  subtle: 'rgba(255, 255, 255, 0.04)',
  default: 'rgba(255, 255, 255, 0.06)',
  medium: 'rgba(255, 255, 255, 0.1)',
  strong: '#334155',
  accent: 'rgba(232, 168, 50, 0.2)',
} as const;

// ── Convenience: Button Presets ─────────────────────────────────────────

export const button = {
  primary: {
    background: accent.amber,
    color: surface.base,
    hover: accent.amberDark,
  },
  secondary: {
    background: surface.elevated,
    color: text.secondary,
    border: border.medium,
  },
} as const;

// ── Convenience: Workspace / Category Colors ────────────────────────────

export const palette = [
  accent.amber,
  semantic.success,
  semantic.blue,
  semantic.error,
  semantic.violet,
  semantic.pink,
] as const;

// ── Convenience: Score Colors ───────────────────────────────────────────

export function getScoreColor(score: number): string {
  if (score >= 80) return semantic.success;
  if (score >= 60) return semantic.warning;
  return semantic.error;
}

export function getStrengthColor(strength: number): string {
  if (strength >= 80) return semantic.success;
  if (strength >= 60) return semantic.blue;
  if (strength >= 40) return '#eab308';
  if (strength >= 20) return '#f97316';
  return text.secondary;
}

// ── Shorthand alias (for concise inline styles) ─────────────────────────

const theme = {
  surface,
  text,
  accent,
  semantic,
  border,
  button,
  palette,
  getScoreColor,
  getStrengthColor,
} as const;

export default theme;
