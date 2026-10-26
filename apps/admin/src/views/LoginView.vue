<template>
  <div class="login">
    <el-card class="card" shadow="never">
      <div class="brand">
        <span class="mark">WY</span>
        <div>
          <h2>WY Music 管理后台</h2>
          <p class="sub">审核曲库 · 管理用户</p>
        </div>
      </div>
      <el-form class="form" @submit.prevent="onSubmit">
        <el-form-item>
          <el-input v-model="account" placeholder="管理员账号" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="password"
            type="password"
            show-password
            placeholder="密码"
            size="large"
          />
        </el-form-item>
        <el-button
          type="danger"
          native-type="submit"
          size="large"
          :loading="loading"
          class="submit"
        >
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
  padding: 24px;
  background:
    radial-gradient(ellipse 80% 60% at 50% -10%, rgba(236, 65, 65, 0.12), transparent 55%),
    var(--wy-bg);
}
.card {
  width: min(400px, 100%);
  border-radius: 14px;
  border: 1px solid var(--wy-border);
  box-shadow: var(--wy-shadow-sm);
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.mark {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--wy-brand);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  flex-shrink: 0;
}
h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--wy-text);
}
.sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--wy-text-muted);
}
.form :deep(.el-form-item) {
  margin-bottom: 14px;
}
.submit {
  width: 100%;
  margin-top: 4px;
}
.hint {
  margin: 14px 0 0;
  color: var(--wy-text-muted);
  font-size: 12px;
  text-align: center;
}
</style>
