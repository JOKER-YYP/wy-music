import { defineStore } from 'pinia'
import { ElMessage } from 'element-plus'
import type { MusicSource, TrackDto } from '@wy-music/shared'
import {
  parseBatchSearchFile,
  runBatchExternalSearch,
  type BatchQueryProgress,
  type BatchQueryRow,
  type BatchSearchHit,
} from '../services/batchSearchImport'
import {
  downloadTracksToFolder,
  downloadTracksToLibrary,
  pickBatchDownloadMode,
  type BatchDownloadFailItem,
} from '../services/trackDownload'
import { notifyBatchJobDone } from '../services/jobNotify'
import { loadSearchSources } from '../services/searchSources'
import { useUserStore } from './user'
import { useUiStore } from './ui'

function enrichFailures(
  failures: BatchDownloadFailItem[],
  selectedHits: BatchSearchHit[],
): BatchDownloadFailItem[] {
  const byId = new Map(selectedHits.map((h) => [h.track.id, h]))
  return failures.map((f) => {
    const hit = byId.get(f.trackId)
    return {
      ...f,
      queryIndex: hit?.queryIndex ?? f.queryIndex,
      source: hit ? String(hit.track.source || '') : f.source,
    }
  })
}

export const useBatchJobsStore = defineStore('batchJobs', {
  state: () => ({
    queries: [] as BatchQueryRow[],
    hits: [] as BatchSearchHit[],
    selectedKeys: [] as string[],
    searching: false,
    downloading: false,
    downloadTip: '',
    failList: [] as BatchDownloadFailItem[],
    progress: { total: 0, done: 0 } as BatchQueryProgress,
    enabledSources: loadSearchSources() as MusicSource[],
    selectMode: 'first' as 'all' | 'first',
    exactOnly: true,
    filterSource: null as string | null,
    pickedSources: [] as string[],
    hideUnmatched: false,
    page: 1,
    pageSize: 100,
    /** 内部取消标记（非响应式对象，避免被代理） */
    _searchCancel: { cancelled: false } as { cancelled: boolean },
    _downloadCancel: { cancelled: false } as { cancelled: boolean },
    _pendingHits: [] as BatchSearchHit[],
    _flushTimer: null as ReturnType<typeof setTimeout> | null,
    _searchToken: 0,
    _downloadToken: 0,
  }),
  getters: {
    selectedKeySet(state): Set<string> {
      return new Set(state.selectedKeys)
    },
    selectedCount(state): number {
      return state.selectedKeys.length
    },
    progressPct(state): number {
      if (!state.progress.total) return 0
      return Math.min(100, Math.round((state.progress.done / state.progress.total) * 100))
    },
    isBusy(state): boolean {
      return state.searching || state.downloading
    },
    busyLabel(state): string {
      if (state.searching) {
        const p = state.progress
        return `批量搜索中 ${p.done}/${p.total}${p.current ? ` · ${p.current}` : ''}`
      }
      if (state.downloading) {
        return state.downloadTip || '批量下载中…'
      }
      return ''
    },
  },
  actions: {
    setEnabledSources(list: MusicSource[]) {
      this.enabledSources = list
    },

    setSelectedKeys(keys: Iterable<string>) {
      this.selectedKeys = [...new Set(keys)]
    },

    patchSelectedKeys(mutator: (set: Set<string>) => void) {
      const next = new Set(this.selectedKeys)
      mutator(next)
      this.selectedKeys = [...next]
    },

    cancelSearch() {
      this._searchCancel.cancelled = true
    },

    cancelDownload() {
      this._downloadCancel.cancelled = true
    },

    clearResults() {
      if (this.searching || this.downloading) {
        ElMessage.warning('任务进行中，请先取消或等待完成')
        return
      }
      this.flushPendingHits()
      this.hits = []
      this.queries = []
      this.selectedKeys = []
      this.downloadTip = ''
      this.failList = []
      this.page = 1
      this.filterSource = null
      this.pickedSources = []
      this.selectMode = 'first'
      this.exactOnly = true
      this.hideUnmatched = false
      this.progress = { total: 0, done: 0 }
    },

    flushPendingHits() {
      if (this._flushTimer) {
        clearTimeout(this._flushTimer)
        this._flushTimer = null
      }
      if (!this._pendingHits.length) return
      const chunk = this._pendingHits
      this._pendingHits = []
      this.hits = this.hits.concat(chunk)
    },

    queueHits(chunk: BatchSearchHit[]) {
      if (!chunk.length) return
      this._pendingHits.push(...chunk)
      if (this._flushTimer) return
      this._flushTimer = setTimeout(() => {
        this._flushTimer = null
        this.flushPendingHits()
      }, 400)
    },

    /** 从 Excel 文件启动批量搜索（可切页继续） */
    async startSearchFromFile(file: File) {
      if (this.searching) {
        ElMessage.warning('已有搜索任务在进行中')
        return
      }
      if (this.downloading) {
        ElMessage.warning('下载进行中，请稍后再搜')
        return
      }

      const rows = await parseBatchSearchFile(file)
      this.queries = rows
      this.hits = []
      this._pendingHits = []
      if (this._flushTimer) {
        clearTimeout(this._flushTimer)
        this._flushTimer = null
      }
      this.selectedKeys = []
      this.failList = []
      this.page = 1
      this.filterSource = null
      this.pickedSources = []
      this.hideUnmatched = false
      this._searchCancel = { cancelled: false }
      this.searching = true
      this.progress = { total: rows.length, done: 0 }
      const token = ++this._searchToken

      if (rows.length > 50) {
        ElMessage.info(`共 ${rows.length} 条，可切换其它页面，完成后来「通知」查看`)
      } else {
        ElMessage.info('搜索已开始，可切换页面，完成后会通知你')
      }

      try {
        const list = await runBatchExternalSearch(rows, {
          perSource: 3,
          pageSize: 20,
          sources: [...this.enabledSources],
          onProgress: (p) => {
            if (token !== this._searchToken) return
            this.progress = { ...p }
          },
          onHits: (chunk) => {
            if (token !== this._searchToken) return
            this.queueHits(chunk)
          },
          signal: this._searchCancel,
        })
        if (token !== this._searchToken) return
        this.flushPendingHits()
        this.hits = list

        const cancelled = this._searchCancel.cancelled
        const exactCount = list.filter((h) => h.exactMatch).length
        if (cancelled) {
          ElMessage.info(`已取消，当前得到 ${list.length} 首`)
        } else if (!list.length) {
          ElMessage.warning('未搜索到匹配结果')
          void notifyBatchJobDone({
            kind: 'batch_search_done',
            title: '批量搜歌完成',
            body: `清单 ${rows.length} 条，未搜索到匹配结果。点击返回。`,
          })
        } else {
          void notifyBatchJobDone({
            kind: 'batch_search_done',
            title: '批量搜歌完成',
            body: `清单 ${rows.length} 条 · 候选 ${list.length} 首 · 完全匹配约 ${exactCount} 首。点击查看结果。`,
          })
        }
      } catch (e: any) {
        if (token !== this._searchToken) return
        ElMessage.error(e?.message || '导入搜索失败')
      } finally {
        if (token === this._searchToken) this.searching = false
      }
    },

    /**
     * 批量下载已选结果。mode 可由外部传入；不传则弹窗选择。
     * @returns false 表示用户取消或未开始
     */
    async startDownload(opts?: {
      mode?: 'library' | 'folder'
      /** 自定义选中 hits；默认用 selectedKeys */
      hits?: BatchSearchHit[]
    }): Promise<boolean> {
      if (this.downloading) {
        ElMessage.warning('已有下载任务在进行中')
        return false
      }
      if (this.searching) {
        ElMessage.warning('搜索进行中，请稍后再下载')
        return false
      }

      const selected =
        opts?.hits ||
        this.hits.filter((h) => this.selectedKeys.includes(h.rowKey))
      if (!selected.length) {
        ElMessage.warning('请先勾选要下载的歌曲')
        return false
      }

      const seen = new Set<string>()
      const unique: TrackDto[] = []
      const uniqueHits: BatchSearchHit[] = []
      for (const h of selected) {
        const t = h.track
        if (!t?.id || seen.has(t.id)) continue
        seen.add(t.id)
        unique.push(t)
        uniqueHits.push(h)
      }

      const mode = opts?.mode || (await pickBatchDownloadMode())
      if (!mode) return false

      const user = useUserStore()
      const ui = useUiStore()
      if (mode === 'library' && !user.accessToken) {
        ui.openLogin('login')
        return false
      }

      this._downloadCancel = { cancelled: false }
      this.downloading = true
      this.downloadTip = ''
      this.failList = []
      const token = ++this._downloadToken
      ElMessage.info('下载已开始，可切换页面，完成后会通知你')

      try {
        if (mode === 'library') {
          const { ok, fail, failures } = await downloadTracksToLibrary(
            unique,
            (done, total, name) => {
              if (token !== this._downloadToken) return
              this.downloadTip =
                done >= total ? '' : `曲库下载中 ${done + 1}/${total}${name ? ` · ${name}` : ''}`
            },
            this._downloadCancel,
          )
          if (token !== this._downloadToken) return true
          this.failList = enrichFailures(failures, uniqueHits)
          const cancelled = this._downloadCancel.cancelled
          const title = cancelled ? '批量下载已取消' : '批量下载完成'
          const body = cancelled
            ? `已取消。成功 ${ok}，失败 ${fail}。点击查看详情。`
            : `曲库下载：成功 ${ok}，失败 ${fail}。点击查看详情。`
          void notifyBatchJobDone({ kind: 'batch_download_done', title, body })
          if (!cancelled) {
            if (fail) ElMessage.warning(`曲库下载完成：成功 ${ok}，失败 ${fail}`)
            else ElMessage.success(`曲库下载完成：成功 ${ok}`)
          }
        } else {
          const { ok, fail, failures, folder } = await downloadTracksToFolder(
            unique,
            (done, total, name) => {
              if (token !== this._downloadToken) return
              this.downloadTip =
                done >= total ? '' : `本地下载中 ${done + 1}/${total}${name ? ` · ${name}` : ''}`
            },
            this._downloadCancel,
          )
          if (token !== this._downloadToken) return true
          if (!folder) return false
          this.failList = enrichFailures(failures, uniqueHits)
          const cancelled = this._downloadCancel.cancelled
          const title = cancelled ? '批量下载已取消' : '批量下载完成'
          const body = cancelled
            ? `已取消。成功 ${ok}，失败 ${fail}。点击查看详情。`
            : `已保存到文件夹：成功 ${ok}，失败 ${fail}。点击查看详情。`
          void notifyBatchJobDone({ kind: 'batch_download_done', title, body })
          if (!cancelled) {
            if (fail) ElMessage.warning(`已保存到文件夹：成功 ${ok}，失败 ${fail}`)
            else ElMessage.success(`已保存到文件夹：成功 ${ok}`)
          }
        }
        return true
      } catch (e: any) {
        if (token !== this._downloadToken) return true
        ElMessage.error(e?.message || '批量下载失败')
        return false
      } finally {
        if (token === this._downloadToken) {
          this.downloading = false
          this.downloadTip = ''
        }
      }
    },
  },
})
