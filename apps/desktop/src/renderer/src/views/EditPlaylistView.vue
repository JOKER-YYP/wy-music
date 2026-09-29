<template>
  <div v-loading="loading" class="edit-playlist">
    <h2>编辑歌单信息</h2>

    <template v-if="detail">
      <div class="form-wrap">
        <div class="left">
          <div class="field">
            <label>名称：</label>
            <div class="name-box">
              <input
                v-model="form.name"
                class="input"
                maxlength="40"
                placeholder="请输入歌单名称"
              />
              <span class="name-count">{{ form.name.length }}/40</span>
            </div>
          </div>

          <div class="field field-top">
            <label>简介：</label>
            <div class="desc-box">
              <textarea
                v-model="form.description"
                class="textarea"
                maxlength="1000"
                rows="8"
                placeholder="请输入简介"
              />
              <span class="desc-count">{{ form.description.length }}/1000</span>
            </div>
          </div>

          <div class="field">
            <label>标签：</label>
            <div class="tags-row">
              <button
                v-for="t in selectedTags"
                :key="t"
                type="button"
                class="tag-chip"
                @click="toggleTag(t)"
              >
                {{ t }}
                <span class="x">×</span>
              </button>
              <el-popover
                v-model:visible="tagPickerOpen"
                placement="bottom-start"
                :width="360"
                trigger="click"
                :teleported="true"
              >
                <template #reference>
                  <button type="button" class="tag-select">
                    {{ selectedTags.length ? '添加标签' : '选择...' }}
                    <el-icon :size="12"><ArrowDown /></el-icon>
                  </button>
                </template>
                <div class="tag-panel" @mousedown.stop @click.stop>
                  <div class="tag-tip">最多选择 3 个标签</div>
                  <div class="tag-grid">
                    <button
                      v-for="t in PRESET_TAGS"
                      :key="t"
                      type="button"
                      class="tag-opt"
                      :class="{
                        on: selectedTags.includes(t),
                        disabled: !selectedTags.includes(t) && selectedTags.length >= 3,
                      }"
                      :disabled="!selectedTags.includes(t) && selectedTags.length >= 3"
                      @click="toggleTag(t)"
                    >
                      {{ t }}
                    </button>
                  </div>
                </div>
              </el-popover>
            </div>
          </div>

          <div class="actions">
            <button class="btn-save" type="button" :disabled="saving" @click="onSave">
              {{ saving ? '保存中…' : '保存' }}
            </button>
            <button class="btn-cancel" type="button" @click="onCancel">取消</button>
          </div>
        </div>

        <div class="right">
          <div class="cover-wrap" :class="{ uploading }" @click="pickCover">
            <div class="cover" :style="coverStyle" />
            <div class="cover-mask">{{ uploading ? '上传中…' : '编辑封面' }}</div>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            class="file-input"
            @change="onCoverChange"
          />
        </div>
      </div>
    </template>

    <el-empty v-else-if="!loading" description="歌单不存在或无权编辑" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import { http, mediaUrl } from '../services/http'
import { usePlaylistStore, type PlaylistDetail } from '../stores/playlist'
import { useUserStore } from '../stores/user'

const PRESET_TAGS = [
  '华语',
  '欧美',
  '日语',
  '韩语',
  '粤语',
  '流行',
  '摇滚',
  '民谣',
  '电子',
  '舞曲',
  '说唱',
  '轻音乐',
  '爵士',
  '乡村',
  'R&B/Soul',
  '古典',
  '民族',
  '英伦',
  '金属',
  '朋克',
  '蓝调',
  '雷鬼',
  '世界音乐',
  '拉丁',
  '另类/独立',
  'New Age',
  '古风',
  '后摇',
  'Bossa Nova',
  '清晨',
  '夜晚',
  '学习',
  '工作',
  '午休',
  '下午茶',
  '地铁',
  '驾车',
  '运动',
  '旅行',
  '散步',
  '酒吧',
  '怀旧',
  '清新',
  '浪漫',
  '伤感',
  '治愈',
  '放松',
  '孤独',
  '感动',
  '兴奋',
  '快乐',
  '安静',
  '思念',
  '影视原声',
  'ACG',
  '儿童',
  '校园',
  '游戏',
  '70后',
  '80后',
  '90后',
  '网络歌曲',
  'KTV',
  '经典',
  '翻唱',
  '吉他',
  '钢琴',
  '器乐',
  '榜单',
  '00后',
]

const route = useRoute()
const router = useRouter()
const playlistStore = usePlaylistStore()
const user = useUserStore()

const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const tagPickerOpen = ref(false)
const detail = ref<PlaylistDetail | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const previewUrl = ref('')

const form = reactive({
  name: '',
  description: '',
})

const selectedTags = ref<string[]>([])

const coverStyle = computed(() => {
  const url = previewUrl.value || mediaUrl(detail.value?.coverUrl)
  if (url) return { backgroundImage: `url(${url})` }
  return { backgroundImage: 'linear-gradient(135deg,#ec4141,#ff8a80)' }
})

function parseTags(raw?: string | null) {
  if (!raw) return []
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)
}

function toggleTag(t: string) {
  const list = [...selectedTags.value]
  const idx = list.indexOf(t)
  if (idx >= 0) {
    list.splice(idx, 1)
  } else {
    if (list.length >= 3) {
      ElMessage.warning('最多选择 3 个标签')
      return
    }
    list.push(t)
  }
  selectedTags.value = list
}

function pickCover() {
  if (uploading.value) return
  fileInput.value?.click()
}

async function onCoverChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !detail.value) return
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.warning('封面不能超过 5MB')
    input.value = ''
    return
  }
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)

  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('cover', file)
    const { data } = await http.post(`/api/playlists/${detail.value.id}/cover`, fd)
    detail.value = { ...detail.value, ...data.data, tracks: detail.value.tracks }
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value)
      previewUrl.value = ''
    }
    await playlistStore.fetchMine()
    ElMessage.success('封面已更新')
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '封面上传失败')
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function load() {
  const id = String(route.params.id || '')
  if (!id) return
  loading.value = true
  try {
    const d = await playlistStore.fetchDetail(id)
    if (d.isSystem || d.ownerId !== user.user?.id) {
      detail.value = null
      ElMessage.warning('只能编辑自己创建的歌单')
      return
    }
    detail.value = d
    form.name = d.name || ''
    form.description = d.description || ''
    selectedTags.value = parseTags(d.tags)
  } catch {
    detail.value = null
  } finally {
    loading.value = false
  }
}

async function onSave() {
  if (!detail.value) return
  const name = form.name.trim()
  if (!name) {
    ElMessage.warning('请填写歌单名称')
    return
  }
  saving.value = true
  try {
    await playlistStore.update(detail.value.id, {
      name,
      description: form.description.trim(),
      tags: selectedTags.value.join(','),
    })
    ElMessage.success('已保存')
    router.replace(`/playlist/${detail.value.id}`)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}

function onCancel() {
  if (detail.value) router.replace(`/playlist/${detail.value.id}`)
  else router.back()
}

onMounted(load)
watch(() => route.params.id, load)
</script>

<style scoped lang="scss">
.edit-playlist {
  max-width: 860px;
  padding: 8px 8px 40px;
}
h2 {
  margin: 0 0 28px;
  font-size: 22px;
  font-weight: 600;
  color: #333;
}
.form-wrap {
  display: flex;
  gap: 40px;
  align-items: flex-start;
}
.left {
  flex: 1;
  min-width: 0;
}
.field {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  label {
    flex: 0 0 52px;
    text-align: right;
    font-size: 14px;
    color: #666;
  }
}
.field-top {
  align-items: flex-start;
  label {
    padding-top: 10px;
  }
}
.name-box,
.desc-box {
  position: relative;
  flex: 1;
  min-width: 0;
}
.input {
  width: 100%;
  height: 36px;
  padding: 0 52px 0 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
  color: #333;
  outline: none;
  box-sizing: border-box;
  &:focus {
    border-color: #ec4141;
  }
}
.name-count {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: #bbb;
}
.textarea {
  width: 100%;
  min-height: 160px;
  padding: 10px 12px 28px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 14px;
  color: #333;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
  line-height: 1.5;
  &:focus {
    border-color: #ec4141;
  }
}
.desc-count {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-size: 12px;
  color: #bbb;
}
.tags-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.tag-chip {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #f0a0a0;
  border-radius: 14px;
  background: #fff5f5;
  color: #ec4141;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  .x {
    font-size: 14px;
    opacity: 0.7;
  }
}
.tag-select {
  height: 32px;
  padding: 0 12px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: #fff;
  color: #666;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  &:hover {
    border-color: #ec4141;
    color: #ec4141;
  }
}
.tag-panel {
  .tag-tip {
    font-size: 12px;
    color: #999;
    margin-bottom: 10px;
  }
}
.tag-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 280px;
  overflow: auto;
}
.tag-opt {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #e8e8e8;
  border-radius: 14px;
  background: #fafafa;
  color: #666;
  font-size: 12px;
  cursor: pointer;
  &:hover:not(:disabled) {
    border-color: #ec4141;
    color: #ec4141;
  }
  &.on {
    border-color: #ec4141;
    background: #fff5f5;
    color: #ec4141;
  }
  &.disabled,
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}
.actions {
  display: flex;
  gap: 14px;
  padding-left: 64px;
  margin-top: 8px;
}
.btn-save,
.btn-cancel {
  min-width: 96px;
  height: 36px;
  border-radius: 18px;
  font-size: 14px;
  cursor: pointer;
  border: none;
}
.btn-save {
  background: #ec4141;
  color: #fff;
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}
.btn-cancel {
  background: #fff;
  color: #333;
  border: 1px solid #d9d9d9;
  &:hover {
    border-color: #ec4141;
    color: #ec4141;
  }
}
.right {
  width: 200px;
  flex-shrink: 0;
  padding-top: 2px;
}
.cover-wrap {
  position: relative;
  width: 200px;
  height: 200px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  &.uploading {
    pointer-events: none;
  }
  &:hover .cover-mask {
    opacity: 1;
  }
}
.cover {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-color: #f5f5f5;
}
.cover-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.15s;
}
.file-input {
  display: none;
}
@media (max-width: 720px) {
  .form-wrap {
    flex-direction: column-reverse;
  }
  .right {
    width: 140px;
  }
  .cover-wrap {
    width: 140px;
    height: 140px;
  }
}
</style>
