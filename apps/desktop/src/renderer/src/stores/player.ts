import { defineStore } from 'pinia'
import type { TrackDto } from '@wy-music/shared'
import { http, streamUrl } from '../services/http'

type PlayMode = 'loop' | 'single' | 'shuffle'

export type QueueTrack = TrackDto & {
  localPath?: string
  /** 网页端选中的 File（试听用，比 blob URL 更稳） */
  previewFile?: File
  previewUrl?: string
}

function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (Array.isArray(data)) return new Uint8Array(data)
  if (data && typeof data === 'object' && Array.isArray((data as { data?: number[] }).data)) {
    return new Uint8Array((data as { data: number[] }).data)
  }
  throw new Error('无法读取音频数据')
}

function mimeFromName(name: string, fallback = 'audio/mpeg') {
  const ext = name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'wav':
      return 'audio/wav'
    case 'flac':
      return 'audio/flac'
    case 'm4a':
      return 'audio/mp4'
    case 'aac':
      return 'audio/aac'
    case 'mp3':
      return 'audio/mpeg'
    default:
      return fallback
  }
}

async function safePlay(audio: HTMLAudioElement) {
  try {
    await audio.play()
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'NotAllowedError')) {
      return
    }
    throw e
  }
}

export const usePlayerStore = defineStore('player', {
  state: () => ({
    queue: [] as QueueTrack[],
    currentIndex: -1,
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: Number(localStorage.getItem('volume') ?? 0.8),
    mode: 'loop' as PlayMode,
    audio: null as HTMLAudioElement | null,
    objectUrl: '' as string,
    loading: false,
    seeking: false,
    playToken: 0,
  }),
  getters: {
    currentTrack(state): QueueTrack | null {
      if (state.currentIndex < 0) return null
      return state.queue[state.currentIndex] || null
    },
  },
  actions: {
    ensureAudio() {
      if (this.audio) return this.audio
      const audio = new Audio()
      audio.preload = 'auto'
      audio.volume = this.volume
      audio.addEventListener('timeupdate', () => {
        if (!this.seeking) this.currentTime = audio.currentTime
      })
      audio.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          this.duration = audio.duration
        }
      })
      audio.addEventListener('durationchange', () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          this.duration = audio.duration
        }
      })
      audio.addEventListener('seeked', () => {
        this.currentTime = audio.currentTime
        this.seeking = false
      })
      audio.addEventListener('ended', () => this.onEnded())
      audio.addEventListener('play', () => {
        this.playing = true
      })
      audio.addEventListener('pause', () => {
        this.playing = false
      })
      this.audio = audio
      return audio
    },

    revokeObjectUrl() {
      if (this.objectUrl) {
        URL.revokeObjectURL(this.objectUrl)
        this.objectUrl = ''
      }
    },

    resetAudioElement(audio: HTMLAudioElement) {
      audio.pause()
      audio.removeAttribute('src')
      // 清空缓冲区，避免旧 error 事件干扰下一次播放
      try {
        audio.load()
      } catch {
        // ignore
      }
    },

    async buildPlayableUrl(track: QueueTrack): Promise<string> {
      // 1) 网页 File 试听：强制正确 MIME，避免 .MP3 type 为空导致 NotSupportedError
      if (track.previewFile) {
        const buf = await track.previewFile.arrayBuffer()
        const type =
          track.previewFile.type && track.previewFile.type.startsWith('audio/')
            ? track.previewFile.type
            : mimeFromName(track.previewFile.name)
        const blob = new Blob([buf], { type })
        this.objectUrl = URL.createObjectURL(blob)
        return this.objectUrl
      }

      // 2) 已有预览 URL（兼容）
      if (track.previewUrl) {
        return track.previewUrl
      }

      // 3) Electron 本地路径
      if (track.localPath) {
        if (!window.wyAPI?.readFileForUpload) {
          throw new Error('本地播放需要 Electron 环境')
        }
        const file = await window.wyAPI.readFileForUpload(track.localPath)
        const bytes = toUint8Array(file.data)
        const copy = new Uint8Array(bytes.byteLength)
        copy.set(bytes)
        const type = file.mimeType?.startsWith('audio/')
          ? file.mimeType
          : mimeFromName(file.fileName)
        const blob = new Blob([copy], { type })
        this.objectUrl = URL.createObjectURL(blob)
        return this.objectUrl
      }

      // 4) 曲库：先拉成 blob（可 seek）；失败则直链
      const url = streamUrl(track.id)
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`获取音频失败 HTTP ${res.status}`)
      }
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      if (ct.includes('application/json') || ct.includes('text/')) {
        let msg = '音频接口返回异常'
        try {
          const j = await res.json()
          msg = j.message || msg
        } catch {
          // ignore
        }
        throw new Error(msg)
      }
      const buf = await res.arrayBuffer()
      if (!buf.byteLength) {
        throw new Error('音频内容为空')
      }
      const type = ct.startsWith('audio/') ? ct.split(';')[0] : 'audio/mpeg'
      const blob = new Blob([buf], { type })
      this.objectUrl = URL.createObjectURL(blob)
      return this.objectUrl
    },

    setQueue(tracks: QueueTrack[], startIndex = 0) {
      this.queue = tracks
      this.currentIndex = startIndex
      void this.playCurrent()
    },

    playAt(index: number) {
      if (index < 0 || index >= this.queue.length) return
      this.currentIndex = index
      void this.playCurrent()
    },

    playTrack(track: QueueTrack, queue?: QueueTrack[]) {
      if (queue) this.queue = queue
      const idx = this.queue.findIndex((t) => t.id === track.id)
      if (idx >= 0) {
        this.currentIndex = idx
      } else {
        this.queue.push(track)
        this.currentIndex = this.queue.length - 1
      }
      void this.playCurrent()
    },

    async playCurrent() {
      const track = this.currentTrack
      if (!track) return

      const token = ++this.playToken
      const audio = this.ensureAudio()
      this.loading = true
      this.seeking = false
      this.currentTime = 0
      this.duration = track.durationMs > 0 ? track.durationMs / 1000 : 0

      try {
        this.revokeObjectUrl()
        this.resetAudioElement(audio)

        const src = await this.buildPlayableUrl(track)
        if (token !== this.playToken) return

        audio.src = src
        // 等元数据就绪再 play，比 canplay+error 监听更稳
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            cleanup()
            // 超时仍尝试播放（部分环境不触发 loadeddata）
            resolve()
          }, 8000)
          const onReady = () => {
            cleanup()
            resolve()
          }
          const onError = () => {
            cleanup()
            const mediaErr = audio.error
            const detail = mediaErr
              ? `code=${mediaErr.code}`
              : 'unknown'
            reject(new Error(`音频加载失败（${detail}）`))
          }
          const cleanup = () => {
            window.clearTimeout(timer)
            audio.removeEventListener('loadeddata', onReady)
            audio.removeEventListener('canplay', onReady)
            audio.removeEventListener('error', onError)
          }
          audio.addEventListener('loadeddata', onReady, { once: true })
          audio.addEventListener('canplay', onReady, { once: true })
          audio.addEventListener('error', onError, { once: true })
        })

        if (token !== this.playToken) return
        await safePlay(audio)
        if (token !== this.playToken) return

        this.playing = true
        if (
          !track.localPath &&
          !track.previewFile &&
          !track.previewUrl &&
          !track.id.startsWith('local:') &&
          !track.id.startsWith('webfile:')
        ) {
          void http.post('/api/history', { trackId: track.id }).catch(() => undefined)
        }
      } catch (e) {
        if (token !== this.playToken) return
        this.playing = false
        console.error('[playCurrent]', e)
      } finally {
        if (token === this.playToken) this.loading = false
      }
    },

    toggle() {
      const audio = this.ensureAudio()
      if (!this.currentTrack) return
      if (!audio.src) {
        void this.playCurrent()
        return
      }
      if (audio.paused) {
        void safePlay(audio).then(() => {
          // 若源已失效，整曲重载
          if (audio.error) void this.playCurrent()
        })
      } else {
        audio.pause()
      }
    },

    clearIfPreview(previewUrl?: string) {
      const cur = this.currentTrack
      if (!cur?.previewFile && !cur?.previewUrl) return
      if (previewUrl && cur.previewUrl && cur.previewUrl !== previewUrl) return
      const audio = this.ensureAudio()
      this.revokeObjectUrl()
      this.resetAudioElement(audio)
      this.queue = []
      this.currentIndex = -1
      this.playing = false
      this.currentTime = 0
      this.duration = 0
      this.playToken++
    },

    playUploadedTrack(track: TrackDto) {
      this.clearIfPreview()
      this.playTrack({ ...track }, [track])
    },

    /** 下一首播放：插入到当前曲目之后 */
    playNext(track: QueueTrack) {
      if (!this.queue.length || this.currentIndex < 0) {
        this.playTrack(track, [track])
        return
      }
      const exists = this.queue.findIndex((t) => t.id === track.id)
      if (exists === this.currentIndex) return
      if (exists >= 0) {
        this.queue.splice(exists, 1)
        if (exists < this.currentIndex) this.currentIndex -= 1
      }
      this.queue.splice(this.currentIndex + 1, 0, track)
    },

    seek(time: number) {
      const audio = this.ensureAudio()
      if (!Number.isFinite(time) || time < 0 || !audio.src) return
      const max =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : this.duration > 0
            ? this.duration
            : time
      const next = Math.min(Math.max(0, time), max)
      this.seeking = true
      this.currentTime = next
      try {
        audio.currentTime = next
        window.setTimeout(() => {
          if (this.seeking) {
            this.currentTime = audio.currentTime
            this.seeking = false
          }
        }, 300)
      } catch (e) {
        this.seeking = false
        console.error('[seek] failed', e)
      }
    },

    setVolume(v: number) {
      this.volume = v
      localStorage.setItem('volume', String(v))
      this.ensureAudio().volume = v
    },

    next() {
      if (!this.queue.length) return
      if (this.mode === 'shuffle') {
        this.currentIndex = Math.floor(Math.random() * this.queue.length)
      } else {
        this.currentIndex = (this.currentIndex + 1) % this.queue.length
      }
      void this.playCurrent()
    },

    prev() {
      if (!this.queue.length) return
      this.currentIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length
      void this.playCurrent()
    },

    onEnded() {
      if (this.mode === 'single') {
        void this.playCurrent()
        return
      }
      this.next()
    },

    cycleMode() {
      const modes: PlayMode[] = ['loop', 'single', 'shuffle']
      const i = modes.indexOf(this.mode)
      this.mode = modes[(i + 1) % modes.length]
    },
  },
})
