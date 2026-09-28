<template>
  <Teleport to="body">
    <Transition name="msg-fade">
      <div v-if="visible" class="msg-mask" @mousedown.self="emit('close')">
        <aside class="msg-panel" @mousedown.stop>
          <div class="msg-tabs">
            <button
              v-for="t in tabs"
              :key="t.key"
              type="button"
              class="msg-tab"
              :class="{ active: channel === t.key }"
              @click="switchChannel(t.key)"
            >
              {{ t.label }}
              <span v-if="unreadByChannel[t.key]" class="tab-dot" />
            </button>
            <button type="button" class="read-all" @click="markAllRead">一键已读</button>
          </div>

          <div v-loading="loading" class="msg-list">
            <button
              v-for="item in list"
              :key="item.id"
              type="button"
              class="msg-item"
              :class="{ unread: !item.read }"
              @click="onItemClick(item)"
            >
              <div class="avatar" :style="avatarStyle(item)">
                <span v-if="!item.actorAvatarUrl">{{ avatarLetter(item) }}</span>
              </div>
              <div class="meta">
                <div class="row-top">
                  <span class="name">{{ displayName(item) }}</span>
                  <span class="time">{{ formatTime(item.createdAt) }}</span>
                </div>
                <div class="preview">{{ item.body }}</div>
              </div>
              <span v-if="!item.read" class="unread-dot" />
            </button>

            <el-empty
              v-if="!loading && !list.length"
              :description="emptyText"
              :image-size="72"
            />
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { UserNotificationDto } from '@wy-music/shared'
import { http, mediaUrl } from '../services/http'

type Channel = 'dm' | 'comment' | 'mention' | 'notice'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  changed: []
}>()

const router = useRouter()

const tabs: { key: Channel; label: string }[] = [
  { key: 'dm', label: '私信' },
  { key: 'comment', label: '评论' },
  { key: 'mention', label: '@我' },
  { key: 'notice', label: '通知' },
]

const channel = ref<Channel>('dm')
const loading = ref(false)
const list = ref<UserNotificationDto[]>([])
const unreadByChannel = ref<Record<string, number>>({
  dm: 0,
  comment: 0,
  mention: 0,
  notice: 0,
})

const emptyText = computed(() => {
  const map: Record<Channel, string> = {
    dm: '暂无私信',
    comment: '暂无评论消息',
    mention: '暂无@消息',
    notice: '暂无通知',
  }
  return map[channel.value]
})

function displayName(item: UserNotificationDto) {
  return item.actorNickname || item.title || '系统通知'
}

function avatarLetter(item: UserNotificationDto) {
  return displayName(item).slice(0, 1)
}

function avatarStyle(item: UserNotificationDto) {
  const url = mediaUrl(item.actorAvatarUrl)
  if (url) return { backgroundImage: `url(${url})` }
  return {}
}

function formatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) return hm
  const yest = new Date(now)
  yest.setDate(now.getDate() - 1)
  const isYest =
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  if (isYest) return `昨天 ${hm}`
  if (d.getFullYear() === now.getFullYear()) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function loadUnread() {
  try {
    const { data } = await http.get('/api/notifications/unread-count')
    unreadByChannel.value = {
      dm: 0,
      comment: 0,
      mention: 0,
      notice: 0,
      ...(data.data?.byChannel || {}),
    }
  } catch {
    // ignore
  }
}

async function loadList() {
  loading.value = true
  try {
    const { data } = await http.get('/api/notifications', {
      params: { channel: channel.value, pageSize: 40 },
    })
    list.value = data.data?.list || []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

async function refresh() {
  await Promise.all([loadUnread(), loadList()])
  emit('changed')
}

function switchChannel(key: Channel) {
  channel.value = key
}

async function markAllRead() {
  try {
    await http.post('/api/notifications/read', {
      readAll: true,
      channel: channel.value,
    })
    list.value = list.value.map((i) => ({ ...i, read: true }))
    unreadByChannel.value[channel.value] = 0
    emit('changed')
  } catch {
    // ignore
  }
}

async function onItemClick(item: UserNotificationDto) {
  if (!item.read) {
    try {
      await http.post('/api/notifications/read', { ids: [item.id] })
      item.read = true
      const ch = item.channel || channel.value
      unreadByChannel.value[ch] = Math.max(0, (unreadByChannel.value[ch] || 1) - 1)
      emit('changed')
    } catch {
      // ignore
    }
  }

  emit('close')
  if (item.trackId) {
    if (item.type === 'comment_reply' || item.type === 'comment_on_track' || item.type === 'mention') {
      router.push(`/comment/${item.trackId}`)
      return
    }
    router.push(`/search?keyword=${encodeURIComponent(item.trackName || '')}`)
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) void refresh()
  },
)

watch(channel, () => {
  if (props.visible) void loadList()
})

defineExpose({ refresh, loadUnread })
</script>

<style scoped lang="scss">
.msg-mask {
  position: fixed;
  inset: 0;
  z-index: 2100;
  background: transparent;
}
.msg-panel {
  position: absolute;
  top: 54px;
  right: 12px;
  width: 360px;
  max-width: calc(100vw - 24px);
  height: min(560px, calc(100vh - 90px));
  background: rgba(248, 248, 250, 0.96);
  backdrop-filter: blur(16px);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.msg-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 12px 12px 8px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.msg-tab {
  position: relative;
  border: none;
  background: transparent;
  color: #666;
  font-size: 13px;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  &.active {
    color: #ec4141;
    font-weight: 700;
  }
  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
}
.tab-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ec4141;
}
.read-all {
  margin-left: auto;
  border: none;
  background: transparent;
  color: #999;
  font-size: 12px;
  cursor: pointer;
  padding: 4px 6px;
  &:hover {
    color: #666;
  }
}
.msg-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 0 8px;
}
.msg-item {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
  position: relative;
  &:hover {
    background: rgba(255, 255, 255, 0.7);
  }
  &.unread .name {
    font-weight: 700;
  }
}
.avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  flex-shrink: 0;
  background: linear-gradient(135deg, #ff8a80, #ec4141);
  background-size: cover;
  background-position: center;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 700;
}
.meta {
  flex: 1;
  min-width: 0;
}
.row-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: #222;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.time {
  flex-shrink: 0;
  font-size: 11px;
  color: #aaa;
}
.preview {
  margin-top: 4px;
  font-size: 12px;
  color: #888;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.unread-dot {
  position: absolute;
  right: 14px;
  top: 50%;
  width: 8px;
  height: 8px;
  margin-top: -4px;
  border-radius: 50%;
  background: #ec4141;
}
.msg-fade-enter-active,
.msg-fade-leave-active {
  transition: opacity 0.15s ease;
}
.msg-fade-enter-from,
.msg-fade-leave-to {
  opacity: 0;
}
.msg-fade-enter-active .msg-panel,
.msg-fade-leave-active .msg-panel {
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.msg-fade-enter-from .msg-panel,
.msg-fade-leave-to .msg-panel {
  transform: translateY(-6px);
  opacity: 0;
}
</style>
