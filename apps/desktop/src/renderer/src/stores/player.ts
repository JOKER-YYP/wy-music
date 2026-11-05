import { defineStore } from 'pinia'
import type { MusicSource, TrackDto } from '@wy-music/shared'
import { isExternalTrackId, parseExternalTrackId } from '@wy-music/shared'
import { http, streamUrl } from '../services/http'
import {
  clearPlayerSession,
  isRememberPlaybackEnabled,
  loadPlayerSession,
  savePlayerSession,
} from '../services/playerSession'

type PlayMode = 'order' | 'loop' | 'single' | 'shuffle'

export type QueueTrack = TrackDto & {
  localPath?: string
  /** 网页端选中的 File（试听用，比 blob URL 更稳） */
  previewFile?: File
  previewUrl?: string
}

async function resolveExternalPlay(track: QueueTrack): Promise<string> {
  const parsed =
    parseExternalTrackId(track.id) ||
    (track.source &&
    track.source !== 'local' &&
    track.externalId
      ? { source: track.source as MusicSource, externalId: track.externalId }
      : null)
  if (!parsed) throw new Error('无法识别外部曲目')

  // 与皮卡丘音乐站一致：前端直连详情接口
  const { resolveExternalDetail } = await import('../services/externalMusic')
  const detail = await resolveExternalDetail(parsed.source, parsed.externalId)
  const musicUrl = detail?.musicUrl
  if (!musicUrl) throw new Error('未获取到播放地址')

  track.previewUrl = musicUrl
  if (detail.coverUrl) track.coverUrl = detail.coverUrl
  if (detail.lyricText) track.lyricText = detail.lyricText
  if (detail.name) track.name = detail.name
  if (detail.artists?.length) track.artists = detail.artists
  if (detail.album != null) track.album = detail.album
  return musicUrl
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

/** 播放/暂停音量淡入淡出（短程，避免硬切） */
let volumeFadeRaf = 0
let volumeFadeToken = 0

function cancelVolumeFade() {
  if (volumeFadeRaf) {
    cancelAnimationFrame(volumeFadeRaf)
    volumeFadeRaf = 0
  }
  volumeFadeToken += 1
}

function rampVolume(audio: HTMLAudioElement, target: number, ms: number): Promise<void> {
  cancelVolumeFade()
  const start = audio.volume
  const clamped = Math.min(1, Math.max(0, target))
  if (ms <= 0 || Math.abs(start - clamped) < 0.008) {
    audio.volume = clamped
    return Promise.resolve()
  }
  const token = volumeFadeToken
  const t0 = performance.now()
  return new Promise((resolve) => {
    const step = (now: number) => {
      if (token !== volumeFadeToken) {
        resolve()
        return
      }
      const p = Math.min(1, (now - t0) / ms)
      const eased = 1 - (1 - p) * (1 - p)
      audio.volume = start + (clamped - start) * eased
      if (p < 1) {
        volumeFadeRaf = requestAnimationFrame(step)
      } else {
        audio.volume = clamped
        volumeFadeRaf = 0
        resolve()
      }
    }
    volumeFadeRaf = requestAnimationFrame(step)
  })
}

let persistTimer: number | null = null
let lastProgressPersistAt = 0
let sessionRestored = false
let unloadBound = false

function bindUnloadPersist(getSnap: () => void) {
  if (unloadBound || typeof window === 'undefined') return
  unloadBound = true
  const flush = () => getSnap()
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}

export const usePlayerStore = defineStore('player', {
  state: () => ({
    queue: [] as QueueTrack[],
    currentIndex: -1,
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: Number(localStorage.getItem('volume') ?? 0.8),
    mode: 'order' as PlayMode,
    audio: null as HTMLAudioElement | null,
    objectUrl: '' as string,
    loading: false,
    seeking: false,
    playToken: 0,
    /** 「下一首播放」优先队列：不改动 queue 排序，任意模式下优先于 mode 跳转 */
    nextPlayQueue: [] as QueueTrack[],
    /** 是否已从本地恢复过会话（避免重复 restore） */
    sessionReady: false,
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
        const now = Date.now()
        if (now - lastProgressPersistAt >= 2000) {
          lastProgressPersistAt = now
          this.persistSession(true)
        }
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
        this.persistSession(true)
      })
      this.audio = audio
      bindUnloadPersist(() => this.persistSession(true))
      return audio
    },

    persistSession(immediate = false) {
      if (!isRememberPlaybackEnabled()) return
      const write = () => {
        if (!this.queue.length || this.currentIndex < 0) {
          clearPlayerSession()
          return
        }
        savePlayerSession({
          queue: this.queue,
          nextPlayQueue: this.nextPlayQueue,
          currentIndex: this.currentIndex,
          currentTime: this.currentTime,
          mode: this.mode,
        })
      }
      if (immediate) {
        if (persistTimer != null) {
          window.clearTimeout(persistTimer)
          persistTimer = null
        }
        write()
        return
      }
      if (persistTimer != null) window.clearTimeout(persistTimer)
      persistTimer = window.setTimeout(() => {
        persistTimer = null
        write()
      }, 350)
    },

    /** 启动时恢复队列与进度（不自动播放，遵守浏览器策略） */
    async restoreSession() {
      if (sessionRestored) {
        this.sessionReady = true
        return
      }
      sessionRestored = true
      if (!isRememberPlaybackEnabled()) {
        this.sessionReady = true
        return
      }
      const snap = loadPlayerSession()
      if (!snap) {
        this.sessionReady = true
        return
      }
      this.queue = snap.queue
      this.nextPlayQueue = snap.nextPlayQueue
      this.currentIndex = snap.currentIndex
      this.mode = snap.mode
      this.currentTime = snap.currentTime
      this.sessionReady = true
      try {
        await this.playCurrent({ autoplay: false, seekTo: snap.currentTime })
      } catch (e) {
        console.warn('[restoreSession]', e)
      }
    },

    clearSessionMemory() {
      clearPlayerSession()
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

      // 2) 已有预览 URL（兼容 / 外部源已解析）
      if (track.previewUrl) {
        return track.previewUrl
      }

      // 2.5) 外部多源搜索结果：点播时再解析播放链
      if (
        isExternalTrackId(track.id) ||
        (track.source && track.source !== 'local')
      ) {
        return resolveExternalPlay(track)
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
      this.nextPlayQueue = []
      this.currentIndex = startIndex
      this.persistSession()
      void this.playCurrent()
    },

    playAt(index: number) {
      if (index < 0 || index >= this.queue.length) return
      this.currentIndex = index
      this.persistSession()
      void this.playCurrent()
    },

    playTrack(track: QueueTrack, queue?: QueueTrack[]) {
      if (queue) {
        this.queue = queue
        this.nextPlayQueue = []
      }
      const idx = this.queue.findIndex((t) => t.id === track.id)
      if (idx >= 0) {
        this.currentIndex = idx
      } else {
        this.queue.push(track)
        this.currentIndex = this.queue.length - 1
      }
      this.persistSession()
      void this.playCurrent()
    },

    async playCurrent(opts?: { autoplay?: boolean; seekTo?: number }) {
      const track = this.currentTrack
      if (!track) return

      const autoplay = opts?.autoplay !== false
      const seekTo = opts?.seekTo
      const token = ++this.playToken
      const audio = this.ensureAudio()
      this.loading = true
      this.seeking = false
      this.currentTime = seekTo && seekTo > 0 ? seekTo : 0
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

        if (seekTo != null && seekTo > 0 && Number.isFinite(seekTo)) {
          try {
            const max =
              Number.isFinite(audio.duration) && audio.duration > 0
                ? Math.max(0, audio.duration - 0.35)
                : seekTo
            audio.currentTime = Math.min(seekTo, max)
            this.currentTime = audio.currentTime
          } catch {
            /* ignore seek failure */
          }
        }

        if (!autoplay) {
          audio.pause()
          audio.volume = this.volume
          this.playing = false
          this.persistSession(true)
          return
        }

        audio.volume = 0
        await safePlay(audio)
        if (token !== this.playToken) return
        void rampVolume(audio, this.volume, 220)

        this.playing = true
        this.persistSession()
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

    async toggle() {
      const audio = this.ensureAudio()
      if (!this.currentTrack) return
      if (!audio.src) {
        void this.playCurrent()
        return
      }
      if (audio.paused) {
        audio.volume = 0
        await safePlay(audio)
        // 若源已失效，整曲重载
        if (audio.error) {
          void this.playCurrent()
          return
        }
        void rampVolume(audio, this.volume, 180)
      } else {
        await rampVolume(audio, 0, 140)
        audio.pause()
        audio.volume = this.volume
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
      this.nextPlayQueue = []
      this.currentIndex = -1
      this.playing = false
      this.currentTime = 0
      this.duration = 0
      this.playToken++
      clearPlayerSession()
    },

    playUploadedTrack(track: TrackDto) {
      this.clearIfPreview()
      this.playTrack({ ...track }, [track])
    },

    /** 清空播放列表并停止 */
    clearQueue() {
      const audio = this.ensureAudio()
      this.revokeObjectUrl()
      this.resetAudioElement(audio)
      this.queue = []
      this.nextPlayQueue = []
      this.currentIndex = -1
      this.playing = false
      this.currentTime = 0
      this.duration = 0
      this.playToken++
      clearPlayerSession()
    },

    /**
     * 下一首播放：记入优先队列，不改变播放列表排序。
     * 任意播放模式（含随机）下，切歌/播完都会优先走该队列。
     */
    playNext(track: QueueTrack) {
      if (!this.queue.length || this.currentIndex < 0) {
        this.playTrack(track, [track])
        return
      }
      if (track.id === this.currentTrack?.id) return

      // 列表中没有则追加到末尾（不移动已有曲目）
      if (!this.queue.some((t) => t.id === track.id)) {
        this.queue.push({ ...track })
      }

      // 已在「下一首」队列中则挪到队尾，保证最近一次指定的稍后播
      const pending = this.nextPlayQueue.findIndex((t) => t.id === track.id)
      if (pending >= 0) this.nextPlayQueue.splice(pending, 1)
      this.nextPlayQueue.push({ ...track })
      this.persistSession()
    },

    /** 消费一条「下一首播放」；成功则已开始播放并返回 true */
    consumeNextPlay(): boolean {
      while (this.nextPlayQueue.length) {
        const track = this.nextPlayQueue.shift()!
        if (track.id === this.currentTrack?.id) continue
        let idx = this.queue.findIndex((t) => t.id === track.id)
        if (idx < 0) {
          this.queue.push({ ...track })
          idx = this.queue.length - 1
        }
        this.currentIndex = idx
        void this.playCurrent()
        return true
      }
      return false
    },

    /** 追加到播放列表末尾（不自动播放） */
    appendToQueue(tracks: QueueTrack[]) {
      if (!tracks.length) return 0
      let added = 0
      for (const t of tracks) {
        if (this.queue.some((q) => q.id === t.id)) continue
        this.queue.push({ ...t })
        added += 1
      }
      if (!this.queue.length) return 0
      if (this.currentIndex < 0) this.currentIndex = 0
      this.persistSession()
      return added
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
            this.persistSession(true)
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
      cancelVolumeFade()
      this.ensureAudio().volume = v
    },

    next() {
      if (!this.queue.length) return
      // 优先「下一首播放」，不受随机/顺序/循环影响
      if (this.consumeNextPlay()) return

      if (this.mode === 'shuffle') {
        this.currentIndex = Math.floor(Math.random() * this.queue.length)
      } else if (this.mode === 'order') {
        if (this.currentIndex >= this.queue.length - 1) {
          this.playing = false
          const audio = this.ensureAudio()
          audio.pause()
          audio.currentTime = 0
          this.currentTime = 0
          this.persistSession(true)
          return
        }
        this.currentIndex += 1
      } else {
        this.currentIndex = (this.currentIndex + 1) % this.queue.length
      }
      this.persistSession()
      void this.playCurrent()
    },

    prev() {
      if (!this.queue.length) return
      if (this.mode === 'order') {
        this.currentIndex = Math.max(0, this.currentIndex - 1)
      } else {
        this.currentIndex = (this.currentIndex - 1 + this.queue.length) % this.queue.length
      }
      this.persistSession()
      void this.playCurrent()
    },

    onEnded() {
      // 有「下一首播放」时，单曲循环也先让出
      if (this.nextPlayQueue.length) {
        this.next()
        return
      }
      if (this.mode === 'single') {
        void this.playCurrent()
        return
      }
      this.next()
    },

    cycleMode() {
      const modes: PlayMode[] = ['order', 'loop', 'single', 'shuffle']
      const i = modes.indexOf(this.mode)
      this.mode = modes[(i + 1) % modes.length]
      this.persistSession(true)
    },
  },
})
