/**
 * Transporty OS — Design System Tokens
 * Premium dark/light mode palette inspired by Uber/InDrive fleet management aesthetics.
 */

export const palette = {
  // Brand Electric Blue
  electric50:  '#eef8ff',
  electric200: '#bce3fd',
  electric300: '#80cffd',
  electric400: '#3cb8fa',
  electric500: '#12a0ef',
  electric600: '#037fcd',
  electric700: '#0364a6',
  electric800: '#065589',
  electric900: '#0a4771',

  // Surface (dark mode)
  darkBase:    '#080D16',
  darkCard:    '#0F1828',
  darkBorder:  '#1E2D42',
  darkMuted:   '#253447',

  // Accent Cyan
  cyan400: '#22d3ee',
  cyan500: '#06b6d4',

  // Status
  green400: '#4ade80',
  green500: '#22c55e',
  red400:   '#f87171',
  red500:   '#ef4444',
  amber400: '#fbbf24',
  amber500: '#f59e0b',

  // Neutral
  white:   '#ffffff',
  gray50:  '#f8fafc',
  gray100: '#f1f5f9',
  gray200: '#e2e8f0',
  gray300: '#cbd5e1',
  gray400: '#94a3b8',
  gray500: '#64748b',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1e293b',
  gray900: '#0f172a',
} as const;

export type ThemeMode = 'dark' | 'light';

export interface AppTheme {
  bg: string;
  card: string;
  cardElevated: string;
  border: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  accent: string;
  accentSoft: string;
  statusActive: string;
  statusInactive: string;
  statusWarning: string;
  statusDanger: string;
  inputBg: string;
  inputBorder: string;
  headerBg: string;
  tabActiveBg: string;
}

export const darkTheme: AppTheme = {
  bg:              '#080D16',
  card:            '#0F1828',
  cardElevated:    '#162035',
  border:          '#1E2D42',
  text:            '#E8EFF7',
  textMuted:       '#7A9BBF',
  textSubtle:      '#4D6A88',
  accent:          '#3CB8FA',
  accentSoft:      '#3CB8FA1A',
  statusActive:    '#4ADE80',
  statusInactive:  '#475569',
  statusWarning:   '#FBBF24',
  statusDanger:    '#F87171',
  inputBg:         '#111B2B',
  inputBorder:     '#1E2D42',
  headerBg:        '#080D16F5',
  tabActiveBg:     '#3CB8FA18',
};

export const lightTheme: AppTheme = {
  bg:              '#F0F4F8',
  card:            '#FFFFFF',
  cardElevated:    '#F8FAFC',
  border:          '#E2E8F0',
  text:            '#0F172A',
  textMuted:       '#64748B',
  textSubtle:      '#94A3B8',
  accent:          '#037FCD',
  accentSoft:      '#037FCD12',
  statusActive:    '#16A34A',
  statusInactive:  '#94A3B8',
  statusWarning:   '#D97706',
  statusDanger:    '#DC2626',
  inputBg:         '#F8FAFC',
  inputBorder:     '#E2E8F0',
  headerBg:        '#FFFFFFEE',
  tabActiveBg:     '#037FCD0D',
};

export const getTheme = (mode: ThemeMode): AppTheme =>
  mode === 'dark' ? darkTheme : lightTheme;
