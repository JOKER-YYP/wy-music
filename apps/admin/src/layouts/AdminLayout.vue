<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="logo">WY Admin</div>
      <el-menu :default-active="route.path" router>
        <el-menu-item index="/dashboard">仪表盘</el-menu-item>
        <el-menu-item index="/tracks">歌曲管理</el-menu-item>
        <el-menu-item index="/users">用户管理</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <span>{{ admin.user?.nickname || '管理员' }}</span>
        <el-button type="danger" link @click="logout">退出</el-button>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { useAdminStore } from '../stores/admin'

const route = useRoute()
const router = useRouter()
const admin = useAdminStore()

function logout() {
  admin.logout()
  router.push('/login')
}
</script>

<style scoped>
.layout {
  height: 100%;
}
.aside {
  background: #fff;
  border-right: 1px solid #ebeef5;
}
.logo {
  height: 56px;
  display: flex;
  align-items: center;
  padding-left: 20px;
  font-weight: 700;
  color: #ec4141;
}
.header {
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}
</style>
