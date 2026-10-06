"use client"

import {
  DEFAULT_THEME,
  THEMES,
  THEME_STORAGE_KEY,
  type Theme,
  type ThemeId,
  isThemeId,
  localizeText,
} from "@/lib/themes"
import { createContext, useCallback, useContext, useEffect, useState } from "react"

interface ThemeContextValue {
  theme: Theme
  setTheme: (id: ThemeId) => void
  /** Rewrites belt wording in a string to the current world's language. */
  localize: (text: string) => string
  /** False until we've read this device's saved choice (avoids a text flash). */
  ready: boolean
  /** True when this device has never picked a world. */
  firstVisit: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: THEMES[DEFAULT_THEME],
  setTheme: () => {},
  localize: (t) => t,
  ready: false,
  firstVisit: false,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME)
  const [ready, setReady] = useState(false)
  const [firstVisit, setFirstVisit] = useState(false)

  // Read the saved choice once on mount (the inline script in layout.tsx has
  // already applied the colours before first paint).
  useEffect(() => {
    let saved: string | null = null
    try {
      saved = window.localStorage.getItem(THEME_STORAGE_KEY)
    } catch {
      // storage blocked — fall back to the default world
    }
    if (isThemeId(saved)) setThemeId(saved)
    else setFirstVisit(true)
    setReady(true)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = themeId
    document.title = THEMES[themeId].appName
  }, [themeId])

  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id)
    setFirstVisit(false)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, id)
    } catch {
      // not persisted, still applies for this visit
    }
  }, [])

  const theme = THEMES[themeId]
  const localize = useCallback((text: string) => localizeText(text, theme), [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, localize, ready, firstVisit }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
