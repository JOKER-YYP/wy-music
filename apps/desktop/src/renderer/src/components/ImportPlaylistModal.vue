<template>
  <Teleport to="body">
    <Transition name="import-fade">
      <div v-if="visible" class="import-mask" @click.self="close">
        <div class="import-dialog" role="dialog" aria-label="歌单导入">
          <header class="import-head">
            <h3>歌单导入</h3>
            <button class="close-btn" type="button" @click="close">
              <el-icon :size="18"><Close /></el-icon>
            </button>
          </header>

          <div class="import-body">
            <template v-if="step === 'input'">
              <div v-for="(link, idx) in links" :key="idx" class="link-row">
                <span class="link-label">链接{{ idx + 1 }}</span>
                <el-input
                  v-model="links[idx]"
                  clearable
                  placeholder="粘贴歌单链接（网易云 / QQ 音乐）"
                  @keydown.enter.prevent="onPreview"
                />
                <button
                  v-if="links.length > 1"
                  class="link-remove"
                  type="button"
                  title="移除"
                  @click="removeLink(idx)"
                >
                  移除
                </button>
                <button
                  v-if="idx === links.length - 1 && links.length < 10"
                  class="link-add"
                  type="button"
                  @click="addLink"
                >
                  添加
                </button>
              </div>
              <p class="hint">* 最多支持 10 个链接同步导入；将匹配公共曲库中已有歌曲</p>
              <el-button
                class="start-btn"
                type="danger"
                round
                :loading="loading"
                @click="onPreview"
              >
                开始导入
              </el-button>
            </template>

            <template v-else>
              <div v-loading="loading" class="preview-wrap">
                <div v-for="(src, i) in sources" :key="i" class="source-card">
                  <div class="source-head">
                    <div class="source-title">
                      <span class="platform">{{ platformLabel(src.platform) }}</span>
                      <strong>{{ src.ok ? src.name : '解析失败' }}</strong>
                    </div>
                    <div v-if="src.ok" class="source-stats">
                      共 {{ src.total }} 首 ·
                      <span class="ok-text">可导入 {{ src.matchedCount }}</span>
                      ·
                      <span class="miss-text">缺失 {{ src.missingCount }}</span>
                    </div>
                    <div v-else class="source-error">{{ src.error }}</div>
                  </div>
                  <div class="source-url" :title="src.url">{{ src.url }}</div>

                  <template v-if="src.ok">
                    <el-collapse>
                      <el-collapse-item
                        v-if="src.matched.length"
                        :title="`可导入（${src.matched.length}）`"
                        name="matched"
                      >
                        <ul class="song-list">
                          <li v-for="(s, j) in src.matched" :key="`m-${j}`">
                            <span class="song-name">{{ s.name }}</span>
                            <span class="song-artist">{{ (s.artists || []).join(' / ') }}</span>
                            <span class="match-tip">→ {{ s.trackName }}</span>
                          </li>
                        </ul>
                      </el-collapse-item>
                      <el-collapse-item
                        v-if="src.missing.length"
                        :title="`曲库缺失（${src.missing.length}）`"
                        name="missing"
                      >
                        <ul class="song-list miss">
                          <li v-for="(s, j) in src.missing" :key="`x-${j}`">
                            <span class="song-name">{{ s.name }}</span>
                            <span class="song-artist">{{ (s.artists || []).join(' / ') }}</span>
                          </li>
                        </ul>
                      </el-collapse-item>
                    </el-collapse>
                  </template>
                </div>
              </div>

              <div class="preview-actions">
                <el-button @click="backToInput">返回修改</el-button>
                <el-button
                  type="danger"
                  :loading="confirming"
                  :disabled="!canConfirm"
                  @click="onConfirm"
                >
                  确认导入（{{ totalMatched }} 首）
                </el-button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Close } from '@element-plus/icons-vue'
import { http } from '../services/http'
import { usePlaylistStore } from '../stores/playlist'

type MatchedSong = {
  name: string
  artists: string[]
  trackId: string
  trackName: string
  trackArtists: string[]
}

type MissingSong = {
  name: string
  artists: string[]
}

type ImportSource = {
  ok: boolean
  url: string
  platform: 'netease' | 'qq' | null
  name: string | null
  description?: string | null
  error?: string
  total: number
  matchedCount: number
  missingCount: number
  matched: MatchedSong[]
  missing: MissingSong[]
}

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: []; imported: [] }>()

const router = useRouter()
const playlistStore = usePlaylistStore()

const step = ref<'input' | 'preview'>('input')
const links = ref<string[]>([''])
const loading = ref(false)
const confirming = ref(false)
const sources = ref<ImportSource[]>([])

const totalMatched = computed(() =>
  sources.value.reduce((n, s) => n + (s.ok ? s.matchedCount : 0), 0),
)
const canConfirm = computed(() => sources.value.some((s) => s.ok && s.matchedCount > 0))

watch(
  () => props.visible,
  (v) => {
    if (v) {
      step.value = 'input'
      links.value = ['']
      sources.value = []
      loading.value = false
      confirming.value = false
    }
  },
)

function close() {
  emit('close')
}

function addLink() {
  if (links.value.length >= 10) return
  links.value.push('')
}

function removeLink(idx: number) {
  links.value.splice(idx, 1)
  if (!links.value.length) links.value = ['']
}

function platformLabel(p: ImportSource['platform']) {
  if (p === 'netease') return '网易云'
  if (p === 'qq') return 'QQ音乐'
  return '未知'
}

function backToInput() {
  step.value = 'input'
}

async function onPreview() {
  const urls = links.value.map((s) => s.trim()).filter(Boolean)
  if (!urls.length) {
    ElMessage.warning('请粘贴歌单链接')
    return
  }
  loading.value = true
  try {
    const { data } = await http.post('/api/playlists/import/preview', { urls })
    sources.value = (data.data?.sources || []) as ImportSource[]
    step.value = 'preview'
    const okCount = sources.value.filter((s) => s.ok).length
    if (!okCount) {
      ElMessage.error('链接解析失败，请检查是否为公开歌单分享链接')
    } else if (totalMatched.value === 0) {
      ElMessage.warning('解析成功，但公共曲库中没有匹配到歌曲')
    } else {
      ElMessage.success(`解析完成：可导入 ${totalMatched.value} 首`)
    }
  } catch (e) {
    console.error('[import preview]', e)
  } finally {
    loading.value = false
  }
}

async function onConfirm() {
  const items = sources.value
    .filter((s) => s.ok && s.matched.length)
    .map((s) => ({
      name: (s.name || '导入歌单').slice(0, 40),
      description: s.description || undefined,
      trackIds: s.matched.map((m) => m.trackId),
    }))
  if (!items.length) {
    ElMessage.warning('没有可导入的歌曲')
    return
  }
  confirming.value = true
  try {
    const { data } = await http.post('/api/playlists/import/confirm', { items })
    const playlists = data.data?.playlists || []
    await playlistStore.fetchMine()
    ElMessage.success(data.message || `已导入 ${playlists.length} 个歌单`)
    emit('imported')
    close()
    if (playlists[0]?.id) {
      router.push(`/playlist/${playlists[0].id}`)
    }
  } catch (e) {
    console.error('[import confirm]', e)
  } finally {
    confirming.value = false
  }
}
</script>

<style scoped lang="scss">
.import-mask {
  position: fixed;
  inset: 0;
  z-index: 2800;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.import-dialog {
  width: min(640px, 100%);
  max-height: min(80vh, 720px);
  background: #fff;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);
}
.import-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f0;
  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
}
.close-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: #999;
  display: inline-flex;
  padding: 4px;
  &:hover {
    color: #333;
  }
}
.import-body {
  padding: 20px;
  overflow: auto;
}
.link-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  padding: 8px 10px;
  :deep(.el-input__wrapper) {
    box-shadow: none;
    background: transparent;
  }
}
.link-label {
  flex: none;
  color: #666;
  font-size: 13px;
  width: 48px;
}
.link-add,
.link-remove {
  flex: none;
  border: 0;
  background: transparent;
  color: #ec4141;
  cursor: pointer;
  font-size: 13px;
  padding: 0 4px;
}
.hint {
  margin: 4px 0 18px;
  color: #999;
  font-size: 12px;
}
.start-btn {
  display: block;
  width: 200px;
  margin: 0 auto;
  height: 40px;
}
.preview-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 120px;
}
.source-card {
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 12px 14px;
}
.source-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.source-title {
  display: flex;
  align-items: center;
  gap: 8px;
  strong {
    font-size: 15px;
  }
}
.platform {
  font-size: 12px;
  color: #ec4141;
  background: rgba(236, 65, 65, 0.1);
  padding: 1px 6px;
  border-radius: 4px;
}
.source-stats {
  font-size: 13px;
  color: #666;
}
.ok-text {
  color: #67c23a;
}
.miss-text {
  color: #e6a23c;
}
.source-error {
  color: #f56c6c;
  font-size: 13px;
}
.source-url {
  margin: 6px 0 8px;
  font-size: 12px;
  color: #aaa;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 180px;
  overflow: auto;
  li {
    display: flex;
    gap: 10px;
    align-items: baseline;
    padding: 4px 0;
    font-size: 13px;
    border-bottom: 1px solid #f5f5f5;
  }
}
.song-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-artist {
  color: #999;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.match-tip {
  color: #67c23a;
  font-size: 12px;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.song-list.miss .song-name {
  color: #e6a23c;
}
.preview-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
.import-fade-enter-active,
.import-fade-leave-active {
  transition: opacity 0.18s ease;
}
.import-fade-enter-from,
.import-fade-leave-to {
  opacity: 0;
}
</style>
