import type { BatchQueryRow, BatchSearchHit, MatchConfidence } from './batchSearchImport'

const META_KEY = 'wy-batch-jobs-meta-v1'
const DATA_PREFIX = 'wy-batch-job-data-v1:'
const MAX_JOBS = 20
/** 单任务结果过大则只保留摘要（约略估算） */
const MAX_SNAPSHOT_CHARS = 4_500_000

export type BatchJobStatus = 'running' | 'done' | 'cancelled' | 'failed'

export type BatchJobMeta = {
  id: string
  name: string
  createdAt: string
  finishedAt?: string
  status: BatchJobStatus
  queryCount: number
  hitCount: number
  exactCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  /** 是否存了可恢复的结果快照 */
  hasSnapshot: boolean
  errorMessage?: string
}

export type BatchJobSnapshot = {
  queries: BatchQueryRow[]
  hits: BatchSearchHit[]
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function listBatchJobMeta(): BatchJobMeta[] {
  const list = safeParse<BatchJobMeta[]>(localStorage.getItem(META_KEY), [])
  return Array.isArray(list) ? list : []
}

function saveMetaList(list: BatchJobMeta[]) {
  localStorage.setItem(META_KEY, JSON.stringify(list.slice(0, MAX_JOBS)))
}

function dataKey(id: string) {
  return `${DATA_PREFIX}${id}`
}

export function loadBatchJobSnapshot(id: string): BatchJobSnapshot | null {
  const raw = localStorage.getItem(dataKey(id))
  if (!raw) return null
  const data = safeParse<BatchJobSnapshot | null>(raw, null)
  if (!data || !Array.isArray(data.queries) || !Array.isArray(data.hits)) return null
  // 兼容旧快照无 confidence
  data.hits = data.hits.map((h) => {
    if (h.confidence) return h
    const exact = Boolean(h.exactMatch)
    const score = Number(h.score) || 0
    const confidence: MatchConfidence =
      exact || score >= 200 ? 'high' : score >= 100 ? 'medium' : 'low'
    return { ...h, confidence }
  })
  return data
}

export function deleteBatchJob(id: string) {
  const next = listBatchJobMeta().filter((j) => j.id !== id)
  saveMetaList(next)
  try {
    localStorage.removeItem(dataKey(id))
  } catch {
    /* ignore */
  }
}

export function clearAllBatchJobs() {
  for (const j of listBatchJobMeta()) {
    try {
      localStorage.removeItem(dataKey(j.id))
    } catch {
      /* ignore */
    }
  }
  saveMetaList([])
}

function upsertMeta(meta: BatchJobMeta) {
  const list = listBatchJobMeta().filter((j) => j.id !== meta.id)
  list.unshift(meta)
  // 淘汰多余任务的数据
  const dropped = list.slice(MAX_JOBS)
  for (const d of dropped) {
    try {
      localStorage.removeItem(dataKey(d.id))
    } catch {
      /* ignore */
    }
  }
  saveMetaList(list)
}

export function createRunningBatchJob(opts: {
  name: string
  queryCount: number
}): BatchJobMeta {
  const meta: BatchJobMeta = {
    id: `bj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: opts.name,
    createdAt: new Date().toISOString(),
    status: 'running',
    queryCount: opts.queryCount,
    hitCount: 0,
    exactCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    hasSnapshot: false,
  }
  upsertMeta(meta)
  return meta
}

export function finishBatchJob(opts: {
  id: string
  status: Exclude<BatchJobStatus, 'running'>
  queries: BatchQueryRow[]
  hits: BatchSearchHit[]
  errorMessage?: string
}): BatchJobMeta | null {
  const list = listBatchJobMeta()
  const prev = list.find((j) => j.id === opts.id)
  if (!prev) return null

  const exactCount = opts.hits.filter((h) => h.exactMatch).length
  const highCount = opts.hits.filter((h) => h.confidence === 'high').length
  const mediumCount = opts.hits.filter((h) => h.confidence === 'medium').length
  const lowCount = opts.hits.filter((h) => h.confidence === 'low').length

  let hasSnapshot = false
  try {
    const payload: BatchJobSnapshot = { queries: opts.queries, hits: opts.hits }
    const raw = JSON.stringify(payload)
    if (raw.length <= MAX_SNAPSHOT_CHARS) {
      localStorage.setItem(dataKey(opts.id), raw)
      hasSnapshot = true
    }
  } catch {
    hasSnapshot = false
  }

  const meta: BatchJobMeta = {
    ...prev,
    status: opts.status,
    finishedAt: new Date().toISOString(),
    queryCount: opts.queries.length || prev.queryCount,
    hitCount: opts.hits.length,
    exactCount,
    highCount,
    mediumCount,
    lowCount,
    hasSnapshot,
    errorMessage: opts.errorMessage,
  }
  upsertMeta(meta)
  return meta
}

export function updateRunningJobProgress(id: string, hitCount: number) {
  const list = listBatchJobMeta()
  const idx = list.findIndex((j) => j.id === id)
  if (idx < 0) return
  list[idx] = { ...list[idx], hitCount }
  saveMetaList(list)
}
