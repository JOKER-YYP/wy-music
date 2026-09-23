<template>
  <div v-loading="loading" class="comment-page">
    <template v-if="track">
      <div class="song-head">
        <div class="cover" :style="coverStyle" />
        <div class="meta">
          <div class="name-row">
            <span class="tag">单曲</span>
            <h1>{{ track.name }}</h1>
          </div>
          <div class="sub">
            <span v-if="track.album">专辑：{{ track.album }}</span>
            <span>歌手：{{ artists }}</span>
          </div>
        </div>
      </div>

      <h2 class="section-title">
        全部评论
        <sup>{{ total }}</sup>
      </h2>

      <div class="composer-box">
        <textarea
          v-model="draft"
          maxlength="1000"
          rows="4"
          placeholder="说点什么吧"
          @keydown.ctrl.enter="submit"
        />
        <div class="composer-bar">
          <span class="limit">{{ 1000 - draft.length }}</span>
          <div class="composer-actions">
            <el-button type="danger" round size="small" :loading="posting" :disabled="!draft.trim()" @click="submit">
              发布
            </el-button>
          </div>
        </div>
      </div>

      <h3 v-if="list.length" class="hot-title">精彩评论</h3>

      <div class="list">
        <article v-for="c in list" :key="c.id" class="item">
          <div class="avatar" :style="userAvatar(c)">{{ avatarLetter(c) }}</div>
          <div class="body">
            <div class="user">{{ c.user.nickname }}</div>
            <p class="content">{{ c.content }}</p>
            <div class="foot">
              <span class="date">{{ formatDate(c.createdAt) }}</span>
              <div class="ops">
                <button type="button" class="op" :class="{ on: c.liked }" @click="toggleLike(c)">
                  <span v-if="c.likeCount">{{ formatCount(c.likeCount) }}</span>
                  <span class="thumb">👍</span>
                </button>
                <button type="button" class="op" title="回复" @click="startReply(c)">
                  <el-icon><ChatDotRound /></el-icon>
                </button>
                <button
                  v-if="canDelete(c)"
                  type="button"
                  class="op danger"
                  title="删除"
                  @click="removeComment(c)"
                >
                  删除
                </button>
              </div>
            </div>
            <div v-if="replyTo?.id === c.id" class="inline-reply">
              <input
                v-model="replyDraft"
                :placeholder="`回复 @${c.user.nickname}`"
                maxlength="500"
                @keyup.enter="submitReply"
              />
              <el-button type="danger" size="small" round :loading="posting" @click="submitReply">
                回复
              </el-button>
            </div>
          </div>
        </article>

        <el-empty v-if="!loading && !list.length" description="还没有评论，来说两句吧" />
        <div v-if="loadingMore" class="more">加载中…</div>
        <div ref="sentinel" class="sentinel" />
      </div>
    </template>
    <el-empty v-else-if="!loading" description="歌曲不存在" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { CommentDto, TrackDto } from '@wy-music/shared'
import { http, mediaUrl } from '../services/http'
import { useUserStore } from '../stores/user'
import { useUiStore } from '../stores/ui'

const route = useRoute()
const user = useUserStore()
const ui = useUiStore()

const track = ref<TrackDto | null>(null)
const list = ref<CommentDto[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const loadingMore = ref(false)
const noMore = ref(false)

const draft = ref('')
const replyDraft = ref('')
const replyTo = ref<CommentDto | null>(null)
const posting = ref(false)
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

const artists = computed(() => track.value?.artists?.join(' / ') || '未知歌手')
const coverStyle = computed(() => {
  const url = mediaUrl(track.value?.coverUrl)
  return {
    backgroundImage: url
      ? `url(${url})`
      : 'linear-gradient(135deg,#ec4141,#ff8a80)',
  }
})

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
  return String(n || '')
}
function canDelete(c: CommentDto) {
  return user.user?.id === c.user.id || user.user?.role === 'admin'
}

async function loadTrack(id: string) {
  const { data } = await http.get(`/api/tracks/${id}`)
  track.value = data.data
}

async function fetchComments(reset = false) {
  const id = String(route.params.id || '')
  if (!id) return
  if (reset) {
    page.value = 1
    noMore.value = false
    loading.value = true
  } else {
    if (noMore.value || loadingMore.value) return
    loadingMore.value = true
  }
  try {
    const { data } = await http.get(`/api/comments/track/${id}`, {
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

async function load() {
  const id = String(route.params.id || '')
  if (!id) return
  loading.value = true
  try {
    await loadTrack(id)
    await fetchComments(true)
  } catch {
    track.value = null
  } finally {
    loading.value = false
  }
}

async function submit() {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  if (!track.value || !draft.value.trim()) return
  posting.value = true
  try {
    await http.post(`/api/comments/track/${track.value.id}`, { content: draft.value.trim() })
    ElMessage.success('发布成功')
    draft.value = ''
    await fetchComments(true)
  } finally {
    posting.value = false
  }
}

function startReply(c: CommentDto) {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  replyTo.value = c
  replyDraft.value = ''
}

async function submitReply() {
  if (!track.value || !replyTo.value || !replyDraft.value.trim()) return
  posting.value = true
  try {
    await http.post(`/api/comments/track/${track.value.id}`, {
      content: replyDraft.value.trim(),
      parentId: replyTo.value.id,
    })
    ElMessage.success('回复成功')
    replyTo.value = null
    replyDraft.value = ''
    await fetchComments(true)
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
  await fetchComments(true)
}

function setupObserver() {
  observer?.disconnect()
  if (!sentinel.value) return
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting && !noMore.value && !loading.value) {
        page.value += 1
        void fetchComments(false)
      }
    },
    { rootMargin: '120px' },
  )
  observer.observe(sentinel.value)
}

onMounted(async () => {
  await load()
  setupObserver()
})
onUnmounted(() => observer?.disconnect())
watch(() => route.params.id, load)
watch(sentinel, setupObserver)
</script>

<style scoped lang="scss">
.comment-page {
  max-width: 860px;
  padding-bottom: 24px;
}
.song-head {
  display: flex;
  gap: 20px;
  margin-bottom: 28px;
}
.cover {
  width: 120px;
  height: 120px;
  border-radius: 8px;
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
}
.meta {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  .tag {
    flex-shrink: 0;
    font-size: 12px;
    color: #ec4141;
    border: 1px solid #ec4141;
    border-radius: 3px;
    padding: 1px 6px;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
.sub {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  font-size: 13px;
  color: #888;
}
.section-title {
  margin: 0 0 14px;
  font-size: 18px;
  font-weight: 700;
  sup {
    margin-left: 4px;
    font-size: 12px;
    color: #999;
    font-weight: 500;
  }
}
.composer-box {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  background: #fafafa;
  padding: 12px 14px 10px;
  margin-bottom: 28px;
  textarea {
    width: 100%;
    border: none;
    outline: none;
    resize: none;
    background: transparent;
    font-size: 14px;
    line-height: 1.5;
    font-family: inherit;
    color: #333;
    box-sizing: border-box;
    &::placeholder {
      color: #bbb;
    }
  }
}
.composer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
}
.limit {
  font-size: 12px;
  color: #bbb;
}
.hot-title {
  margin: 0 0 12px;
  font-size: 15px;
  font-weight: 600;
  color: #333;
}
.item {
  display: flex;
  gap: 14px;
  padding: 18px 0;
  border-bottom: 1px solid #f0f0f0;
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
.body {
  flex: 1;
  min-width: 0;
}
.user {
  font-size: 13px;
  color: #507daf;
  font-weight: 500;
}
.content {
  margin: 8px 0 10px;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
  white-space: pre-wrap;
  word-break: break-word;
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.date {
  font-size: 12px;
  color: #aaa;
}
.ops {
  display: flex;
  align-items: center;
  gap: 14px;
}
.op {
  border: none;
  background: transparent;
  color: #999;
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
  &.danger:hover {
    color: #ec4141;
  }
  .thumb {
    font-size: 13px;
    filter: grayscale(1);
    opacity: 0.65;
  }
  &.on .thumb,
  &:hover .thumb {
    filter: none;
    opacity: 1;
  }
}
.inline-reply {
  margin-top: 10px;
  display: flex;
  gap: 8px;
  input {
    flex: 1;
    height: 32px;
    border: 1px solid #e5e5e5;
    border-radius: 16px;
    padding: 0 12px;
    outline: none;
    font-size: 13px;
    &:focus {
      border-color: #ec4141;
    }
  }
}
.more {
  text-align: center;
  color: #bbb;
  font-size: 12px;
  padding: 16px;
}
.sentinel {
  height: 1px;
}
</style>
