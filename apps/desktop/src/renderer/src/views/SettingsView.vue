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
      <el-descriptions-item label="API">默认代理至 http://127.0.0.1:3001</el-descriptions-item>
    </el-descriptions>
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from '../stores/user'
const user = useUserStore()
</script>

<style scoped>
.settings-page h2 {
  margin: 0 0 16px;
}
</style>
