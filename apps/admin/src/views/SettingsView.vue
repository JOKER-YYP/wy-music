<template>
  <div v-loading="loading" class="admin-page settings">
    <div class="admin-page-head">
      <div>
        <h2 class="admin-page-title">系统设置</h2>
        <p class="admin-page-desc">上传策略、注册开关与站点信息</p>
      </div>
    </div>
    <el-form label-width="140px" class="settings-form">
      <el-form-item label="站点名称">
        <el-input v-model="form.siteName" maxlength="40" />
      </el-form-item>
      <el-form-item label="站点公告">
        <el-input
          v-model="form.siteAnnouncement"
          type="textarea"
          :rows="3"
          maxlength="500"
          placeholder="可选，展示给用户的简短公告"
        />
      </el-form-item>
      <el-form-item label="上传需审核">
        <el-switch v-model="form.uploadNeedReview" />
        <span class="tip">开启后新上传进入待审核</span>
      </el-form-item>
      <el-form-item label="单文件上限 (MB)">
        <el-input-number v-model="form.uploadMaxSizeMb" :min="1" :max="2048" />
      </el-form-item>
      <el-form-item label="开放注册">
        <el-switch v-model="form.registerEnabled" />
      </el-form-item>
      <el-form-item label="媒体根目录">
        <el-input :model-value="form.storageRoot" readonly />
        <span class="tip">只读，部署时通过环境变量 STORAGE_ROOT 配置</span>
      </el-form-item>
      <el-form-item>
        <el-button type="danger" :loading="saving" @click="save">保存设置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { AppSettingsDto } from '@wy-music/shared'
import { ElMessage } from 'element-plus'
import { http } from '../services/http'

const loading = ref(false)
const saving = ref(false)
const form = reactive<AppSettingsDto>({
  uploadNeedReview: false,
  uploadMaxSizeMb: 500,
  registerEnabled: true,
  siteName: 'WY Music',
  siteAnnouncement: '',
  storageRoot: '',
})

async function load() {
  loading.value = true
  try {
    const { data } = await http.get('/api/admin/settings')
    Object.assign(form, data.data)
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const { data } = await http.put('/api/admin/settings', {
      uploadNeedReview: form.uploadNeedReview,
      uploadMaxSizeMb: form.uploadMaxSizeMb,
      registerEnabled: form.registerEnabled,
      siteName: form.siteName,
      siteAnnouncement: form.siteAnnouncement,
    })
    Object.assign(form, data.data)
    ElMessage.success('设置已保存')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.settings-form {
  max-width: 720px;
  padding: 18px 20px;
  background: var(--wy-surface);
  border: 1px solid var(--wy-border);
  border-radius: var(--wy-radius-md);
}
.tip {
  margin-left: 10px;
  font-size: 12px;
  color: var(--wy-text-muted);
}
</style>
