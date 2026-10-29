<template>
  <el-dialog
    :model-value="visible"
    title="曲库来源"
    width="520px"
    append-to-body
    destroy-on-close
    @update:model-value="onVisible"
  >
    <p class="hint">
      公共曲库将合并读取以下来源。下载到曲库仍写入默认本地数据库。至少保留一个来源。
    </p>

    <div class="source-row">
      <el-checkbox
        :model-value="draft.includeServerLibrary"
        @update:model-value="onToggleServer"
      >
        本地数据库（默认曲库）
      </el-checkbox>
      <span class="tag">默认写入目标</span>
    </div>

    <div class="folders-head">
      <span>额外文件夹</span>
      <el-button
        type="primary"
        link
        :disabled="!isDesktop"
        @click="addFolder"
      >
        添加文件夹
      </el-button>
    </div>

    <el-empty
      v-if="!draft.folders.length"
      description="尚未添加额外文件夹"
      :image-size="56"
    />
    <ul v-else class="folder-list">
      <li v-for="folder in draft.folders" :key="folder">
        <span class="path" :title="folder">{{ folder }}</span>
        <el-button type="danger" link @click="removeFolder(folder)">移除</el-button>
      </li>
    </ul>

    <p v-if="!isDesktop" class="warn">添加本机文件夹仅支持桌面端。</p>

    <template #footer>
      <el-button @click="onVisible(false)">取消</el-button>
      <el-button type="primary" @click="confirm">保存并刷新</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  canDisableServerLibrary,
  loadLibrarySources,
  saveLibrarySources,
  type LibrarySourcesPrefs,
} from '../services/librarySources'
import { isElectronApp } from '../services/localUpload'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  'update:visible': [boolean]
  saved: [LibrarySourcesPrefs]
}>()

const isDesktop = isElectronApp()
const draft = reactive<LibrarySourcesPrefs>({
  includeServerLibrary: true,
  folders: [] as string[],
})

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    const cur = loadLibrarySources()
    draft.includeServerLibrary = cur.includeServerLibrary
    draft.folders = [...cur.folders]
  },
)

function onVisible(v: boolean) {
  emit('update:visible', v)
}

function onToggleServer(val: boolean | string | number) {
  const next = Boolean(val)
  if (!next && !canDisableServerLibrary(draft.folders)) {
    ElMessage.warning('请先添加至少一个文件夹，才能关闭本地数据库')
    return
  }
  draft.includeServerLibrary = next
}

async function addFolder() {
  if (!window.wyAPI?.selectFolder) {
    ElMessage.warning('当前环境不支持选择文件夹')
    return
  }
  const folder = await window.wyAPI.selectFolder()
  if (!folder) return
  const exists = draft.folders.some(
    (f) => f.replace(/\\/g, '/').toLowerCase() === folder.replace(/\\/g, '/').toLowerCase(),
  )
  if (exists) {
    ElMessage.info('该文件夹已在列表中')
    return
  }
  draft.folders = [...draft.folders, folder]
}

function removeFolder(folder: string) {
  const next = draft.folders.filter((f) => f !== folder)
  if (!draft.includeServerLibrary && next.length === 0) {
    ElMessage.warning('至少保留一个曲库来源，已重新打开本地数据库')
    draft.includeServerLibrary = true
  }
  draft.folders = next
}

function confirm() {
  if (!draft.includeServerLibrary && draft.folders.length === 0) {
    ElMessage.warning('至少保留一个曲库来源')
    return
  }
  const saved = saveLibrarySources({
    includeServerLibrary: draft.includeServerLibrary,
    folders: [...draft.folders],
  })
  emit('saved', saved)
  onVisible(false)
}
</script>

<style scoped lang="scss">
.hint {
  margin: 0 0 16px;
  color: var(--wy-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}
.source-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}
.tag {
  font-size: 12px;
  color: var(--wy-brand);
  background: rgba(236, 65, 65, 0.08);
  padding: 2px 8px;
  border-radius: 4px;
}
.folders-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-weight: 600;
}
.folder-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.folder-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.folder-list li:last-child {
  border-bottom: none;
}
.path {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--wy-text-secondary);
}
.warn {
  margin: 12px 0 0;
  color: var(--el-color-warning);
  font-size: 12px;
}
</style>
