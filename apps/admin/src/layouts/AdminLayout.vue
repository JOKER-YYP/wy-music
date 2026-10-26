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
        <el-menu-item index="/users">用户管理</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container class="main-wrap">
      <el-header class="header" height="56px">
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
const asideWidth = '220px'

const pageTitle = computed(() => {
  const map: Record<string, string> = {
    '/dashboard': '仪表盘',
    '/tracks': '公共曲库',
    '/users': '用户管理',
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
  background: var(--wy-surface);
  border-right: 1px solid var(--wy-border);
  display: flex;
  flex-direction: column;
}
.logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 18px;
  border-bottom: 1px solid var(--wy-border);
  flex-shrink: 0;
}
.logo-mark {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--wy-brand);
  color: #fff;
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
}
.header {
  background: var(--wy-surface);
  border-bottom: 1px solid var(--wy-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
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
  padding: 20px 22px 28px;
}
</style>
