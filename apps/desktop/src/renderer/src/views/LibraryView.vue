<template>
  <div class="library-page">
    <div class="head">
      <h2>公共曲库</h2>
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

    <TrackTable :tracks="list" />

    <div class="pager">
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        background
        layout="total, prev, pager, next"
        @current-change="load"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import type { TrackDto } from '@wy-music/shared'
import { http } from '../services/http'
import TrackTable from '../components/TrackTable.vue'

const route = useRoute()
const list = ref<TrackDto[]>([])
const page = ref(1)
const pageSize = 20
const total = ref(0)
const keyword = ref(String(route.query.keyword || ''))

let searchTimer: ReturnType<typeof setTimeout> | null = null

async function load() {
  const { data } = await http.get('/api/tracks', {
    params: {
      page: page.value,
      pageSize,
      keyword: keyword.value.trim(),
    },
  })
  list.value = data.data.list
  total.value = data.data.total
}

function onSearch() {
  page.value = 1
  load()
}

watch(keyword, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    page.value = 1
    load()
  }, 300)
})

watch(
  () => route.query.keyword,
  (v) => {
    const next = String(v || '')
    if (next !== keyword.value) keyword.value = next
  },
)

onMounted(load)
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
h2 {
  margin: 0;
  flex-shrink: 0;
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
