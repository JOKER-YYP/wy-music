<template>
  <div>
    <div class="head">
      <h2>公共曲库</h2>
      <el-pagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="total, prev, pager, next"
        @current-change="load"
      />
    </div>
    <TrackTable :tracks="list" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { TrackDto } from '@wy-music/shared'
import { http } from '../services/http'
import TrackTable from '../components/TrackTable.vue'

const route = useRoute()
const list = ref<TrackDto[]>([])
const page = ref(1)
const pageSize = 20
const total = ref(0)

async function load() {
  const { data } = await http.get('/api/tracks', {
    params: {
      page: page.value,
      pageSize,
      keyword: route.query.keyword || '',
    },
  })
  list.value = data.data.list
  total.value = data.data.total
}

onMounted(load)
watch(() => route.query.keyword, () => {
  page.value = 1
  load()
})
</script>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
h2 {
  margin: 0;
}
</style>
