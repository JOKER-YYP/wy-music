<template>
  <div class="admin-page">
    <div class="head">
      <el-button type="danger" @click="openCreate">新增 Banner</el-button>
    </div>

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column label="预览" width="120">
        <template #default="{ row }">
          <div class="thumb" :style="thumbStyle(row.imageUrl)" />
        </template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="140" />
      <el-table-column prop="linkUrl" label="跳转链接" min-width="180" show-overflow-tooltip />
      <el-table-column prop="sort" label="排序" width="80" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
            {{ row.enabled ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link @click="toggle(row)">{{ row.enabled ? '停用' : '启用' }}</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="visible"
      :title="form.id ? '编辑 Banner' : '新增 Banner'"
      width="560px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <el-form label-width="88px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" maxlength="40" />
        </el-form-item>
        <el-form-item label="图片" required>
          <div class="upload-row">
            <el-input v-model="form.imageUrl" placeholder="图片 URL 或上传后自动填入" />
            <el-upload :show-file-list="false" :http-request="onUpload" accept="image/*">
              <el-button>上传</el-button>
            </el-upload>
          </div>
          <div v-if="form.imageUrl" class="preview" :style="thumbStyle(form.imageUrl)" />
        </el-form-item>
        <el-form-item label="跳转链接">
          <el-input v-model="form.linkUrl" placeholder="如 /recommend/daily 或 https://..." />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="danger" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { BannerDto } from '@wy-music/shared'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadRequestOptions } from 'element-plus'
import { http } from '../services/http'
import { mediaUrl } from '../services/media'

const list = ref<BannerDto[]>([])
const loading = ref(false)
const visible = ref(false)
const saving = ref(false)
const form = reactive({
  id: '',
  title: '',
  imageUrl: '',
  linkUrl: '',
  sort: 0,
  enabled: true,
})

function thumbStyle(url: string) {
  const u = mediaUrl(url)
  return u
    ? { backgroundImage: `url(${u})` }
    : { background: 'linear-gradient(135deg,#ff6b6b,#ee5a24)' }
}

async function load() {
  loading.value = true
  try {
    const { data } = await http.get('/api/admin/banners')
    list.value = data.data || []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  form.id = ''
  form.title = ''
  form.imageUrl = ''
  form.linkUrl = ''
  form.sort = list.value.length
  form.enabled = true
  visible.value = true
}

function openEdit(row: BannerDto) {
  form.id = row.id
  form.title = row.title
  form.imageUrl = row.imageUrl
  form.linkUrl = row.linkUrl || ''
  form.sort = row.sort
  form.enabled = row.enabled
  visible.value = true
}

async function onUpload(opt: UploadRequestOptions) {
  const fd = new FormData()
  fd.append('image', opt.file)
  const { data } = await http.post('/api/admin/banners/upload', fd)
  form.imageUrl = data.data.imageUrl || data.data.relativePath
  ElMessage.success('图片已上传')
}

async function save() {
  if (!form.title.trim()) return ElMessage.warning('请填写标题')
  if (!form.imageUrl.trim()) return ElMessage.warning('请提供图片')
  saving.value = true
  try {
    const payload = {
      title: form.title.trim(),
      imageUrl: form.imageUrl.trim(),
      linkUrl: form.linkUrl.trim() || null,
      sort: form.sort,
      enabled: form.enabled,
    }
    if (form.id) await http.put(`/api/admin/banners/${form.id}`, payload)
    else await http.post('/api/admin/banners', payload)
    ElMessage.success('已保存')
    visible.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function toggle(row: BannerDto) {
  await http.put(`/api/admin/banners/${row.id}`, { enabled: !row.enabled })
  ElMessage.success(row.enabled ? '已停用' : '已启用')
  load()
}

async function remove(row: BannerDto) {
  await ElMessageBox.confirm(`确认删除 Banner「${row.title}」？`, '提示', { type: 'warning' })
  await http.delete(`/api/admin/banners/${row.id}`)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>

<style scoped>
.head {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 14px;
}
.thumb,
.preview {
  width: 96px;
  height: 54px;
  border-radius: 6px;
  background-size: cover;
  background-position: center;
  border: 1px solid var(--wy-border);
}
.preview {
  margin-top: 8px;
  width: 100%;
  max-width: 320px;
  height: 120px;
}
.upload-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
</style>
