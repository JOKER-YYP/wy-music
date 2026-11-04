import { defineStore } from 'pinia'
import {
  THEME_PRESETS,
  applyTheme,
  loadThemeId,
  setTheme as persistTheme,
  type ThemeId,
} from '../themes'

export const useThemeStore = defineStore('theme', {
  state: () => ({
    id: loadThemeId() as ThemeId,
  }),
  getters: {
    preset: (state) => THEME_PRESETS.find((t) => t.id === state.id) || THEME_PRESETS[0]!,
    presets: () => THEME_PRESETS,
  },
  actions: {
    init() {
      this.id = loadThemeId()
      applyTheme(this.id)
    },
    setTheme(id: ThemeId) {
      this.id = id
      persistTheme(id)
    },
  },
})
