<template>
  <el-input
    v-if="editing"
    ref="inputRef"
    v-model="draft"
    size="small"
    :placeholder="placeholder"
    :class="{ 'need-artist': showWarn }"
    @click.stop
    @blur="commit"
    @keydown.enter="blurSelf"
  />
  <span
    v-else
    class="cell-edit"
    :class="{ 'need-artist-text': showWarn }"
    :title="display || undefined"
    @click.stop="startEdit"
  >
    {{ display || emptyText }}
  </span>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { InputInstance } from 'element-plus'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    emptyText?: string
    /** 按当前展示文案判断是否为未知歌手（避免父级整表刷新） */
    checkUnknownArtist?: boolean
  }>(),
  {
    placeholder: '',
    emptyText: '—',
    checkUnknownArtist: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

/** 编辑状态留在单元格内部，避免父级 editingCell 变更导致整表重渲染 */
const editing = ref(false)
const draft = ref('')
const display = ref(props.modelValue || '')
const inputRef = ref<InputInstance>()

const showWarn = computed(() => {
  if (!props.checkUnknownArtist) return false
  const parts = display.value
    .split(/[,，/、]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return !parts.length || parts.every((x) => x === '未知歌手')
})

watch(
  () => props.modelValue,
  (v) => {
    if (!editing.value) display.value = v || ''
  },
)

function startEdit() {
  draft.value = display.value
  editing.value = true
  void nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
}

function commit() {
  if (!editing.value) return
  const next = draft.value.trim()
  display.value = next
  editing.value = false
  if (next !== (props.modelValue || '')) {
    emit('update:modelValue', next)
  }
}

function blurSelf() {
  const el = document.activeElement as HTMLElement | null
  el?.blur?.()
}
</script>

<style scoped>
.cell-edit {
  display: inline-block;
  width: 100%;
  min-height: 24px;
  line-height: 24px;
  padding: 0 4px;
  border-radius: 4px;
  cursor: text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}
.cell-edit:hover {
  background: rgba(0, 0, 0, 0.04);
}
.need-artist-text {
  color: #e6a23c;
}
:deep(.need-artist .el-input__wrapper) {
  box-shadow: 0 0 0 1px #e6a23c inset;
}
</style>
