<template>
  <div>
    <h2>我喜欢的音乐</h2>
    <TrackTable :tracks="list" @refresh="load" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { TrackDto } from '@wy-music/shared'
import { http } from '../services/http'
import TrackTable from '../components/TrackTable.vue'

const list = ref<TrackDto[]>([])
async function load() {
  const { data } = await http.get('/api/likes')
  list.value = data.data
}
onMounted(load)
</script>
