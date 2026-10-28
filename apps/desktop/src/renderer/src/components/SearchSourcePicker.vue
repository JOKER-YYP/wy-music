<template>
  <div class="source-picker" :class="{ disabled }">
    <div class="picker-head">
      <span class="picker-label">搜索音源</span>
      <button type="button" class="link-btn" :disabled="disabled" @click="selectAll">全选</button>
      <button type="button" class="link-btn" :disabled="disabled" @click="clearAll">清空</button>
      <span class="picker-count">已选 {{ modelValue.length }}/{{ allSources.length }}</span>
    </div>
    <div class="picker-tags">
      <label
        v-for="s in allSources"
        :key="s"
        class="wy-chip picker-tag"
        :class="{ 'is-on': selectedSet.has(s) }"
      >
        <input
          type="checkbox"
          :checked="selectedSet.has(s)"
          :disabled="disabled"
          @change="toggle(s, ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ labels[s] || s }}</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MusicSource } from '@wy-music/shared'
import { MUSIC_SOURCES, MUSIC_SOURCE_LABEL } from '@wy-music/shared'
import { normalizeSearchSources } from '../services/searchSources'

const props = defineProps<{
  modelValue: MusicSource[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [MusicSource[]]
}>()

const allSources = MUSIC_SOURCES
const labels = MUSIC_SOURCE_LABEL
const disabled = computed(() => Boolean(props.disabled))
const selectedSet = computed(() => new Set(props.modelValue))

function emitNext(next: MusicSource[]) {
  emit('update:modelValue', normalizeSearchSources(next))
}

function toggle(source: MusicSource, checked: boolean) {
  const set = new Set(props.modelValue)
  if (checked) set.add(source)
  else set.delete(source)
  // 不允许空选：至少保留当前这一项
  if (!set.size) set.add(source)
  emitNext([...set])
}

function selectAll() {
  emitNext([...MUSIC_SOURCES])
}

function clearAll() {
  // 清空后默认保留第一个，避免搜不到任何源
  emitNext([MUSIC_SOURCES[0]])
}
</script>

<style scoped lang="scss">
.source-picker {
  &.disabled {
    opacity: 0.65;
    pointer-events: none;
  }
}
.picker-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  margin-bottom: 8px;
}
.picker-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--wy-text);
}
.link-btn {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 12px;
  color: var(--wy-brand);
  cursor: pointer;
  &:hover:not(:disabled) {
    text-decoration: underline;
  }
  &:focus-visible {
    box-shadow: var(--wy-focus-ring);
    border-radius: 2px;
  }
}
.picker-count {
  font-size: 12px;
  color: var(--wy-text-muted);
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.picker-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.picker-tag {
  height: auto;
  min-height: 28px;
  padding: 5px 10px 5px 8px;
  line-height: 1.25;
  white-space: normal;
}
</style>
