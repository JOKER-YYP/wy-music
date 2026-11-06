<template>
  <el-container class="layout">
    <el-aside :width="asideWidth" class="aside">
      <div class="logo">
        <span class="logo-mark">WY</span>
        <span class="logo-text">Admin</span>
      </div>
      <el-menu
        class="side-menu"
        :default-active="route.path"
        router
        :collapse="false"
      >
        <el-menu-item index="/dashboard">仪表盘</el-menu-item>
        <el-menu-item index="/tracks">公共曲库</el-menu-item>
        <el-menu-item index="/playlists">歌单管理</el-menu-item>
        <el-menu-item index="/banners">Banner</el-menu-item>
        <el-menu-item index="/comments">评论管理</el-menu-item>
        <el-menu-item index="/users">用户管理</el-menu-item>
        <el-menu-item index="/settings">系统设置</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container class="main-wrap">
      <el-header class="header" :height="headerHeight">
        <div class="header-title">{{ pageTitle }}</div>
        <div class="header-right">
          <span class="uname">{{ admin.user?.nickname || '管理员' }}</span>
          <el-button type="danger" link @click="logout">退出</el-button>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminStore } from '../stores/admin'

const route = useRoute()
const router = useRouter()
const admin = useAdminStore()
const asideWidth = 'var(--wy-aside-w)'
const headerHeight = 'var(--wy-header-h)'

const pageTitle = computed(() => {
  const map: Record<string, string> = {
    '/dashboard': '仪表盘',
    '/tracks': '公共曲库',
    '/playlists': '歌单管理',
    '/banners': 'Banner 管理',
    '/comments': '评论管理',
    '/users': '用户管理',
    '/settings': '系统设置',
  }
  return map[route.path] || '管理后台'
})

function logout() {
  admin.logout()
  router.push('/login')
}
</script>

<style scoped>
.layout {
  height: 100%;
  background: var(--wy-bg);
}
.aside {
  background: var(--wy-sidebar);
  border-right: 1px solid var(--wy-border);
  display: flex;
  flex-direction: column;
}
.logo {
  height: var(--wy-header-h);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border-bottom: 1px solid var(--wy-border);
  flex-shrink: 0;
  background: var(--wy-sidebar);
}
.logo-mark {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--wy-radius-sm);
  background: var(--wy-brand);
  color: var(--wy-text-on-brand);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.logo-text {
  font-weight: 700;
  font-size: 15px;
  color: var(--wy-text);
}
.side-menu {
  border-right: none;
  flex: 1;
  padding: 8px;
  background: transparent;
}
.side-menu :deep(.el-menu-item) {
  height: 42px;
  line-height: 42px;
  border-radius: var(--wy-radius-sm);
  margin-bottom: 2px;
  color: var(--wy-text-secondary);
  transition:
    background var(--wy-duration-fast) var(--wy-ease),
    color var(--wy-duration-fast) var(--wy-ease);
}
.side-menu :deep(.el-menu-item:hover) {
  background: var(--wy-brand-soft);
  color: var(--wy-brand);
}
.side-menu :deep(.el-menu-item.is-active) {
  background: var(--wy-brand-soft-strong);
  color: var(--wy-brand);
  font-weight: 600;
}
.main-wrap {
  min-width: 0;
  flex: 1;
  background: var(--wy-bg);
}
.header {
  background: var(--wy-surface);
  border-bottom: 1px solid var(--wy-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}
.header-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--wy-text);
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.uname {
  font-size: 13px;
  color: var(--wy-text-secondary);
}
.main {
  width: 100%;
  max-width: none;
  min-width: 0;
  padding: 20px 24px 28px;
  background: var(--wy-bg);
}
.main :deep(> *) {
  width: 100%;
  max-width: none;
  min-width: 0;
}
</style>
