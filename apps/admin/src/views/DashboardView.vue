<template>
  <div ref="dashRoot" v-loading="loading" class="admin-page dash">
    <div class="admin-page-head">
      <div>
        <h2 class="admin-page-title">运营概览</h2>
        <p class="admin-page-desc">曲库播放、收藏与下载数据一览</p>
      </div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>

    <el-row :gutter="14" class="kpi-row">
      <el-col v-for="item in cards" :key="item.label" :xs="12" :sm="8" :md="6" :lg="3" :xl="3">
        <div
          class="kpi"
          :class="{ clickable: !!item.to }"
          @click="item.to && $router.push(item.to)"
        >
          <div class="kpi-label">{{ item.label }}</div>
          <div class="kpi-value">{{ item.value }}</div>
          <div v-if="item.hint" class="kpi-hint">{{ item.hint }}</div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="14" class="chart-row">
      <el-col :xs="24" :lg="14">
        <div class="panel">
          <div class="panel-head">
            <h3>近 7 日上传 / 播放</h3>
          </div>
          <div ref="trendRef" class="chart chart-lg" />
        </div>
      </el-col>
      <el-col :xs="24" :lg="10">
        <div class="panel">
          <div class="panel-head">
            <h3>曲库状态分布</h3>
            <span class="panel-sub">存储 {{ storageText }}</span>
          </div>
          <div ref="statusRef" class="chart chart-lg" />
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="14" class="chart-row">
      <el-col :xs="24" :lg="12">
        <div class="panel">
          <div class="panel-head"><h3>播放量排行 TOP10</h3></div>
          <div ref="playRankRef" class="chart chart-rank" />
        </div>
      </el-col>
      <el-col :xs="24" :lg="12">
        <div class="panel">
          <div class="panel-head"><h3>喜欢 / 收藏排行 TOP10</h3></div>
          <div ref="likeRankRef" class="chart chart-rank" />
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="14" class="chart-row">
      <el-col :xs="24" :lg="12">
        <div class="panel">
          <div class="panel-head"><h3>下载量排行 TOP10</h3></div>
          <div ref="downloadRankRef" class="chart chart-rank" />
        </div>
      </el-col>
      <el-col :xs="24" :lg="12">
        <div class="panel">
          <div class="panel-head"><h3>歌单收录排行 TOP10</h3></div>
          <div ref="collectRankRef" class="chart chart-rank" />
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { DashboardRankItem, DashboardStats } from '@wy-music/shared'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsType } from 'echarts/core'
import { http } from '../services/http'
import { formatBytes } from '../services/media'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
])

const BRAND = '#ec4141'
const SERIES_A = '#5c6bc0'
const SERIES_B = '#26a69a'
const SERIES_C = '#78909c'
const STATUS_COLORS = ['#26a69a', '#ffa726', '#ec4141', '#90a4ae']

const loading = ref(false)
const stats = ref<DashboardStats | null>(null)

const dashRoot = ref<HTMLElement | null>(null)
const trendRef = ref<HTMLElement | null>(null)
const statusRef = ref<HTMLElement | null>(null)
const playRankRef = ref<HTMLElement | null>(null)
const likeRankRef = ref<HTMLElement | null>(null)
const downloadRankRef = ref<HTMLElement | null>(null)
const collectRankRef = ref<HTMLElement | null>(null)

const charts = shallowRef<EChartsType[]>([])
let resizeObserver: ResizeObserver | null = null

const storageText = computed(() => formatBytes(stats.value?.storageBytes || 0))

const cards = computed(() => [
  { label: '用户', value: stats.value?.userCount ?? '-', to: '/users' },
  { label: '歌曲', value: stats.value?.trackCount ?? '-', to: '/tracks' },
  { label: '已发布', value: stats.value?.publishedCount ?? '-', to: '/tracks?status=published' },
  { label: '待审核', value: stats.value?.pendingCount ?? '-', to: '/tracks?status=pending' },
  { label: '今日播放', value: stats.value?.todayPlayCount ?? '-' },
  {
    label: '播放总量',
    value: formatCompact(stats.value?.totalPlayCount),
    hint: '曲库累计',
  },
  {
    label: '喜欢数',
    value: formatCompact(stats.value?.likeCount),
    hint: '用户收藏',
  },
  {
    label: '下载总量',
    value: formatCompact(stats.value?.totalDownloadCount),
    hint: '入库/本地下载',
  },
])

function formatCompact(n?: number) {
  if (n == null) return '-'
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n)
}

function statusLabel(s: string) {
  return (
    {
      pending: '待审核',
      published: '已发布',
      rejected: '已驳回',
      offline: '已下架',
    }[s] || s
  )
}

function disposeCharts() {
  for (const c of charts.value) c.dispose()
  charts.value = []
}

function mountChart(el: HTMLElement | null) {
  if (!el) return null
  const chart = echarts.init(el)
  charts.value.push(chart)
  return chart
}

function shortName(name: string, max = 10) {
  const s = String(name || '')
  return s.length > max ? `${s.slice(0, max)}…` : s
}

function rankOption(list: DashboardRankItem[], color: string, emptyText: string) {
  const rows = [...(list || [])].reverse()
  if (!rows.length) {
    return {
      title: {
        text: emptyText,
        left: 'center',
        top: 'middle',
        textStyle: { color: '#999', fontSize: 13, fontWeight: 400 },
      },
    }
  }
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: unknown) => {
        const p = Array.isArray(params) ? params[0] : params
        const item = p as { dataIndex: number; value: number }
        const row = rows[item.dataIndex]
        const artists = row?.artists?.join(' / ') || ''
        return `${row?.name || ''}<br/>${artists}<br/><b>${item.value}</b>`
      },
    },
    grid: { left: 110, right: 28, top: 16, bottom: 16 },
    xAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { type: 'dashed', color: '#eee' } },
      axisLabel: { color: '#999' },
    },
    yAxis: {
      type: 'category',
      data: rows.map((r) => shortName(r.name)),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: '#666', width: 96, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data: rows.map((r) => r.value),
        barMaxWidth: 18,
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color,
        },
        label: {
          show: true,
          position: 'right',
          color: '#666',
          fontSize: 11,
        },
      },
    ],
  }
}

function renderCharts() {
  disposeCharts()
  const s = stats.value
  if (!s) return

  const trend = mountChart(trendRef.value)
  trend?.setOption({
    color: [BRAND, SERIES_A],
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['上传', '播放'],
      top: 0,
      right: 0,
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: '#5c5c66' },
    },
    grid: { left: 40, right: 20, top: 36, bottom: 28 },
    xAxis: {
      type: 'category',
      data: (s.trends || []).map((t) => t.date.slice(5)),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#e6e8ee' } },
      axisLabel: { color: '#8a8a96' },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { type: 'dashed', color: '#eef0f4' } },
      axisLabel: { color: '#8a8a96' },
    },
    series: [
      {
        name: '上传',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        areaStyle: { color: 'rgba(236,65,65,0.08)' },
        data: (s.trends || []).map((t) => t.uploadCount),
      },
      {
        name: '播放',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 8,
        areaStyle: { color: 'rgba(92,107,192,0.08)' },
        data: (s.trends || []).map((t) => t.playCount),
      },
    ],
  })

  const status = mountChart(statusRef.value)
  const dist = s.statusDistribution || []
  status?.setOption({
    color: STATUS_COLORS,
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: {
      orient: 'vertical',
      right: 8,
      top: 'middle',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: '#5c5c66' },
    },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['38%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        data: dist.length
          ? dist.map((d) => ({ name: statusLabel(d.status), value: d.count }))
          : [{ name: '暂无数据', value: 1 }],
      },
    ],
  })

  mountChart(playRankRef.value)?.setOption(
    rankOption(s.topPlays || [], BRAND, '暂无播放数据'),
  )
  mountChart(likeRankRef.value)?.setOption(
    rankOption(s.topLikes || [], SERIES_B, '暂无喜欢数据'),
  )
  mountChart(downloadRankRef.value)?.setOption(
    rankOption(s.topDownloads || [], SERIES_A, '暂无下载数据'),
  )
  mountChart(collectRankRef.value)?.setOption(
    rankOption(s.topCollected || [], SERIES_C, '暂无收录数据'),
  )
}

function onResize() {
  for (const c of charts.value) c.resize()
}

async function load() {
  loading.value = true
  try {
    const { data } = await http.get('/api/admin/dashboard')
    stats.value = data.data
    await nextTick()
    renderCharts()
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void load()
  window.addEventListener('resize', onResize)
  if (dashRoot.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => onResize())
    resizeObserver.observe(dashRoot.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  resizeObserver?.disconnect()
  resizeObserver = null
  disposeCharts()
})
</script>

<style scoped>
.dash {
  width: 100%;
  max-width: none;
  min-width: 0;
  padding-bottom: 8px;
}
.kpi-row {
  margin-bottom: 4px;
}
.kpi {
  background: var(--wy-surface);
  border: 1px solid var(--wy-border);
  border-radius: var(--wy-radius-md);
  padding: 14px 16px;
  margin-bottom: 14px;
  min-height: 88px;
  transition:
    border-color var(--wy-duration-fast) var(--wy-ease),
    box-shadow var(--wy-duration-fast) var(--wy-ease);
}
.kpi:hover {
  border-color: rgba(236, 65, 65, 0.28);
  box-shadow: var(--wy-shadow-sm);
}
.kpi.clickable {
  cursor: pointer;
}
.kpi-label {
  font-size: 12px;
  color: var(--wy-text-muted);
}
.kpi-value {
  margin-top: 8px;
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--wy-brand);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.kpi-hint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--wy-text-muted);
}
.chart-row {
  margin-bottom: 2px;
}
.panel {
  background: var(--wy-surface);
  border: 1px solid var(--wy-border);
  border-radius: var(--wy-radius-md);
  padding: 14px 16px 8px;
  margin-bottom: 14px;
  width: 100%;
  min-width: 0;
}
.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.panel-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--wy-text);
}
.panel-sub {
  font-size: 12px;
  color: var(--wy-text-muted);
}
.chart {
  width: 100%;
  min-width: 0;
}
.chart-lg {
  height: 320px;
}
.chart-rank {
  height: 360px;
}
</style>
