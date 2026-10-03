/**
 * Transporty OS — Design System Tokens
 * Premium dark/light mode palette inspired by provided reference designs (Uber/InDrive style).
 */

export const palette = {
  // Brand Vibrant Orange/Amber
  primary50:  '#fff8ed',
  primary200: '#fed7aa',
  primary300: '#fdba74',
  primary400: '#fb923c',
  primary500: '#f97316', // Main Accent
  primary600: '#ea580c',
  primary700: '#c2410c',
  primary800: '#9a3412',
  primary900: '#7c2d12',

  // Surface (dark mode) - Deep rich dark gray/blacks
  darkBase:    '#121212',
  darkCard:    '#1A1C20',
  darkBorder:  '#2C2F36',
  darkMuted:   '#383B42',

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
  bg:              '#121212',
  card:            '#1A1C20',
  cardElevated:    '#222429',
  border:          '#2C2F36',
  text:            '#FFFFFF',
  textMuted:       '#A0A4AB',
  textSubtle:      '#646973',
  accent:          '#F97316',
  accentSoft:      '#F973161A',
  statusActive:    '#4ADE80',
  statusInactive:  '#475569',
  statusWarning:   '#FBBF24',
  statusDanger:    '#F87171',
  inputBg:         '#1C1E23',
  inputBorder:     '#2C2F36',
  headerBg:        '#121212F5', // Glassmorphism base
  tabActiveBg:     '#F9731618',
};

export const lightTheme: AppTheme = {
  bg:              '#F5F7FA',
  card:            '#FFFFFF',
  cardElevated:    '#FAFAFA',
  border:          '#E2E8F0',
  text:            '#1A1C20',
  textMuted:       '#64748B',
  textSubtle:      '#94A3B8',
  accent:          '#EA580C',
  accentSoft:      '#EA580C12',
  statusActive:    '#16A34A',
  statusInactive:  '#94A3B8',
  statusWarning:   '#D97706',
  statusDanger:    '#DC2626',
  inputBg:         '#FFFFFF',
  inputBorder:     '#E2E8F0',
  headerBg:        '#FFFFFFEE',
  tabActiveBg:     '#EA580C0D',
};

export const getTheme = (mode: ThemeMode): AppTheme =>
  mode === 'dark' ? darkTheme : lightTheme;
