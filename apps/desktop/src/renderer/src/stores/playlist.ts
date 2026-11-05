import { defineStore } from 'pinia'
import type { PlaylistCollectorDto, PlaylistDto, TrackDto } from '@wy-music/shared'
import { http } from '../services/http'

export type PlaylistDetail = PlaylistDto & {
  ownerNickname?: string
  ownerAvatar?: string | null
  tracks: TrackDto[]
}

export const usePlaylistStore = defineStore('playlist', {
  state: () => ({
    list: [] as PlaylistDto[],
    collected: [] as PlaylistDto[],
    loading: false,
    collectedLoading: false,
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
    async fetchCollected() {
      if (!localStorage.getItem('accessToken')) {
        this.collected = []
        return
      }
      this.collectedLoading = true
      try {
        const { data } = await http.get('/api/playlists/collected')
        this.collected = data.data || []
      } finally {
        this.collectedLoading = false
      }
    },
    async create(
      name: string,
      options?: { description?: string; isPublic?: boolean },
    ) {
      const { data } = await http.post('/api/playlists', {
        name,
        description: options?.description,
        isPublic: options?.isPublic ?? false,
      })
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
    async update(
      id: string,
      payload: { name: string; description?: string; tags?: string; isPublic?: boolean },
    ) {
      const { data } = await http.put(`/api/playlists/${id}`, payload)
      await this.fetchMine()
      return data.data as PlaylistDto
    },
    async addTrack(playlistId: string, trackId: string) {
      await http.post(`/api/playlists/${playlistId}/tracks`, { trackId })
      await this.fetchMine()
    },
    async reorderTracks(playlistId: string, trackIds: string[]) {
      await http.put(`/api/playlists/${playlistId}/tracks/reorder`, { trackIds })
    },
    async saveAs(id: string, options?: { name?: string; isPublic?: boolean }) {
      const { data } = await http.post(`/api/playlists/${id}/save-as`, {
        name: options?.name,
        isPublic: options?.isPublic,
      })
      await this.fetchMine()
      return data.data as PlaylistDto
    },
    async collect(id: string) {
      const { data } = await http.post(`/api/playlists/${id}/collect`)
      const payload = data.data as { collected: boolean; collectCount: number }
      await this.fetchCollected()
      return payload
    },
    async uncollect(id: string) {
      const { data } = await http.delete(`/api/playlists/${id}/collect`)
      const payload = data.data as { collected: boolean; collectCount: number }
      this.collected = this.collected.filter((p) => p.id !== id)
      return payload
    },
    async fetchCollectors(id: string, page = 1, pageSize = 30) {
      const { data } = await http.get(`/api/playlists/${id}/collectors`, {
        params: { page, pageSize },
      })
      return data.data as {
        total: number
        page: number
        pageSize: number
        list: PlaylistCollectorDto[]
      }
    },
  },
})
