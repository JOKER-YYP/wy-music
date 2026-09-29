<template>
  <Teleport to="body">
    <button
      v-show="visible"
      type="button"
      class="playing-locate-fab"
      :class="mode"
      title="定位到当前播放"
      @click="emit('click')"
    >
      <span class="locate-ico" aria-hidden="true" />
    </button>
  </Teleport>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    visible: boolean
    /** page：相对主内容固定；panel：由外层 absolute 容器定位时仍用 fixed 兜底 */
    mode?: 'page' | 'panel'
  }>(),
  { mode: 'page' },
)

const emit = defineEmits<{ click: [] }>()
</script>

<style scoped lang="scss">
.playing-locate-fab {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.16);
  cursor: pointer;
  display: grid;
  place-items: center;
  padding: 0;
  z-index: 50;
  &:hover {
    background: #fafafa;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  }
  &.page {
    position: fixed;
    right: 36px;
    bottom: calc(var(--wy-player-h) + 24px);
  }
  &.panel {
    position: fixed;
    right: 36px;
    bottom: calc(var(--wy-player-h) + 24px);
  }
}

.locate-ico {
  position: relative;
  width: 14px;
  height: 14px;
  border: 2px solid #666;
  border-radius: 50%;
  box-sizing: border-box;
  &::before,
  &::after {
    content: '';
    position: absolute;
    background: #666;
  }
  &::before {
    left: 50%;
    top: -5px;
    width: 2px;
    height: 20px;
    transform: translateX(-50%);
  }
  &::after {
    top: 50%;
    left: -5px;
    width: 20px;
    height: 2px;
    transform: translateY(-50%);
  }
}
</style>
