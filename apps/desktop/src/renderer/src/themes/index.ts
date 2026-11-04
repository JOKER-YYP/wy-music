import {
  DEFAULT_THEME_ID,
  THEME_PRESETS,
  getThemePreset,
  type ThemeId,
  type ThemePreset,
} from './presets'

export { THEME_PRESETS, DEFAULT_THEME_ID, getThemePreset }
export type { ThemeId, ThemePreset }

const STORAGE_KEY = 'wy-theme-id'

export function loadThemeId(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && THEME_PRESETS.some((t) => t.id === raw)) return raw as ThemeId
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME_ID
}

export function saveThemeId(id: ThemeId) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

let appliedVarKeys: string[] = []

/** 将主题变量写到根节点；暗色同步 Element Plus dark class */
export function applyTheme(id: ThemeId | string) {
  const preset = getThemePreset(id)
  const root = document.documentElement
  root.setAttribute('data-theme', preset.id)
  root.setAttribute('data-theme-mode', preset.mode)
  root.classList.toggle('dark', preset.mode === 'dark')

  for (const key of appliedVarKeys) {
    root.style.removeProperty(key)
  }

  const entries = Object.entries(preset.vars)
  for (const [key, value] of entries) {
    root.style.setProperty(key, value)
  }
  appliedVarKeys = entries.map(([k]) => k)

  // 同步主窗口启动底色（Electron 闪屏）
  const top = preset.vars['--wy-topbar'] || preset.vars['--wy-brand'] || '#ec4141'
  root.style.setProperty('--wy-window-bg', top)
  if (!appliedVarKeys.includes('--wy-window-bg')) appliedVarKeys.push('--wy-window-bg')

  return preset
}

export function applyStoredTheme() {
  return applyTheme(loadThemeId())
}

export function setTheme(id: ThemeId) {
  saveThemeId(id)
  return applyTheme(id)
}
