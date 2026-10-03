import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppTheme, ThemeMode, getTheme } from './colors';

interface ThemeContextValue {
  mode: ThemeMode;
  theme: AppTheme;
  toggleTheme: () => void;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
}

const STORAGE_KEY = 'transporty_theme_mode';

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  theme: getTheme('dark'),
  toggleTheme: () => {},
  setMode: () => {},
  isDark: true,
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') {
        setModeState(stored);
      }
    }).catch(() => {});
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(STORAGE_KEY, newMode).catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  const theme = getTheme(mode);

  return (
    <ThemeContext.Provider value={{ mode, theme, toggleTheme, setMode, isDark: mode === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}
