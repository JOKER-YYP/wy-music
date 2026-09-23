<template>
  <div class="login-page">
    <div class="card">
      <h1>WY Music</h1>
      <p class="sub">自建曲库 · 仿网易云桌面播放器</p>
      <el-tabs v-model="tab">
        <el-tab-pane label="登录" name="login">
          <el-form :model="loginForm" @submit.prevent="onLogin">
            <el-form-item>
              <el-input v-model="loginForm.account" placeholder="账号" />
            </el-form-item>
            <el-form-item>
              <el-input v-model="loginForm.password" type="password" placeholder="密码" show-password />
            </el-form-item>
            <el-button type="danger" native-type="submit" :loading="loading" style="width: 100%">
              登录
            </el-button>
          </el-form>
        </el-tab-pane>
        <el-tab-pane label="注册" name="register">
          <el-form :model="regForm" @submit.prevent="onRegister">
            <el-form-item>
              <el-input v-model="regForm.account" placeholder="账号（至少3位）" />
            </el-form-item>
            <el-form-item>
              <el-input v-model="regForm.nickname" placeholder="昵称（可选）" />
            </el-form-item>
            <el-form-item>
              <el-input v-model="regForm.password" type="password" placeholder="密码（至少6位）" show-password />
            </el-form-item>
            <el-button type="danger" native-type="submit" :loading="loading" style="width: 100%">
              注册并登录
            </el-button>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../stores/user'

const tab = ref('login')
const loading = ref(false)
const user = useUserStore()
const router = useRouter()
const route = useRoute()

const loginForm = reactive({ account: '', password: '' })
const regForm = reactive({ account: '', password: '', nickname: '' })

async function onLogin() {
  loading.value = true
  try {
    await user.login(loginForm.account, loginForm.password)
    ElMessage.success('登录成功')
    router.replace(String(route.query.redirect || '/discover'))
  } finally {
    loading.value = false
  }
}

async function onRegister() {
  loading.value = true
  try {
    await user.register(regForm.account, regForm.password, regForm.nickname || undefined)
    ElMessage.success('注册成功')
    router.replace('/discover')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.login-page {
  height: 100%;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 20% 20%, rgba(236, 65, 65, 0.18), transparent 40%),
    radial-gradient(circle at 80% 0%, rgba(255, 138, 128, 0.2), transparent 35%),
    #f7f7f9;
}
.card {
  width: 380px;
  padding: 32px 28px 24px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
  h1 {
    margin: 0;
    color: #ec4141;
    text-align: center;
  }
  .sub {
    text-align: center;
    color: #888;
    margin: 8px 0 16px;
    font-size: 13px;
  }
}
</style>
