<template>
  <div class="library-page">
    <div class="head">
      <div class="title-block">
        <h2>公共曲库</h2>
        <button type="button" class="sources-btn" :title="sourcesHint" @click="sourcesOpen = true">
          <el-icon :size="14"><FolderOpened /></el-icon>
          <span>{{ sourcesLabel }}</span>
        </button>
      </div>
      <el-input
        v-model="keyword"
        class="lib-search"
        clearable
        placeholder="搜索整个曲库：歌名 / 歌手 / 专辑"
        @keyup.enter="onSearch"
        @clear="onSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <TrackTable
      v-loading="loading"
      :tracks="list"
      :allow-delete="prefs.includeServerLibrary"
      empty-text="当前曲库来源下暂无歌曲"
      @refresh="() => load(true)"
    />

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        background
        layout="total, prev, pager, next"
        @current-change="onPageChange"
      />
    </div>

    <LibrarySourcesDialog v-model:visible="sourcesOpen" @saved="onSourcesSaved" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { FolderOpened, Search } from '@element-plus/icons-vue'
import type { TrackDto } from '@wy-music/shared'
import { http } from '../services/http'
import {
  librarySourcesSummary,
  loadLibrarySources,
  localItemsToLibraryTracks,
  needsClientLibraryMerge,
  type LibrarySourcesPrefs,
} from '../services/librarySources'
import type { QueueTrack } from '../stores/player'
import TrackTable from '../components/TrackTable.vue'
import LibrarySourcesDialog from '../components/LibrarySourcesDialog.vue'

const route = useRoute()
const list = ref<QueueTrack[]>([])
const page = ref(1)
const pageSize = 20
const total = ref(0)
const keyword = ref(String(route.query.keyword || ''))
const loading = ref(false)
const sourcesOpen = ref(false)
const prefs = ref<LibrarySourcesPrefs>(loadLibrarySources())
/** 客户端合并时的全量缓存（未分页） */
const mergedCache = shallowRef<QueueTrack[]>([])

let searchTimer: ReturnType<typeof setTimeout> | null = null
let loadToken = 0

const sourcesLabel = computed(() => librarySourcesSummary(prefs.value))
const sourcesHint = computed(() => {
  const lines = [] as string[]
  if (prefs.value.includeServerLibrary) lines.push('本地数据库')
  for (const f of prefs.value.folders) lines.push(f)
  return lines.join('\n') || '本地数据库'
})

function matchKeyword(t: TrackDto, kw: string) {
  if (!kw) return true
  const q = kw.toLowerCase()
  if (t.name.toLowerCase().includes(q)) return true
  if ((t.album || '').toLowerCase().includes(q)) return true
  return (t.artists || []).some((a) => String(a).toLowerCase().includes(q))
}

function dedupeTracks(tracks: QueueTrack[]): QueueTrack[] {
  const byId = new Map<string, QueueTrack>()
  const byPath = new Set<string>()
  for (const t of tracks) {
    if (byId.has(t.id)) continue
    const path = t.localPath?.replace(/\\/g, '/').toLowerCase()
    if (path) {
      if (byPath.has(path)) continue
      byPath.add(path)
    }
    byId.set(t.id, t)
  }
  return [...byId.values()]
}

async function fetchServerPage(kw: string, p: number) {
  const { data } = await http.get('/api/tracks', {
    params: { page: p, pageSize, keyword: kw },
  })
  return {
    list: (data.data.list || []) as QueueTrack[],
    total: Number(data.data.total || 0),
  }
}

async function fetchAllServerTracks(kw: string): Promise<QueueTrack[]> {
  const all: QueueTrack[] = []
  let p = 1
  const size = 50
  while (true) {
    const { data } = await http.get('/api/tracks', {
      params: { page: p, pageSize: size, keyword: kw },
    })
    const chunk = (data.data.list || []) as QueueTrack[]
    all.push(...chunk)
    const serverTotal = Number(data.data.total || 0)
    if (!chunk.length || all.length >= serverTotal) break
    p += 1
    if (p > 200) break
  }
  return all
}

async function scanFolders(folders: string[]): Promise<QueueTrack[]> {
  if (!folders.length || !window.wyAPI?.scanFolder) return []
  const out: QueueTrack[] = []
  for (const folder of folders) {
    try {
      const res = await window.wyAPI.scanFolder(folder)
      out.push(...localItemsToLibraryTracks(res.items || []))
    } catch (e: any) {
      ElMessage.warning(`无法扫描文件夹：${folder}${e?.message ? `（${e.message}）` : ''}`)
    }
  }
  return out
}

function applyClientPage(kw: string) {
  const filtered = kw
    ? mergedCache.value.filter((t) => matchKeyword(t, kw))
    : mergedCache.value
  total.value = filtered.length
  const start = (page.value - 1) * pageSize
  list.value = filtered.slice(start, start + pageSize)
}

async function loadMerged(forceRescan: boolean) {
  const token = ++loadToken
  loading.value = true
  const kw = keyword.value.trim()
  try {
    if (forceRescan || !mergedCache.value.length) {
      const parts: QueueTrack[] = []
      if (prefs.value.includeServerLibrary) {
        // 合并模式：服务端先拉全量，关键词在客户端与文件夹结果一起过滤
        parts.push(...(await fetchAllServerTracks('')))
      }
      parts.push(...(await scanFolders(prefs.value.folders)))
      if (token !== loadToken) return
      mergedCache.value = dedupeTracks(parts)
    }
    if (token !== loadToken) return
    applyClientPage(kw)
  } finally {
    if (token === loadToken) loading.value = false
  }
}

async function loadServerOnly() {
  const token = ++loadToken
  loading.value = true
  mergedCache.value = []
  try {
    const res = await fetchServerPage(keyword.value.trim(), page.value)
    if (token !== loadToken) return
    list.value = res.list
    total.value = res.total
  } finally {
    if (token === loadToken) loading.value = false
  }
}

async function load(forceRescan = false) {
  prefs.value = loadLibrarySources()
  if (needsClientLibraryMerge(prefs.value)) {
    await loadMerged(forceRescan)
  } else {
    await loadServerOnly()
  }
}

function onSearch() {
  page.value = 1
  if (needsClientLibraryMerge(prefs.value) && mergedCache.value.length) {
    applyClientPage(keyword.value.trim())
    return
  }
  load(false)
}

function onPageChange() {
  if (needsClientLibraryMerge(prefs.value) && mergedCache.value.length) {
    applyClientPage(keyword.value.trim())
    return
  }
  load(false)
}

function onSourcesSaved(next: LibrarySourcesPrefs) {
  prefs.value = next
  page.value = 1
  mergedCache.value = []
  load(true)
}

watch(keyword, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    onSearch()
  }, 300)
})

watch(
  () => route.query.keyword,
  (v) => {
    const next = String(v || '')
    if (next !== keyword.value) keyword.value = next
  },
)

onMounted(() => load(true))
</script>

<style scoped>
.library-page {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - 200px);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.title-block {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
h2 {
  margin: 0;
  flex-shrink: 0;
}
.sources-btn {
  border: 1px solid var(--el-border-color);
  background: var(--el-fill-color-blank);
  color: var(--wy-text-secondary);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 999px;
  max-width: 280px;
}
.sources-btn span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sources-btn:hover {
  color: var(--wy-brand);
  border-color: rgba(236, 65, 65, 0.35);
}
.lib-search {
  width: 320px;
  max-width: 50%;
}
.pager {
  display: flex;
  justify-content: center;
  padding: 20px 0 8px;
  margin-top: auto;
}
</style>
