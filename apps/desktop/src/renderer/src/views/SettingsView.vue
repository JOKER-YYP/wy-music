<template>
  <div class="settings-page">
    <h2>设置</h2>
    <el-descriptions :column="1" border>
      <el-descriptions-item label="当前用户">
        {{ user.user?.nickname }}（{{ user.user?.account }}）
      </el-descriptions-item>
      <el-descriptions-item label="角色">{{ user.user?.role }}</el-descriptions-item>
      <el-descriptions-item label="个人主页">
        <el-button link type="primary" @click="$router.push('/profile')">前往主页</el-button>
      </el-descriptions-item>
      <el-descriptions-item label="编辑资料">
        <el-button link type="primary" @click="$router.push('/profile/edit')">修改头像 / 昵称等</el-button>
      </el-descriptions-item>
      <el-descriptions-item label="公共曲库来源">
        <div class="lib-sources">
          <span>{{ sourcesLabel }}</span>
          <el-button link type="primary" @click="sourcesOpen = true">管理</el-button>
        </div>
        <div class="lib-tip">可多选本机文件夹；下载到曲库仍写入默认本地数据库。配置会持久保存。</div>
      </el-descriptions-item>
      <el-descriptions-item label="API">默认代理至 http://127.0.0.1:3001</el-descriptions-item>
    </el-descriptions>

    <LibrarySourcesDialog v-model:visible="sourcesOpen" @saved="onSourcesSaved" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import LibrarySourcesDialog from '../components/LibrarySourcesDialog.vue'
import {
  librarySourcesSummary,
  loadLibrarySources,
  type LibrarySourcesPrefs,
} from '../services/librarySources'
import { useUserStore } from '../stores/user'

const user = useUserStore()
const router = useRouter()
const sourcesOpen = ref(false)
const prefs = ref(loadLibrarySources())
const sourcesLabel = computed(() => librarySourcesSummary(prefs.value))

function onSourcesSaved(next: LibrarySourcesPrefs) {
  prefs.value = next
  ElMessage.success('曲库来源已更新')
  router.push('/library')
}
</script>

<style scoped>
.settings-page h2 {
  margin: 0 0 16px;
}
.lib-sources {
  display: flex;
  align-items: center;
  gap: 8px;
}
.lib-tip {
  margin-top: 6px;
  font-size: 12px;
  color: var(--wy-text-secondary);
  line-height: 1.4;
}
</style>
