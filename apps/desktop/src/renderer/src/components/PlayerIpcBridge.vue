<template>
  <!-- 主窗口播放器 IPC 桥：向桌面小组件同步状态，并接收控制指令 -->
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../stores/player'
import { http } from '../services/http'

const player = usePlayerStore()
const { currentTrack, playing, currentTime, duration } = storeToRefs(player)

const lyricCache = ref<{ id: string; text: string } | null>(null)
let lyricLoadingId = ''

async function ensureLyric() {
  const t = currentTrack.value
  if (!t) {
    lyricCache.value = null
    return
  }
  if (t.lyricText) {
    lyricCache.value = { id: t.id, text: t.lyricText }
    return
  }
  if (lyricCache.value?.id === t.id) return
  if (t.id.startsWith('local:') || t.id.startsWith('webfile:')) {
    lyricCache.value = { id: t.id, text: '' }
    return
  }
  if (lyricLoadingId === t.id) return
  lyricLoadingId = t.id
  try {
    const { data } = await http.get(`/api/tracks/${t.id}/lyric`)
    if (currentTrack.value?.id === t.id) {
      lyricCache.value = { id: t.id, text: data.data?.lyricText || '' }
    }
  } catch {
    if (currentTrack.value?.id === t.id) {
      lyricCache.value = { id: t.id, text: '' }
    }
  } finally {
    if (lyricLoadingId === t.id) lyricLoadingId = ''
  }
}

function pushState() {
  if (!window.wyAPI?.pushPlayerState) return
  const t = currentTrack.value
  const lyricText =
    t && lyricCache.value?.id === t.id
      ? lyricCache.value.text
      : t?.lyricText || ''
  window.wyAPI.pushPlayerState({
    name: t?.name || '',
    artists: t?.artists?.join(' / ') || '',
    coverUrl: t?.coverUrl || '',
    playing: playing.value,
    currentTime: currentTime.value,
    duration:
      duration.value > 0
        ? duration.value
        : t?.durationMs
          ? t.durationMs / 1000
          : 0,
    hasTrack: Boolean(t),
    trackId: t?.id || '',
    lyricText,
  })
}

function onCommand(cmd: { type: string; time?: number }) {
  switch (cmd.type) {
    case 'toggle':
      void player.toggle()
      break
    case 'prev':
      player.prev()
      break
    case 'next':
      player.next()
      break
    case 'seek':
      if (typeof cmd.time === 'number') player.seek(cmd.time)
      break
    case 'openMain':
      void window.wyAPI?.focusMainWindow?.()
      break
    default:
      break
  }
}

let unsub: (() => void) | undefined
let timer: number | undefined

onMounted(() => {
  unsub = window.wyAPI?.onPlayerCommand?.(onCommand)
  void ensureLyric().then(pushState)
  timer = window.setInterval(pushState, 400)
})

onUnmounted(() => {
  unsub?.()
  if (timer) window.clearInterval(timer)
})

watch(currentTrack, () => {
  void ensureLyric().then(pushState)
})

watch([playing, currentTime, duration, lyricCache], pushState, { deep: true })
</script>
