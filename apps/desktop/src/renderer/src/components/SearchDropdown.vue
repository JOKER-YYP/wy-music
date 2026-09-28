<template>
  <div
    v-show="visible"
    class="search-dropdown"
    :style="anchorStyle"
    @mousedown.prevent
  >
    <!-- 输入联想 -->
    <template v-if="mode === 'suggest'">
      <button
        v-for="(item, idx) in suggests"
        :key="`${item.text}-${idx}`"
        type="button"
        class="suggest-row"
        @click="emitSearch(item.text)"
      >
        <el-icon class="suggest-icon"><Search /></el-icon>
        <span class="suggest-text">{{ item.text }}</span>
        <span v-if="item.tag === '热搜'" class="tag tag-hot">热搜</span>
        <span v-else-if="item.tag === '歌词'" class="tag tag-lyric">歌词</span>
      </button>
      <div v-if="!suggests.length" class="empty-tip">暂无相关搜索</div>
    </template>

    <!-- 空态面板 -->
    <template v-else>
      <section v-if="history.length" class="sec">
        <div class="sec-head">
          <span class="sec-title">搜索历史</span>
          <button type="button" class="icon-plain" title="清空历史" @click="clearHistory">
            <el-icon :size="14"><Delete /></el-icon>
          </button>
        </div>
        <div class="tags">
          <button
            v-for="h in visibleHistory"
            :key="h"
            type="button"
            class="tag-pill"
            @click="emitSearch(h)"
          >
            {{ h }}
          </button>
          <button
            v-if="history.length > historyLimit"
            type="button"
            class="tag-pill tag-more"
            :title="historyExpanded ? '收起' : '展开'"
            @click="historyExpanded = !historyExpanded"
          >
            <el-icon :size="12">
              <ArrowUp v-if="historyExpanded" />
              <ArrowDown v-else />
            </el-icon>
          </button>
        </div>
      </section>

      <section v-if="guess.length" class="sec">
        <div class="sec-head">
          <span class="sec-title">猜你喜欢</span>
        </div>
        <div class="tags">
          <button
            v-for="g in guess"
            :key="g"
            type="button"
            class="tag-pill"
            @click="emitSearch(g)"
          >
            {{ g }}
          </button>
        </div>
      </section>

      <section v-if="hot.length" class="sec board">
        <div class="sec-head">
          <span class="sec-title">热搜榜</span>
          <button type="button" class="play-mini" title="搜索第一名" @click="playHotFirst">
            <el-icon :size="14"><VideoPlay /></el-icon>
          </button>
        </div>
        <div class="rank-grid">
          <button
            v-for="(item, idx) in hot"
            :key="item.text"
            type="button"
            class="rank-item"
            @click="emitSearch(item.text)"
          >
            <span class="rank-num" :class="{ top: idx < 3 }">{{ idx + 1 }}</span>
            <span class="rank-text">{{ item.text }}</span>
            <span v-if="item.badge === '爆'" class="badge-hot">爆</span>
            <span v-else-if="item.badge === '热'" class="badge-up">↑</span>
          </button>
        </div>
      </section>

      <section v-if="chart.items.length" class="sec board">
        <div class="sec-head">
          <span class="sec-title">{{ chart.name }}</span>
          <button type="button" class="play-mini" title="播放榜单" @click="playChart">
            <el-icon :size="14"><VideoPlay /></el-icon>
          </button>
        </div>
        <div class="rank-grid">
          <button
            v-for="item in chart.items"
            :key="item.trackId || item.text"
            type="button"
            class="rank-item"
            @click="emitSearch(item.text)"
          >
            <span class="rank-num" :class="{ top: item.rank <= 3 }">{{ item.rank }}</span>
            <span class="rank-text">{{ item.text }}</span>
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, Delete, Search, VideoPlay } from '@element-plus/icons-vue'
import { http } from '../services/http'
import { usePlayerStore } from '../stores/player'
import { useUserStore } from '../stores/user'
import { useUiStore } from '../stores/ui'

type SuggestItem = { text: string; tag?: '热搜' | '歌词' }
type HotItem = { text: string; badge?: string }
type ChartItem = { rank: number; text: string; artists?: string[]; trackId?: string }

const props = defineProps<{
  visible: boolean
  keyword: string
  anchorStyle?: Record<string, string>
}>()

const emit = defineEmits<{
  search: [keyword: string]
}>()

const HISTORY_KEY = 'wy-search-history'
const historyLimit = 8

const player = usePlayerStore()
const user = useUserStore()
const ui = useUiStore()

const mode = ref<'panel' | 'suggest'>('panel')
const history = ref<string[]>(loadHistory())
const historyExpanded = ref(false)
const guess = ref<string[]>([])
const hot = ref<HotItem[]>([])
const chart = ref<{ id: string; name: string; items: ChartItem[] }>({
  id: 'hot',
  name: '热歌榜',
  items: [],
})
const suggests = ref<SuggestItem[]>([])

const visibleHistory = computed(() =>
  historyExpanded.value ? history.value : history.value.slice(0, historyLimit),
)

let reqId = 0
let timer: ReturnType<typeof setTimeout> | null = null

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.map(String).filter(Boolean).slice(0, 20) : []
  } catch {
    return []
  }
}

function saveHistory(list: string[]) {
  history.value = list
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list))
}

function pushHistory(kw: string) {
  const text = kw.trim()
  if (!text) return
  const next = [text, ...history.value.filter((h) => h !== text)].slice(0, 20)
  saveHistory(next)
}

function clearHistory() {
  saveHistory([])
}

function emitSearch(kw: string) {
  const text = kw.trim()
  if (!text) return
  pushHistory(text)
  emit('search', text)
}

async function fetchPanel() {
  const id = ++reqId
  try {
    const { data } = await http.get('/api/discover/search-suggest')
    if (id !== reqId) return
    const payload = data.data || {}
    mode.value = 'panel'
    guess.value = payload.guess || []
    hot.value = payload.hot || []
    chart.value = payload.chart || { id: 'hot', name: '热歌榜', items: [] }
  } catch {
    // ignore
  }
}

async function fetchSuggest(q: string) {
  const id = ++reqId
  try {
    const { data } = await http.get('/api/discover/search-suggest', {
      params: { q },
    })
    if (id !== reqId) return
    const payload = data.data || {}
    mode.value = 'suggest'
    suggests.value = payload.suggests || []
  } catch {
    // ignore
  }
}

function scheduleFetch(q: string) {
  if (timer) clearTimeout(timer)
  if (!q) {
    mode.value = 'panel'
    timer = setTimeout(() => {
      void fetchPanel()
    }, 80)
    return
  }
  mode.value = 'suggest'
  timer = setTimeout(() => {
    void fetchSuggest(q)
  }, 180)
}

function playHotFirst() {
  if (hot.value[0]) emitSearch(hot.value[0].text)
}

async function playChart() {
  if (!user.accessToken) {
    ui.openLogin('login')
    return
  }
  try {
    const { data } = await http.get('/api/discover/charts/hot')
    const tracks = data.data?.tracks || []
    if (tracks.length) player.setQueue(tracks, 0)
  } catch {
    // ignore
  }
}

watch(
  () => [props.visible, props.keyword] as const,
  ([vis, kw]) => {
    if (!vis) return
    history.value = loadHistory()
    scheduleFetch(String(kw || '').trim())
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  reqId += 1
  if (timer) clearTimeout(timer)
})

defineExpose({ pushHistory })
</script>

<style scoped lang="scss">
.search-dropdown {
  max-height: min(640px, calc(100vh - 120px));
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0, 0, 0, 0.08);
  padding: 14px 16px 16px;
}
.sec {
  & + .sec {
    margin-top: 16px;
  }
}
.sec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.sec-title {
  font-size: 14px;
  font-weight: 700;
  color: #333;
}
.icon-plain,
.play-mini {
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  &:hover {
    background: #f2f2f2;
    color: #666;
  }
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tag-pill {
  border: none;
  background: #f2f3f4;
  color: #555;
  font-size: 12px;
  line-height: 1;
  padding: 8px 12px;
  border-radius: 999px;
  cursor: pointer;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  &:hover {
    background: #ebebeb;
    color: #333;
  }
}
.tag-more {
  width: 30px;
  padding: 8px 0;
  display: grid;
  place-items: center;
}
.board {
  background: #f7f7f8;
  border-radius: 10px;
  padding: 12px 12px 8px;
}
.rank-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px 8px;
}
.rank-item {
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 34px;
  padding: 0 4px;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
}
.rank-num {
  width: 16px;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  color: #bbb;
  text-align: center;
  &.top {
    color: #ec4141;
  }
}
.rank-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge-hot {
  flex-shrink: 0;
  font-size: 10px;
  color: #fff;
  background: #ec4141;
  border-radius: 3px;
  padding: 0 3px;
  line-height: 14px;
}
.badge-up {
  flex-shrink: 0;
  font-size: 12px;
  color: #ec4141;
  font-weight: 700;
}
.suggest-row {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 6px;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  &:hover {
    background: #f5f5f5;
  }
}
.suggest-icon {
  color: #bbb;
  font-size: 14px;
}
.suggest-text {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag {
  flex-shrink: 0;
  font-size: 11px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
}
.tag-hot {
  color: #ec4141;
  background: rgba(236, 65, 65, 0.12);
}
.tag-lyric {
  color: #507afe;
  background: rgba(80, 122, 254, 0.12);
}
.empty-tip {
  padding: 24px 0;
  text-align: center;
  color: #aaa;
  font-size: 13px;
}
</style>
