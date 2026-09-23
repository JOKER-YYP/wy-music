import { defineStore } from 'pinia'
import type { AuthTokens, UserPublic } from '@wy-music/shared'
import { http } from '../services/http'

export const useAdminStore = defineStore('admin', {
  state: () => ({
    user: null as UserPublic | null,
    accessToken: localStorage.getItem('adminAccessToken') || '',
  }),
  getters: {
    isLogin: (s) => Boolean(s.accessToken),
  },
  actions: {
    restore() {
      const raw = localStorage.getItem('adminUser')
      if (raw && this.accessToken) {
        try {
          this.user = JSON.parse(raw)
        } catch {
          this.logout()
        }
      }
    },
    async login(account: string, password: string) {
      const { data } = await http.post('/api/admin/auth/login', { account, password })
      const payload = data.data as AuthTokens
      this.user = payload.user
      this.accessToken = payload.accessToken
      localStorage.setItem('adminAccessToken', payload.accessToken)
      localStorage.setItem('adminUser', JSON.stringify(payload.user))
    },
    logout() {
      this.user = null
      this.accessToken = ''
      localStorage.removeItem('adminAccessToken')
      localStorage.removeItem('adminUser')
    },
  },
})
