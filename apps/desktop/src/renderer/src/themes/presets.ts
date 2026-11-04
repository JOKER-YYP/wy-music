export type ThemeMode = 'light' | 'dark'

export type ThemeId =
  | 'classic-red'
  | 'dark'
  | 'white'
  | 'sky'
  | 'forest'
  | 'violet'
  | 'orange'
  | 'sakura'

/** 写入 documentElement 的 CSS 变量（不含 -- 前缀外的其它） */
export type ThemeVars = Record<string, string>

export type ThemePreset = {
  id: ThemeId
  name: string
  /** 设置页色块预览 */
  preview: {
    topbar: string
    accent: string
    bg: string
  }
  mode: ThemeMode
  vars: ThemeVars
}

function soft(r: number, g: number, b: number, a: number) {
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function brandFamily(
  brand: string,
  hover: string,
  rgb: [number, number, number],
  tint: string,
): ThemeVars {
  const [r, g, b] = rgb
  return {
    '--wy-brand': brand,
    '--wy-brand-hover': hover,
    '--wy-brand-soft': soft(r, g, b, 0.08),
    '--wy-brand-soft-strong': soft(r, g, b, 0.14),
    '--wy-brand-tint': tint,
    '--wy-cover-gradient': `linear-gradient(135deg, ${tint}, ${brand})`,
    '--wy-focus-ring': `0 0 0 2px #fff, 0 0 0 4px ${soft(r, g, b, 0.45)}`,
    '--el-color-primary': brand,
    '--el-color-primary-dark-2': hover,
  }
}

const lightChrome: ThemeVars = {
  '--wy-bg': '#ffffff',
  '--wy-sidebar': '#f7f7f9',
  '--wy-surface': '#ffffff',
  '--wy-surface-muted': '#f5f5f7',
  '--wy-border': '#ebebed',
  '--wy-border-strong': '#e0e0e4',
  '--wy-text': '#1a1a1a',
  '--wy-text-secondary': '#5c5c66',
  '--wy-text-muted': '#8a8a96',
  '--wy-text-on-brand': '#ffffff',
  '--wy-scrollbar': '#c8c8d0',
  '--wy-scrollbar-hover': '#b0b0ba',
  '--wy-shadow-sm': '0 1px 2px rgba(16, 16, 24, 0.06), 0 4px 12px rgba(16, 16, 24, 0.04)',
  '--el-bg-color': '#ffffff',
  '--el-bg-color-page': '#ffffff',
  '--el-bg-color-overlay': '#ffffff',
  '--el-text-color-primary': '#1a1a1a',
  '--el-text-color-regular': '#5c5c66',
  '--el-text-color-secondary': '#8a8a96',
  '--el-border-color': '#ebebed',
}

function coloredTopbar(brand: string): ThemeVars {
  return {
    '--wy-topbar': brand,
    '--wy-topbar-fg': '#ffffff',
    '--wy-on-brand-muted': 'rgba(255, 255, 255, 0.72)',
    '--wy-on-brand-soft': 'rgba(255, 255, 255, 0.88)',
    '--wy-topbar-control': 'rgba(0, 0, 0, 0.14)',
    '--wy-topbar-control-hover': 'rgba(0, 0, 0, 0.22)',
  }
}

/** 网易云风格：内置皮肤 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'classic-red',
    name: '经典红',
    preview: { topbar: '#ec4141', accent: '#ec4141', bg: '#ffffff' },
    mode: 'light',
    vars: {
      ...lightChrome,
      ...brandFamily('#ec4141', '#e03535', [236, 65, 65], '#ff8a80'),
      ...coloredTopbar('#ec4141'),
    },
  },
  {
    id: 'dark',
    name: '暗夜黑',
    preview: { topbar: '#141414', accent: '#ec4141', bg: '#121212' },
    mode: 'dark',
    vars: {
      ...brandFamily('#ec4141', '#e03535', [236, 65, 65], '#ff8a80'),
      '--wy-bg': '#121212',
      '--wy-sidebar': '#191919',
      '--wy-surface': '#1e1e1e',
      '--wy-surface-muted': '#262626',
      '--wy-border': '#2e2e2e',
      '--wy-border-strong': '#3a3a3a',
      '--wy-text': '#ececf0',
      '--wy-text-secondary': '#b0b0ba',
      '--wy-text-muted': '#7a7a86',
      '--wy-text-on-brand': '#ffffff',
      '--wy-brand-soft': 'rgba(236, 65, 65, 0.16)',
      '--wy-brand-soft-strong': 'rgba(236, 65, 65, 0.24)',
      '--wy-scrollbar': '#4a4a52',
      '--wy-scrollbar-hover': '#5c5c66',
      '--wy-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.35), 0 8px 20px rgba(0, 0, 0, 0.28)',
      '--wy-topbar': '#141414',
      '--wy-topbar-fg': '#ffffff',
      '--wy-on-brand-muted': 'rgba(255, 255, 255, 0.62)',
      '--wy-on-brand-soft': 'rgba(255, 255, 255, 0.88)',
      '--wy-topbar-control': 'rgba(255, 255, 255, 0.08)',
      '--wy-topbar-control-hover': 'rgba(255, 255, 255, 0.14)',
      '--el-bg-color': '#1e1e1e',
      '--el-bg-color-page': '#121212',
      '--el-bg-color-overlay': '#1e1e1e',
      '--el-text-color-primary': '#ececf0',
      '--el-text-color-regular': '#b0b0ba',
      '--el-text-color-secondary': '#7a7a86',
      '--el-border-color': '#2e2e2e',
      '--el-fill-color-blank': '#1e1e1e',
      '--el-fill-color-light': '#262626',
      '--el-fill-color-lighter': '#262626',
      '--el-mask-color': 'rgba(0, 0, 0, 0.65)',
    },
  },
  {
    id: 'white',
    name: '极简白',
    preview: { topbar: '#f5f5f7', accent: '#ec4141', bg: '#ffffff' },
    mode: 'light',
    vars: {
      ...lightChrome,
      ...brandFamily('#ec4141', '#e03535', [236, 65, 65], '#ff8a80'),
      '--wy-topbar': '#f5f5f7',
      '--wy-topbar-fg': '#1a1a1a',
      '--wy-on-brand-muted': 'rgba(26, 26, 26, 0.55)',
      '--wy-on-brand-soft': 'rgba(26, 26, 26, 0.82)',
      '--wy-topbar-control': 'rgba(0, 0, 0, 0.06)',
      '--wy-topbar-control-hover': 'rgba(0, 0, 0, 0.1)',
      '--wy-text-on-brand': '#ffffff',
    },
  },
  {
    id: 'sky',
    name: '天空蓝',
    preview: { topbar: '#3b82f6', accent: '#3b82f6', bg: '#ffffff' },
    mode: 'light',
    vars: {
      ...lightChrome,
      ...brandFamily('#3b82f6', '#2563eb', [59, 130, 246], '#93c5fd'),
      ...coloredTopbar('#3b82f6'),
    },
  },
  {
    id: 'forest',
    name: '青叶绿',
    preview: { topbar: '#16a34a', accent: '#16a34a', bg: '#ffffff' },
    mode: 'light',
    vars: {
      ...lightChrome,
      ...brandFamily('#16a34a', '#15803d', [22, 163, 74], '#86efac'),
      ...coloredTopbar('#16a34a'),
    },
  },
  {
    id: 'violet',
    name: '罗兰紫',
    preview: { topbar: '#7c3aed', accent: '#7c3aed', bg: '#ffffff' },
    mode: 'light',
    vars: {
      ...lightChrome,
      ...brandFamily('#7c3aed', '#6d28d9', [124, 58, 237], '#c4b5fd'),
      ...coloredTopbar('#7c3aed'),
    },
  },
  {
    id: 'orange',
    name: '暖阳橙',
    preview: { topbar: '#f97316', accent: '#f97316', bg: '#ffffff' },
    mode: 'light',
    vars: {
      ...lightChrome,
      ...brandFamily('#f97316', '#ea580c', [249, 115, 22], '#fdba74'),
      ...coloredTopbar('#f97316'),
    },
  },
  {
    id: 'sakura',
    name: '樱花粉',
    preview: { topbar: '#ec4899', accent: '#ec4899', bg: '#ffffff' },
    mode: 'light',
    vars: {
      ...lightChrome,
      ...brandFamily('#ec4899', '#db2777', [236, 72, 153], '#f9a8d4'),
      ...coloredTopbar('#ec4899'),
    },
  },
]

export const DEFAULT_THEME_ID: ThemeId = 'classic-red'

export function getThemePreset(id: string | null | undefined): ThemePreset {
  return THEME_PRESETS.find((t) => t.id === id) || THEME_PRESETS[0]!
}
