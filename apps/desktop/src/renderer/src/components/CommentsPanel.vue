<template>
  <Teleport to="body">
    <Transition name="cm-slide">
      <div
        v-if="ui.commentsVisible && ui.commentsMode === 'player' && track"
        class="comments-panel"
        @wheel="onWheel"
      >
        <div class="cm-bg" :style="bgStyle" />
        <div class="cm-mask" />

        <header class="cm-top">
          <button class="cm-icon-btn" type="button" title="返回播放页" @click="backToNowPlaying">
            <el-icon :size="22"><ArrowDown /></el-icon>
          </button>
          <button class="cm-song" type="button" @click="backToNowPlaying">
            <span class="cm-thumb" :style="coverStyle" />
            <span class="cm-song-meta">
              <span class="cm-name">{{ track.name }}</span>
              <span class="cm-artist">{{ artists }}</span>
            </span>
            <el-icon class="cm-up"><ArrowDown /></el-icon>
          </button>
          <span class="cm-spacer" />
        </header>

        <div class="cm-body" ref="listRef" @scroll="onScroll">
          <h2 class="cm-title">
            全部评论
            <sup>{{ total }}</sup>
          </h2>

          <div v-loading="loading" class="cm-list">
            <article v-for="c in list" :key="c.id" class="cm-item">
              <div class="avatar" :style="userAvatar(c)">{{ avatarLetter(c) }}</div>
              <div class="cm-main">
                <div class="user-row">
                  <span class="nickname">{{ c.user.nickname }}</span>
                </div>
                <p class="content">{{ c.content }}</p>
                <div class="meta-row">
                  <span class="date">{{ formatDate(c.createdAt) }}</span>
                  <div class="ops">
                    <button
                      type="button"
                      class="op"
                      :class="{ on: c.liked }"
                      @click="toggleLike(c)"
                    >
                      <span v-if="c.likeCount">{{ formatCount(c.likeCount) }}</span>
                      <span class="thumb" aria-hidden="true">👍</span>
                    </button>
                    <button type="button" class="op" title="回复" @click="startReply(c)">
                      <el-icon :size="15"><ChatDotRound /></el-icon>
                    </button>
                    <button
                      v-if="canDelete(c)"
                      type="button"
                      class="op"
                      title="删除"
                      @click="removeComment(c)"
                    >
                      <el-icon :size="15"><Delete /></el-icon>
                    </button>
                  </div>
                </div>
                <div v-if="c.replyCount" class="reply-hint">{{ c.replyCount }} 条回复</div>
              </div>
            </article>

            <el-empty
              v-if="!loading && !list.length"
              description="还没有评论，来抢沙发吧"
              :image-size="80"
            />
            <div v-if="loadingMore" class="more-tip">加载中…</div>
            <div v-else-if="noMore && list.length" class="more-tip">没有更多了</div>
          </div>
        </div>

        <button class="fab" type="button" @click="openComposer()">
          <el-icon :size="16"><EditPen /></el-icon>
          发布评论
        </button>

        <!-- 发布 / 回复输入 -->
        <Transition name="composer">
          <div v-if="composerVisible" class="composer-mask" @click.self="closeComposer">
            <div class="composer">
              <div class="composer-head">
                <span>{{ replyTo ? `回复 @${replyTo.user.nickname}` : '发布评论' }}</span>
                <button type="button" @click="closeComposer">
                  <el-icon><Close /></el-icon>
                </button>
              </div>
              <textarea
                v-model="draft"
                maxlength="500"
                rows="4"
                :placeholder="replyTo ? '写下你的回复…' : '分享你的听感…'"
                autofocus
              />
              <div class="composer-foot">
                <span class="count">{{ draft.length }}/500</span>
                <el-button type="danger" round :loading="posting" :disabled="!draft.trim()" @click="submit">
                  发送
                </el-button>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { CommentDto, TrackDto } from '@wy-music/shared'
import { useUiStore } from '../stores/ui'
import { useUserStore } from '../stores/user'
import { http, mediaUrl } from '../services/http'

const ui = useUiStore()
const user = useUserStore()

const track = computed(() => ui.commentsTrack as TrackDto | null)
const artists = computed(() => track.value?.artists?.join(' / ') || '')
const coverUrl = computed(() => mediaUrl(track.value?.coverUrl))
const coverStyle = computed(() => ({
  backgroundImage: coverUrl.value
    ? `url(${coverUrl.value})`
    : 'linear-gradient(135deg,#ec4141,#ff8a80)',
}))
const bgStyle = computed(() => ({
  backgroundImage: coverUrl.value
    ? `url(${coverUrl.value})`
    : 'linear-gradient(135deg,#2b2b2b,#111)',
}))

const list = ref<CommentDto[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const loadingMore = ref(false)
const noMore = ref(false)
const listRef = ref<HTMLElement | null>(null)

const composerVisible = ref(false)
const draft = ref('')
const posting = ref(false)
const replyTo = ref<CommentDto | null>(null)
let wheelLock = false

function avatarLetter(c: CommentDto) {
  return (c.user.nickname || '用').slice(0, 1)
}

function userAvatar(c: CommentDto) {
  const url = mediaUrl(c.user.avatarUrl)
  if (url) return { backgroundImage: `url(${url})`, color: 'transparent' }
  return {}
}

function formatDate(iso: string) {
  return iso.slice(0, 10)
}

function formatCount(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}w`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n || '')
}

function canDelete(c: CommentDto) {
  return user.user?.id === c.user.id || user.user?.role === 'admin'
}

async function fetchPage(reset = false) {
  if (!track.value?.id) return
  if (track.value.id.startsWith('local:') || track.value.id.startsWith('webfile:')) {
    list.value = []
    total.value = 0
    return
  }
  if (reset) {
    page.value = 1
    noMore.value = false
    loading.value = true
  } else {
    loadingMore.value = true
  }
  try {
    const { data } = await http.get(`/api/comments/track/${track.value.id}`, {
      params: { page: page.value, pageSize },
    })
    const chunk = (data.data.list || []) as CommentDto[]
    total.value = data.data.total || 0
    list.value = reset ? chunk : [...list.value, ...chunk]
    noMore.value = list.value.length >= total.value || chunk.length < pageSize
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function onScroll() {
  const el = listRef.value
  if (!el || loading.value || loadingMore.value || noMore.value) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
    page.value += 1
    void fetchPage(false)
  }
}

function openComposer(target?: CommentDto) {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  if (!track.value || track.value.id.startsWith('local:') || track.value.id.startsWith('webfile:')) {
    ElMessage.warning('本地试听歌曲无法评论，请先上传')
    return
  }
  replyTo.value = target || null
  draft.value = ''
  composerVisible.value = true
}

function closeComposer() {
  composerVisible.value = false
  replyTo.value = null
  draft.value = ''
}

function startReply(c: CommentDto) {
  openComposer(c)
}

async function submit() {
  if (!track.value || !draft.value.trim()) return
  posting.value = true
  try {
    await http.post(`/api/comments/track/${track.value.id}`, {
      content: draft.value.trim(),
      parentId: replyTo.value?.id || null,
    })
    ElMessage.success(replyTo.value ? '回复成功' : '发布成功')
    closeComposer()
    await fetchPage(true)
  } finally {
    posting.value = false
  }
}

async function toggleLike(c: CommentDto) {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  const { data } = await http.post(`/api/comments/${c.id}/like`)
  c.liked = data.data.liked
  c.likeCount = data.data.likeCount
}

async function removeComment(c: CommentDto) {
  await http.delete(`/api/comments/${c.id}`)
  ElMessage.success('已删除')
  await fetchPage(true)
}

function backToNowPlaying() {
  ui.closeComments()
}

/** 评论列表滚到顶部后再向上滚，回到播放页 */
function onWheel(e: WheelEvent) {
  if (composerVisible.value || wheelLock) return
  if (e.deltaY >= -20) return
  const el = listRef.value
  if (el && el.scrollTop > 4) return
  e.preventDefault()
  wheelLock = true
  backToNowPlaying()
  window.setTimeout(() => {
    wheelLock = false
  }, 450)
}

watch(
  () => [ui.commentsVisible, ui.commentsMode, ui.commentsTrack?.id] as const,
  ([visible, mode]) => {
    if (visible && mode === 'player') void fetchPage(true)
  },
)
</script>

<style scoped lang="scss">
.comments-panel {
  position: fixed;
  inset: 0;
  z-index: 1900;
  display: flex;
  flex-direction: column;
  color: #fff;
  overflow: hidden;
}
.cm-bg {
  position: absolute;
  inset: -40px;
  background-size: cover;
  background-position: center;
  filter: blur(48px) brightness(0.28);
  transform: scale(1.12);
}
.cm-mask {
  position: absolute;
  inset: 0;
  background: rgba(12, 12, 12, 0.72);
}
.cm-top,
.cm-body,
.fab,
.composer-mask {
  position: relative;
  z-index: 1;
}
.cm-top {
  height: 56px;
  display: grid;
  grid-template-columns: 48px 1fr 48px;
  align-items: center;
  padding: 0 8px;
}
.cm-icon-btn {
  border: none;
  background: transparent;
  color: #fff;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
}
.cm-song {
  justify-self: center;
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  max-width: 70%;
  padding: 4px 8px;
  border-radius: 20px;
  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }
}
.cm-thumb {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
}
.cm-song-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
}
.cm-name {
  font-size: 13px;
  font-weight: 600;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cm-artist {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cm-up {
  color: rgba(255, 255, 255, 0.55);
  flex-shrink: 0;
  transform: rotate(0deg);
}
.cm-spacer {
  width: 40px;
}
.cm-body {
  flex: 1;
  overflow: auto;
  padding: 8px 28px 100px;
  min-height: 0;
}
.cm-title {
  margin: 8px 0 18px;
  font-size: 18px;
  font-weight: 700;
  sup {
    margin-left: 4px;
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.55);
    vertical-align: super;
  }
}
.cm-item {
  display: flex;
  gap: 14px;
  padding: 16px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, #5b9bd5, #3a7bd5);
  background-size: cover;
  background-position: center;
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}
.cm-main {
  flex: 1;
  min-width: 0;
}
.user-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.nickname {
  font-size: 13px;
  color: #7eb6ff;
  font-weight: 500;
}
.content {
  margin: 8px 0 10px;
  font-size: 14px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.92);
  word-break: break-word;
  white-space: pre-wrap;
}
.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.date {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
.ops {
  display: flex;
  align-items: center;
  gap: 14px;
}
.op {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 0;
  &:hover,
  &.on {
    color: #ec4141;
  }
  .thumb {
    font-size: 13px;
    filter: grayscale(1);
    opacity: 0.7;
  }
  &.on .thumb,
  &:hover .thumb {
    filter: none;
    opacity: 1;
  }
}
.reply-hint {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
.more-tip {
  text-align: center;
  color: rgba(255, 255, 255, 0.35);
  font-size: 12px;
  padding: 16px 0;
}
.fab {
  position: absolute;
  left: 50%;
  bottom: 88px;
  transform: translateX(-50%);
  z-index: 2;
  border: none;
  height: 40px;
  padding: 0 22px;
  border-radius: 20px;
  background: rgba(80, 80, 80, 0.75);
  backdrop-filter: blur(8px);
  color: #fff;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  &:hover {
    background: rgba(100, 100, 100, 0.85);
  }
}
.composer-mask {
  position: absolute;
  inset: 0;
  z-index: 3;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px;
}
.composer {
  width: min(520px, 100%);
  background: #2a2a2a;
  border-radius: 12px 12px 8px 8px;
  padding: 14px 16px 16px;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.4);
}
.composer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
  button {
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.55);
    cursor: pointer;
  }
}
textarea {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: #1f1f1f;
  color: #fff;
  border-radius: 8px;
  padding: 12px;
  font-size: 14px;
  line-height: 1.5;
  font-family: inherit;
  box-sizing: border-box;
  &::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }
}
.composer-foot {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}
.cm-slide-enter-active,
.cm-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.cm-slide-enter-from,
.cm-slide-leave-to {
  opacity: 0;
  transform: translateY(40px);
}
.composer-enter-active,
.composer-leave-active {
  transition: opacity 0.2s ease;
}
.composer-enter-from,
.composer-leave-to {
  opacity: 0;
}
</style>
