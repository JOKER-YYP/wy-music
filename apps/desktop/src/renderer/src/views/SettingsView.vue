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

      <el-descriptions-item label="主题皮肤">
        <div class="theme-grid">
          <button
            v-for="t in theme.presets"
            :key="t.id"
            type="button"
            class="theme-card"
            :class="{ active: theme.id === t.id }"
            :title="t.name"
            @click="onPickTheme(t.id)"
          >
            <span
              class="theme-swatch"
              :style="{
                background: `linear-gradient(135deg, ${t.preview.topbar} 0 46%, ${t.preview.bg} 46% 100%)`,
              }"
            >
              <span class="theme-accent" :style="{ background: t.preview.accent }" />
            </span>
            <span class="theme-name">{{ t.name }}</span>
          </button>
        </div>
        <div class="lib-tip">参照网易云皮肤思路：顶栏配色 + 强调色；选择后立即生效并记住。</div>
      </el-descriptions-item>

      <el-descriptions-item label="播放记忆">
        <div class="shell-row">
          <el-switch v-model="rememberPlayback" @change="onRememberChange" />
          <span>记住播放列表与进度</span>
        </div>
        <div class="lib-tip">
          重启客户端后恢复上次队列、播放模式与进度（默认暂停，需手动继续播放）。网页临时试听文件无法记忆。
        </div>
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
        <div class="lib-tip">
          默认关闭窗口（右上角 × / 任务栏「关闭窗口」）会退出应用并停止播放。若开启此项，关闭仅隐藏到托盘，需在托盘菜单点「退出 WY Music」才真正退出。
        </div>
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
import { useThemeStore } from '../stores/theme'
import { usePlayerStore } from '../stores/player'
import type { ThemeId } from '../themes'
import {
  isRememberPlaybackEnabled,
  setRememberPlaybackEnabled,
} from '../services/playerSession'

const user = useUserStore()
const theme = useThemeStore()
const player = usePlayerStore()
const router = useRouter()
const sourcesOpen = ref(false)
const prefs = ref(loadLibrarySources())
const sourcesLabel = computed(() => librarySourcesSummary(prefs.value))
const isDesktop = computed(() => Boolean(window.wyAPI?.getShellPrefs))
const rememberPlayback = ref(isRememberPlaybackEnabled())
const shellSaving = ref(false)
const shell = reactive({
  showTray: true,
  closeToTray: false,
  mediaKeysEnabled: true,
})

function onSourcesSaved(next: LibrarySourcesPrefs) {
  prefs.value = next
  ElMessage.success('曲库来源已更新')
  router.push('/library')
}

function onPickTheme(id: ThemeId) {
  if (theme.id === id) return
  theme.setTheme(id)
  ElMessage.success(`已切换为「${theme.preset.name}」`)
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

function onRememberChange() {
  setRememberPlaybackEnabled(rememberPlayback.value)
  if (rememberPlayback.value) {
    player.persistSession(true)
    ElMessage.success('已开启播放记忆')
  } else {
    player.clearSessionMemory()
    ElMessage.success('已关闭并清除本地播放记忆')
  }
}

onMounted(() => {
  rememberPlayback.value = isRememberPlaybackEnabled()
  void loadShell()
})
</script>

<style scoped>
.settings-page {
  max-width: 760px;
}
.settings-page h2 {
  margin: 0 0 16px;
  font-size: 22px;
  font-weight: 700;
}
.lib-sources {
  display: flex;
  align-items: center;
  gap: 8px;
}
.lib-tip {
  margin-top: 6px;
  font-size: 12px;
  color: var(--wy-text-muted);
  line-height: 1.45;
}
.shell-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 0;
  color: var(--wy-text);
  font-size: 13px;
}
.theme-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  max-width: 520px;
}
.theme-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--wy-radius-md);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition:
    border-color var(--wy-duration-fast) var(--wy-ease),
    transform var(--wy-duration-fast) var(--wy-ease-out);
  &:hover {
    transform: translateY(-1px);
  }
  &.active {
    border-color: var(--wy-brand);
  }
  &:focus-visible {
    box-shadow: var(--wy-focus-ring);
  }
}
.theme-swatch {
  position: relative;
  height: 52px;
  border-radius: calc(var(--wy-radius-md) - 2px);
  border: 1px solid var(--wy-border);
  overflow: hidden;
  box-shadow: var(--wy-shadow-sm);
}
.theme-accent {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.85);
}
.theme-name {
  font-size: 12px;
  color: var(--wy-text-secondary);
  padding: 0 2px 2px;
  line-height: 1.2;
}
.theme-card.active .theme-name {
  color: var(--wy-brand);
  font-weight: 600;
}

@media (max-width: 640px) {
  .theme-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
