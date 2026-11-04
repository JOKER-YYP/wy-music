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
      <el-descriptions-item v-if="isDesktop" label="系统托盘">
        <div class="shell-row">
          <el-switch v-model="shell.showTray" :disabled="shellSaving" @change="onShowTrayChange" />
          <span>显示托盘图标</span>
        </div>
        <div class="shell-row">
          <el-switch
            v-model="shell.closeToTray"
            :disabled="shellSaving || !shell.showTray"
            @change="persistShell"
          />
          <span>关闭窗口时最小化到托盘</span>
        </div>
        <div class="lib-tip">关闭到托盘后，从托盘菜单选择「退出」可彻底退出应用。</div>
      </el-descriptions-item>
      <el-descriptions-item v-if="isDesktop" label="全局媒体键">
        <div class="shell-row">
          <el-switch
            v-model="shell.mediaKeysEnabled"
            :disabled="shellSaving"
            @change="persistShell"
          />
          <span>启用键盘媒体键（播放/暂停、上一首、下一首）</span>
        </div>
        <div class="lib-tip">即使应用不在前台，也可用键盘媒体键控制播放。</div>
      </el-descriptions-item>
      <el-descriptions-item label="API">默认代理至 http://127.0.0.1:3001</el-descriptions-item>
    </el-descriptions>

    <LibrarySourcesDialog v-model:visible="sourcesOpen" @saved="onSourcesSaved" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
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
const isDesktop = computed(() => Boolean(window.wyAPI?.getShellPrefs))
const shellSaving = ref(false)
const shell = reactive({
  showTray: true,
  closeToTray: true,
  mediaKeysEnabled: true,
})

function onSourcesSaved(next: LibrarySourcesPrefs) {
  prefs.value = next
  ElMessage.success('曲库来源已更新')
  router.push('/library')
}

async function loadShell() {
  if (!window.wyAPI?.getShellPrefs) return
  try {
    const p = await window.wyAPI.getShellPrefs()
    shell.showTray = p.showTray
    shell.closeToTray = p.closeToTray
    shell.mediaKeysEnabled = p.mediaKeysEnabled
  } catch {
    /* ignore */
  }
}

async function persistShell() {
  if (!window.wyAPI?.setShellPrefs) return
  shellSaving.value = true
  try {
    const next = await window.wyAPI.setShellPrefs({
      showTray: shell.showTray,
      closeToTray: shell.closeToTray,
      mediaKeysEnabled: shell.mediaKeysEnabled,
    })
    shell.showTray = next.showTray
    shell.closeToTray = next.closeToTray
    shell.mediaKeysEnabled = next.mediaKeysEnabled
  } catch {
    ElMessage.error('保存桌面设置失败')
  } finally {
    shellSaving.value = false
  }
}

function onShowTrayChange() {
  if (!shell.showTray) shell.closeToTray = false
  void persistShell()
}

onMounted(() => {
  void loadShell()
})
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
.shell-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0;
}
</style>
