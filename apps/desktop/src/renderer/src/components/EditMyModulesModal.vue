<template>
  <Teleport to="body">
    <div v-if="visible" class="mask" @click.self="onCancel">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="edit-modules-title">
        <button class="close" type="button" aria-label="关闭" @click="onCancel">
          <el-icon :size="18"><Close /></el-icon>
        </button>

        <h2 id="edit-modules-title" class="title">编辑我的模块</h2>
        <p class="hint">拖动可调整功能常驻和排列顺序</p>

        <div class="list">
          <div
            v-for="(item, index) in pinnedDraft"
            :key="'p-' + item"
            class="row"
            :class="{
              dragging: drag?.id === item && drag.zone === 'pinned',
              'drag-over': over?.zone === 'pinned' && over.index === index,
            }"
            :draggable="!isFixed(item)"
            @dragstart="onDragStart($event, 'pinned', index, item)"
            @dragend="onDragEnd"
            @dragover.prevent="onDragOver('pinned', index)"
            @drop.prevent="onDrop('pinned', index)"
          >
            <span class="label">{{ labelOf(item) }}</span>
            <span v-if="isFixed(item)" class="fixed-tag">常驻</span>
            <span v-else class="handle" title="拖动排序" aria-hidden="true">☰</span>
          </div>

          <div
            class="divider"
            @dragover.prevent="onDragOver('folded', 0)"
            @drop.prevent="onDrop('folded', 0)"
          >
            移到下方的功能折叠后收起
          </div>

          <div
            v-for="(item, index) in foldedDraft"
            :key="'f-' + item"
            class="row"
            :class="{
              dragging: drag?.id === item && drag.zone === 'folded',
              'drag-over': over?.zone === 'folded' && over.index === index,
            }"
            draggable="true"
            @dragstart="onDragStart($event, 'folded', index, item)"
            @dragend="onDragEnd"
            @dragover.prevent="onDragOver('folded', index)"
            @drop.prevent="onDrop('folded', index)"
          >
            <span class="label">{{ labelOf(item) }}</span>
            <span class="handle" title="拖动排序" aria-hidden="true">☰</span>
          </div>

          <div
            v-if="!foldedDraft.length"
            class="drop-zone"
            @dragover.prevent="onDragOver('folded', 0)"
            @drop.prevent="onDrop('folded', 0)"
          >
            拖到此处，折叠后收起
          </div>
        </div>

        <button class="done" type="button" @click="onDone">完成</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Close } from '@element-plus/icons-vue'
import {
  MY_MODULE_DEFS,
  useMyModulesStore,
  type MyModuleId,
} from '../stores/myModules'

const store = useMyModulesStore()
const visible = computed(() => store.editOpen)

const pinnedDraft = ref<MyModuleId[]>([])
const foldedDraft = ref<MyModuleId[]>([])

type Zone = 'pinned' | 'folded'
const drag = ref<{ zone: Zone; index: number; id: MyModuleId } | null>(null)
const over = ref<{ zone: Zone; index: number } | null>(null)

watch(
  () => store.editOpen,
  (open) => {
    if (!open) return
    pinnedDraft.value = [...store.pinnedIds]
    foldedDraft.value = [...store.foldedIds]
    drag.value = null
    over.value = null
  },
)

function labelOf(id: MyModuleId) {
  return MY_MODULE_DEFS.find((d) => d.id === id)?.label || id
}

function isFixed(id: MyModuleId) {
  return Boolean(MY_MODULE_DEFS.find((d) => d.id === id)?.fixed)
}

function onCancel() {
  store.closeEdit()
}

function onDone() {
  store.applyOrder(pinnedDraft.value, foldedDraft.value)
}

function onDragStart(e: DragEvent, zone: Zone, index: number, id: MyModuleId) {
  if (zone === 'pinned' && isFixed(id)) {
    e.preventDefault()
    return
  }
  drag.value = { zone, index, id }
  e.dataTransfer?.setData('text/plain', id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragEnd() {
  drag.value = null
  over.value = null
}

function onDragOver(zone: Zone, index: number) {
  over.value = { zone, index }
}

function listOf(zone: Zone) {
  return zone === 'pinned' ? pinnedDraft : foldedDraft
}

function onDrop(zone: Zone, index: number) {
  const d = drag.value
  if (!d) return
  if (d.zone === 'pinned' && isFixed(d.id) && zone === 'folded') {
    drag.value = null
    over.value = null
    return
  }

  const from = listOf(d.zone)
  const to = listOf(zone)
  const [moved] = from.value.splice(d.index, 1)
  if (!moved) return

  let insertAt = index
  if (d.zone === zone && d.index < index) insertAt = Math.max(0, index - 1)
  insertAt = Math.min(insertAt, to.value.length)
  to.value.splice(insertAt, 0, moved)

  // 固定项始终置顶
  const fixed = pinnedDraft.value.filter((id) => isFixed(id))
  const rest = pinnedDraft.value.filter((id) => !isFixed(id))
  pinnedDraft.value = [...fixed, ...rest]
  foldedDraft.value = foldedDraft.value.filter((id) => !isFixed(id))

  drag.value = null
  over.value = null
}
</script>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  position: relative;
  width: 420px;
  max-width: calc(100vw - 48px);
  max-height: min(720px, calc(100vh - 64px));
  overflow: auto;
  background: #fff;
  border-radius: 12px;
  padding: 28px 28px 24px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
}

.close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #999;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.close:hover {
  background: #f5f5f5;
  color: #666;
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #333;
  text-align: center;
}

.hint {
  margin: 10px 0 18px;
  font-size: 13px;
  color: #999;
  text-align: center;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 8px 0 12px;
  border-radius: 8px;
  user-select: none;
}
.row[draggable='true'] {
  cursor: grab;
}
.row.dragging {
  opacity: 0.45;
}
.row.drag-over {
  background: #f7f7f7;
}

.label {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  color: #333;
}

.fixed-tag {
  font-size: 12px;
  color: #bbb;
  padding-right: 6px;
}

.handle {
  color: #c8c8c8;
  font-size: 16px;
  letter-spacing: -2px;
  padding: 4px 6px;
  line-height: 1;
}

.divider {
  margin: 10px 0 8px;
  padding: 10px 4px;
  font-size: 12px;
  color: #aaa;
  text-align: center;
  border-top: 1px solid #eee;
}

.drop-zone {
  margin-top: 4px;
  height: 44px;
  border: 1px dashed #ddd;
  border-radius: 8px;
  color: #bbb;
  font-size: 13px;
  display: grid;
  place-items: center;
}

.done {
  display: block;
  width: 160px;
  margin: 28px auto 4px;
  height: 40px;
  border: none;
  border-radius: 20px;
  background: #ec4141;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.done:hover {
  background: #e03535;
}
</style>
