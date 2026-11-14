'use client';

// components/home/AccentProvider.tsx — P1
//
// Holds the chosen accent, writes it to CSS custom properties on <html>, and
// remembers it. Ported from the Doppel frontend's AccentProvider.
//
// Two things it does deliberately:
//
// 1. It starts on the DEFAULT every render, including the client's first, and
//    only reads localStorage in an effect. Reading storage during render would
//    make the first client paint disagree with the server's and React would
//    throw a hydration mismatch.
// 2. Every storage access is wrapped. localStorage throws outright in some
//    privacy modes, and an accent picker is not worth taking the page down for.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ACCENTS, ACCENT_STORAGE_KEY, DEFAULT_ACCENT_ID, type AccentPreset } from './accents';

interface AccentContextValue {
  accent: AccentPreset;
  setAccentId: (id: string) => void;
}

const fallback = ACCENTS.find((a) => a.id === DEFAULT_ACCENT_ID) ?? ACCENTS[0];

const AccentContext = createContext<AccentContextValue>({
  accent: fallback,
  setAccentId: () => {},
});

export function AccentProvider({ children }: { children: ReactNode }) {
  const [accentId, setAccentId] = useState(DEFAULT_ACCENT_ID);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACCENT_STORAGE_KEY);
      if (saved && ACCENTS.some((a) => a.id === saved)) setAccentId(saved);
    } catch {
      /* storage blocked — keep the default */
    }
  }, []);

  const accent = useMemo(() => ACCENTS.find((a) => a.id === accentId) ?? fallback, [accentId]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--night-accent', accent.accent);
    root.style.setProperty('--night-accent-deep', accent.deep);
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, accent.id);
    } catch {
      /* ignore */
    }
  }, [accent]);

  const value = useMemo(
    () => ({ accent, setAccentId: (id: string) => setAccentId(id) }),
    [accent],
  );

  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

export function useAccent(): AccentContextValue {
  return useContext(AccentContext);
}
