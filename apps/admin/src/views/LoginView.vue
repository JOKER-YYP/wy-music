<template>
  <div class="login">
    <el-card class="card">
      <h2>WY Music 管理后台</h2>
      <el-form @submit.prevent="onSubmit">
        <el-form-item>
          <el-input v-model="account" placeholder="管理员账号" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="password" type="password" show-password placeholder="密码" />
        </el-form-item>
        <el-button type="danger" native-type="submit" :loading="loading" style="width: 100%">
          登录
        </el-button>
      </el-form>
      <p class="hint">默认账号：admin / admin123</p>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAdminStore } from '../stores/admin'

const account = ref('admin')
const password = ref('admin123')
const loading = ref(false)
const admin = useAdminStore()
const router = useRouter()

async function onSubmit() {
  loading.value = true
  try {
    await admin.login(account.value, password.value)
    ElMessage.success('登录成功')
    router.replace('/dashboard')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login {
  height: 100%;
  display: grid;
  place-items: center;
}
.card {
  width: 380px;
}
h2 {
  text-align: center;
  margin-top: 0;
}
.hint {
  margin-bottom: 0;
  color: #999;
  font-size: 12px;
  text-align: center;
}
</style>
