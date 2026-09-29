<template>
  <Teleport to="body">
    <Transition name="msg-fade">
      <div v-if="visible" class="msg-mask" @mousedown.self="emit('close')">
        <aside class="msg-panel" @mousedown.stop>
          <!-- 会话聊天 -->
          <template v-if="chat">
            <div class="chat-head">
              <button type="button" class="back-btn" title="返回" @click="closeChat">
                <el-icon :size="16"><ArrowLeft /></el-icon>
              </button>
              <span class="chat-title">{{ chat.name }}</span>
            </div>

            <div ref="chatScrollRef" class="chat-body">
              <template v-for="(msg, idx) in chat.messages" :key="msg.id">
                <div v-if="showTimeLabel(chat.messages, idx)" class="chat-time">
                  {{ formatChatTime(msg.createdAt) }}
                </div>
                <div class="chat-row" :class="{ mine: isMine(msg) }">
                  <div v-if="!isMine(msg)" class="avatar sm" :style="avatarStyle(msg)">
                    <span v-if="!msg.actorAvatarUrl">{{ avatarLetter(msg) }}</span>
                  </div>
                  <div class="bubble-col">
                    <div v-if="msg.body" class="bubble">{{ msg.body }}</div>
                    <button
                      v-if="msg.trackId"
                      type="button"
                      class="song-card"
                      @click="playTrackCard(msg)"
                    >
                      <div class="song-cover" :style="trackCoverStyle(msg.trackId)" />
                      <div class="song-meta">
                        <div class="song-name">
                          {{ trackMap[msg.trackId!]?.name || msg.trackName || '歌曲' }}
                          <span v-if="msg.type === 'artist_new_track'" class="song-tag">新歌</span>
                        </div>
                        <div class="song-artist">
                          {{
                            trackMap[msg.trackId!]?.artists?.join(' / ') ||
                            msg.actorNickname ||
                            chat.name
                          }}
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              </template>
              <el-empty
                v-if="!chat.messages.length"
                description="暂无消息"
                :image-size="64"
              />
            </div>

            <div class="chat-input">
              <textarea
                v-model="draft"
                class="chat-textarea"
                maxlength="1000"
                placeholder="说点什么吧"
                rows="3"
                @keydown.enter.exact.prevent="sendDm"
              />
              <div class="chat-input-bar">
                <span class="limit">{{ 1000 - draft.length }}</span>
                <div class="input-actions">
                  <el-icon class="muted-icon" :size="18"><Picture /></el-icon>
                  <button
                    type="button"
                    class="send-btn"
                    :disabled="!draft.trim() || sending"
                    @click="sendDm"
                  >
                    发送
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- 列表 -->
          <template v-else>
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
              <!-- 私信：会话聚合 -->
              <template v-if="channel === 'dm'">
                <button
                  v-for="c in conversations"
                  :key="c.key"
                  type="button"
                  class="msg-item"
                  :class="{ unread: c.unread > 0 }"
                  @click="openChat(c)"
                >
                  <div class="avatar" :style="convoAvatarStyle(c)">
                    <span v-if="!c.avatarUrl">{{ c.name.slice(0, 1) }}</span>
                  </div>
                  <div class="meta">
                    <div class="row-top">
                      <span class="name">{{ c.name }}</span>
                      <span class="time">{{ formatTime(c.last.createdAt) }}</span>
                    </div>
                    <div class="preview">{{ c.last.body }}</div>
                  </div>
                  <span v-if="c.unread > 0" class="unread-dot" />
                </button>
                <el-empty
                  v-if="!loading && !conversations.length"
                  description="暂无私信"
                  :image-size="72"
                />
              </template>

              <!-- 其它频道：扁平列表 -->
              <template v-else>
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
              </template>
            </div>
          </template>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Picture } from '@element-plus/icons-vue'
import type { TrackDto, UserNotificationDto } from '@wy-music/shared'
import { http, mediaUrl } from '../services/http'
import { usePlayerStore } from '../stores/player'

type Channel = 'dm' | 'comment' | 'mention' | 'notice'

type Conversation = {
  key: string
  name: string
  avatarUrl?: string | null
  last: UserNotificationDto
  unread: number
  messages: UserNotificationDto[]
}

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  changed: []
}>()

const router = useRouter()
const player = usePlayerStore()

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

const chat = ref<Conversation | null>(null)
const draft = ref('')
const sending = ref(false)
const chatScrollRef = ref<HTMLElement | null>(null)
const trackMap = ref<Record<string, TrackDto>>({})

const emptyText = computed(() => {
  const map: Record<Channel, string> = {
    dm: '暂无私信',
    comment: '暂无评论消息',
    mention: '暂无@消息',
    notice: '暂无通知',
  }
  return map[channel.value]
})

const conversations = computed(() => {
  const map = new Map<string, Conversation>()
  // 按时间正序塞消息，再倒序排会话
  const sorted = [...list.value].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
  for (const item of sorted) {
    const name = displayName(item)
    const key = name
    const cur = map.get(key)
    if (!cur) {
      map.set(key, {
        key,
        name,
        avatarUrl: item.actorAvatarUrl,
        last: item,
        unread: item.read || item.type === 'dm_out' ? 0 : 1,
        messages: [item],
      })
    } else {
      cur.messages.push(item)
      cur.last = item
      if (!item.read && item.type !== 'dm_out') cur.unread += 1
      if (!cur.avatarUrl && item.actorAvatarUrl) cur.avatarUrl = item.actorAvatarUrl
    }
  }
  return [...map.values()].sort(
    (a, b) => new Date(b.last.createdAt).getTime() - new Date(a.last.createdAt).getTime(),
  )
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

function convoAvatarStyle(c: Conversation) {
  const url = mediaUrl(c.avatarUrl)
  if (url) return { backgroundImage: `url(${url})` }
  return {}
}

function isMine(msg: UserNotificationDto) {
  return msg.type === 'dm_out'
}

function trackCoverStyle(trackId: string) {
  const url = mediaUrl(trackMap.value[trackId]?.coverUrl)
  if (url) return { backgroundImage: `url(${url})` }
  return { backgroundImage: 'linear-gradient(135deg,#ec4141,#ff8a80)' }
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
  if (
    d.getFullYear() === yest.getFullYear() &&
    d.getMonth() === yest.getMonth() &&
    d.getDate() === yest.getDate()
  ) {
    return `昨天 ${hm}`
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatChatTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function showTimeLabel(messages: UserNotificationDto[], idx: number) {
  if (idx === 0) return true
  const prev = new Date(messages[idx - 1].createdAt).getTime()
  const cur = new Date(messages[idx].createdAt).getTime()
  return cur - prev > 5 * 60 * 1000
}

async function loadUnread() {
  try {
    const { data } = await http.get('/api/notifications/unread-count', { silent: true })
    unreadByChannel.value = {
      dm: 0,
      comment: 0,
      mention: 0,
      notice: 0,
      ...(data.data?.byChannel || {}),
    }
  } catch {
    unreadByChannel.value = { dm: 0, comment: 0, mention: 0, notice: 0 }
  }
}

async function loadList() {
  loading.value = true
  try {
    const { data } = await http.get('/api/notifications', {
      params: { channel: channel.value, pageSize: 80 },
      silent: true,
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
  chat.value = null
  channel.value = key
}

async function markAllRead() {
  try {
    await http.post(
      '/api/notifications/read',
      { readAll: true, channel: channel.value },
      { silent: true },
    )
    list.value = list.value.map((i) => ({ ...i, read: true }))
    unreadByChannel.value[channel.value] = 0
    emit('changed')
  } catch {
    // ignore
  }
}

async function ensureTracks(messages: UserNotificationDto[]) {
  const ids = [...new Set(messages.map((m) => m.trackId).filter(Boolean) as string[])]
  await Promise.all(
    ids.map(async (id) => {
      if (trackMap.value[id]) return
      try {
        const { data } = await http.get(`/api/tracks/${id}`, { silent: true })
        if (data.data) trackMap.value[id] = data.data as TrackDto
      } catch {
        // ignore
      }
    }),
  )
}

async function openChat(c: Conversation) {
  chat.value = { ...c, messages: [...c.messages] }
  draft.value = ''
  const unreadIds = c.messages.filter((m) => !m.read && m.type !== 'dm_out').map((m) => m.id)
  if (unreadIds.length) {
    try {
      await http.post('/api/notifications/read', { ids: unreadIds }, { silent: true })
      list.value = list.value.map((m) =>
        unreadIds.includes(m.id) ? { ...m, read: true } : m,
      )
      emit('changed')
      void loadUnread()
    } catch {
      // ignore
    }
  }
  await ensureTracks(c.messages)
  await nextTick()
  scrollChatBottom()
}

function closeChat() {
  chat.value = null
  draft.value = ''
}

function scrollChatBottom() {
  const el = chatScrollRef.value
  if (el) el.scrollTop = el.scrollHeight
}

async function sendDm() {
  if (!chat.value || !draft.value.trim() || sending.value) return
  sending.value = true
  const content = draft.value.trim()
  try {
    const { data } = await http.post('/api/notifications/dm', {
      peer: chat.value.name,
      content,
      actorAvatarUrl: chat.value.avatarUrl,
    })
    const msg = data.data as UserNotificationDto
    list.value = [msg, ...list.value]
    chat.value.messages.push(msg)
    chat.value.last = msg
    draft.value = ''
    await nextTick()
    scrollChatBottom()
  } catch {
    // ignore
  } finally {
    sending.value = false
  }
}

async function playTrackCard(msg: UserNotificationDto) {
  if (!msg.trackId) return
  let track = trackMap.value[msg.trackId]
  if (!track) {
    await ensureTracks([msg])
    track = trackMap.value[msg.trackId]
  }
  if (track) {
    player.playUploadedTrack(track)
  }
}

async function onItemClick(item: UserNotificationDto) {
  if (!item.read) {
    try {
      await http.post('/api/notifications/read', { ids: [item.id] }, { silent: true })
      item.read = true
      const ch = (item.channel || channel.value) as Channel
      unreadByChannel.value[ch] = Math.max(0, (unreadByChannel.value[ch] || 1) - 1)
      emit('changed')
    } catch {
      // ignore
    }
  }

  if (item.trackId) {
    emit('close')
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
    if (v) {
      chat.value = null
      void refresh()
    }
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
  width: 380px;
  max-width: calc(100vw - 24px);
  height: min(620px, calc(100vh - 90px));
  background: #f7f7f9;
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
  background: #f7f7f9;
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
  &.sm {
    width: 36px;
    height: 36px;
    font-size: 13px;
  }
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

/* 聊天视图 */
.chat-head {
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  background: #f0f0f2;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}
.back-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #333;
  cursor: pointer;
  display: grid;
  place-items: center;
  &:hover {
    background: rgba(0, 0, 0, 0.06);
  }
}
.chat-title {
  font-size: 15px;
  font-weight: 600;
  color: #222;
}
.chat-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 14px 8px;
}
.chat-time {
  text-align: center;
  font-size: 11px;
  color: #aaa;
  margin: 8px 0 12px;
}
.chat-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 14px;
  &.mine {
    flex-direction: row-reverse;
    .bubble {
      background: #ec4141;
      color: #fff;
      border-radius: 12px 4px 12px 12px;
    }
  }
}
.bubble-col {
  max-width: 78%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.bubble {
  background: #fff;
  color: #333;
  font-size: 13px;
  line-height: 1.55;
  padding: 10px 12px;
  border-radius: 4px 12px 12px 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  word-break: break-word;
  white-space: pre-wrap;
}
.song-card {
  border: none;
  background: #fff;
  border-radius: 10px;
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
  max-width: 260px;
  &:hover {
    background: #fafafa;
  }
}
.song-cover {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}
.song-meta {
  min-width: 0;
}
.song-name {
  font-size: 13px;
  color: #222;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-tag {
  flex-shrink: 0;
  font-size: 10px;
  color: #ec4141;
  background: rgba(236, 65, 65, 0.1);
  border-radius: 3px;
  padding: 1px 4px;
  font-weight: 600;
}
.song-artist {
  margin-top: 4px;
  font-size: 12px;
  color: #999;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-input {
  flex-shrink: 0;
  background: #fff;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  padding: 10px 12px 12px;
}
.chat-textarea {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  font-size: 13px;
  line-height: 1.5;
  color: #333;
  background: transparent;
  font-family: inherit;
  &::placeholder {
    color: #bbb;
  }
}
.chat-input-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
}
.limit {
  font-size: 12px;
  color: #ccc;
}
.input-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.muted-icon {
  color: #bbb;
}
.send-btn {
  border: none;
  background: transparent;
  color: #ec4141;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 2px;
  &:disabled {
    color: #ccc;
    cursor: default;
  }
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
