import { defineStore } from 'pinia'
import type { PlaylistDto, TrackDto } from '@wy-music/shared'
import { http } from '../services/http'

export type PlaylistDetail = PlaylistDto & {
  ownerNickname?: string
  tracks: TrackDto[]
}

export const usePlaylistStore = defineStore('playlist', {
  state: () => ({
    list: [] as PlaylistDto[],
    loading: false,
  }),
  getters: {
    createdPlaylists: (s) => s.list.filter((p) => !p.isSystem),
    systemPlaylists: (s) => s.list.filter((p) => p.isSystem),
  },
  actions: {
    async fetchMine() {
      if (!localStorage.getItem('accessToken')) {
        this.list = []
        return
      }
      this.loading = true
      try {
        const { data } = await http.get('/api/playlists')
        this.list = data.data || []
      } finally {
        this.loading = false
      }
    },
    async create(name: string, description?: string) {
      const { data } = await http.post('/api/playlists', { name, description })
      await this.fetchMine()
      return data.data as PlaylistDto
    },
    async remove(id: string) {
      await http.delete(`/api/playlists/${id}`)
      await this.fetchMine()
    },
    async fetchDetail(id: string) {
      const { data } = await http.get(`/api/playlists/${id}`)
      return data.data as PlaylistDetail
    },
    async addTrack(playlistId: string, trackId: string) {
      await http.post(`/api/playlists/${playlistId}/tracks`, { trackId })
      await this.fetchMine()
    },
  },
})
