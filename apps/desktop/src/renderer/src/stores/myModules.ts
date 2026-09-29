import { defineStore } from 'pinia'
import type { Component } from 'vue'
import {
  Calendar,
  Clock,
  FolderOpened,
  Star,
} from '@element-plus/icons-vue'

export type MyModuleId = 'liked' | 'recent' | 'daily' | 'mine'

export interface MyModuleDef {
  id: MyModuleId
  label: string
  to: string
  icon: Component
  /** 固定常驻，不可移到折叠区 */
  fixed?: boolean
  auth?: boolean
}

export const MY_MODULE_DEFS: MyModuleDef[] = [
  { id: 'liked', label: '我喜欢的音乐', to: '/liked', icon: Star, fixed: true, auth: true },
  { id: 'recent', label: '最近播放', to: '/recent', icon: Clock, auth: true },
  { id: 'daily', label: '每日推荐', to: '/recommend/daily', icon: Calendar, auth: true },
  { id: 'mine', label: '我的上传', to: '/mine', icon: FolderOpened, auth: true },
]

const STORAGE_KEY = 'wy.myModules.v1'
const ALL_IDS = MY_MODULE_DEFS.map((d) => d.id)
const DEFAULT_PINNED: MyModuleId[] = ['liked', 'recent', 'daily']
const DEFAULT_FOLDED: MyModuleId[] = ['mine']

function uniqueValid(ids: string[]): MyModuleId[] {
  const known = new Set(ALL_IDS)
  const out: MyModuleId[] = []
  for (const id of ids) {
    if (!known.has(id as MyModuleId)) continue
    if (out.includes(id as MyModuleId)) continue
    out.push(id as MyModuleId)
  }
  return out
}

function normalize(pinned: MyModuleId[], folded: MyModuleId[]) {
  let p = uniqueValid(pinned)
  let f = uniqueValid(folded).filter((id) => !p.includes(id))

  for (const def of MY_MODULE_DEFS) {
    if (!def.fixed) continue
    f = f.filter((id) => id !== def.id)
    if (!p.includes(def.id)) p = [def.id, ...p]
  }

  const seen = new Set([...p, ...f])
  for (const id of ALL_IDS) {
    if (!seen.has(id)) f.push(id)
  }

  return { pinned: p, folded: f }
}

export const useMyModulesStore = defineStore('myModules', {
  state: () => ({
    pinnedIds: [...DEFAULT_PINNED] as MyModuleId[],
    foldedIds: [...DEFAULT_FOLDED] as MyModuleId[],
    foldedExpanded: true,
    editOpen: false,
  }),
  getters: {
    defMap(): Record<MyModuleId, MyModuleDef> {
      const map = {} as Record<MyModuleId, MyModuleDef>
      for (const d of MY_MODULE_DEFS) map[d.id] = d
      return map
    },
    pinnedModules(): MyModuleDef[] {
      return this.pinnedIds.map((id) => this.defMap[id]).filter(Boolean)
    },
    foldedModules(): MyModuleDef[] {
      return this.foldedIds.map((id) => this.defMap[id]).filter(Boolean)
    },
    sidebarModules(): MyModuleDef[] {
      if (this.foldedExpanded) {
        return [...this.pinnedModules, ...this.foldedModules]
      }
      return [...this.pinnedModules]
    },
  },
  actions: {
    restore() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) {
          const n = normalize(DEFAULT_PINNED, DEFAULT_FOLDED)
          this.pinnedIds = n.pinned
          this.foldedIds = n.folded
          return
        }
        const parsed = JSON.parse(raw) as {
          pinnedIds?: string[]
          foldedIds?: string[]
          foldedExpanded?: boolean
        }
        const n = normalize(
          (parsed.pinnedIds || DEFAULT_PINNED) as MyModuleId[],
          (parsed.foldedIds || DEFAULT_FOLDED) as MyModuleId[],
        )
        this.pinnedIds = n.pinned
        this.foldedIds = n.folded
        if (typeof parsed.foldedExpanded === 'boolean') {
          this.foldedExpanded = parsed.foldedExpanded
        }
      } catch {
        const n = normalize(DEFAULT_PINNED, DEFAULT_FOLDED)
        this.pinnedIds = n.pinned
        this.foldedIds = n.folded
      }
    },
    persist() {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          pinnedIds: this.pinnedIds,
          foldedIds: this.foldedIds,
          foldedExpanded: this.foldedExpanded,
        }),
      )
    },
    openEdit() {
      this.editOpen = true
    },
    closeEdit() {
      this.editOpen = false
    },
    applyOrder(pinned: MyModuleId[], folded: MyModuleId[]) {
      const n = normalize(pinned, folded)
      this.pinnedIds = n.pinned
      this.foldedIds = n.folded
      this.persist()
      this.editOpen = false
    },
    toggleFoldedExpanded() {
      this.foldedExpanded = !this.foldedExpanded
      this.persist()
    },
  },
})
