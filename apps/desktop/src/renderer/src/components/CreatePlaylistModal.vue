<template>
  <el-dialog
    :model-value="visible"
    title="新建歌单"
    width="420px"
    align-center
    destroy-on-close
    :close-on-click-modal="false"
    @update:model-value="onVisible"
  >
    <div class="create-body">
      <label class="row">
        <span class="label">名称</span>
        <el-input
          v-model="name"
          maxlength="40"
          show-word-limit
          placeholder="例如：我的收藏"
          @keydown.enter.prevent="onConfirm"
        />
      </label>
      <div class="row public-row">
        <span class="label">公开</span>
        <div class="public-ctrl">
          <el-switch v-model="isPublic" />
          <span class="tip">开启后可出现在推荐歌单 / 歌单广场</span>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="danger" :loading="loading" @click="onConfirm">创建</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  visible: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [boolean]
  confirm: [payload: { name: string; isPublic: boolean }]
}>()

const name = ref('')
const isPublic = ref(false)

watch(
  () => props.visible,
  (v) => {
    if (v) {
      name.value = ''
      isPublic.value = false
    }
  },
)

function onVisible(v: boolean) {
  emit('update:visible', v)
}

function close() {
  emit('update:visible', false)
}

function onConfirm() {
  const n = name.value.trim()
  if (!n) {
    ElMessage.warning('请输入歌单名称')
    return
  }
  emit('confirm', { name: n, isPublic: isPublic.value })
}
</script>

<style scoped lang="scss">
.create-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0 8px;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.label {
  flex: none;
  width: 40px;
  line-height: 32px;
  font-size: 14px;
  color: #666;
}
.public-row {
  align-items: center;
}
.public-ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;
}
.tip {
  font-size: 12px;
  color: #999;
  line-height: 1.4;
}
</style>
