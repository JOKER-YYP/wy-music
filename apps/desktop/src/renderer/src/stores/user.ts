import { defineStore } from 'pinia'
import type { AuthTokens, UserPublic } from '@wy-music/shared'
import { http } from '../services/http'

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null as UserPublic | null,
    accessToken: localStorage.getItem('accessToken') || '',
    refreshToken: localStorage.getItem('refreshToken') || '',
  }),
  getters: {
    isLogin: (s) => Boolean(s.accessToken && s.user),
  },
  actions: {
    async login(account: string, password: string) {
      const { data } = await http.post('/api/auth/login', { account, password })
      this.applyAuth(data.data as AuthTokens)
    },
    async register(account: string, password: string, nickname?: string) {
      const { data } = await http.post('/api/auth/register', { account, password, nickname })
      this.applyAuth(data.data as AuthTokens)
    },
    applyAuth(payload: AuthTokens) {
      this.user = payload.user
      this.accessToken = payload.accessToken
      this.refreshToken = payload.refreshToken
      localStorage.setItem('accessToken', payload.accessToken)
      localStorage.setItem('refreshToken', payload.refreshToken)
      localStorage.setItem('user', JSON.stringify(payload.user))
    },
    restore() {
      const raw = localStorage.getItem('user')
      if (raw && this.accessToken) {
        try {
          this.user = JSON.parse(raw)
        } catch {
          this.logout()
        }
      }
    },
    async fetchMe() {
      if (!this.accessToken) return
      const { data } = await http.get('/api/auth/me')
      this.user = data.data
      localStorage.setItem('user', JSON.stringify(data.data))
    },
    logout() {
      this.user = null
      this.accessToken = ''
      this.refreshToken = ''
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
    },
  },
})
