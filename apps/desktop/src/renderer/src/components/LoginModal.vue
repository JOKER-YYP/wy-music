<template>
  <Teleport to="body">
    <div v-if="ui.loginModalVisible" class="mask" @click.self="ui.closeLogin()">
      <div class="modal" role="dialog" aria-modal="true">
        <button class="close" type="button" aria-label="关闭" @click="ui.closeLogin()">
          <el-icon :size="18"><Close /></el-icon>
        </button>

        <div class="logo-wrap">
          <img class="logo-img" :src="logoUrl" alt="WY Music" />
          <div class="logo-text">WY Music</div>
        </div>

        <div class="tabs">
          <button
            type="button"
            :class="['tab', { active: tab === 'login' }]"
            @click="tab = 'login'"
          >
            账号登录
          </button>
          <button
            type="button"
            :class="['tab', { active: tab === 'register' }]"
            @click="tab = 'register'"
          >
            注册
          </button>
        </div>

        <form v-if="tab === 'login'" class="form" @submit.prevent="onLogin">
          <div class="field">
            <el-icon class="field-icon"><User /></el-icon>
            <input v-model="loginForm.account" type="text" placeholder="请输入账号" autocomplete="username" />
          </div>
          <div class="field">
            <el-icon class="field-icon"><Lock /></el-icon>
            <input
              v-model="loginForm.password"
              :type="showPwd ? 'text' : 'password'"
              placeholder="请输入密码"
              autocomplete="current-password"
            />
            <button class="eye" type="button" @click="showPwd = !showPwd">
              <el-icon><View v-if="showPwd" /><Hide v-else /></el-icon>
            </button>
          </div>

          <div class="row">
            <label class="auto">
              <input v-model="autoLogin" type="checkbox" />
              自动登录
            </label>
            <button class="link" type="button" @click="tab = 'register'">没有账号？去注册</button>
          </div>

          <button class="submit" type="submit" :disabled="loading">
            {{ loading ? '登录中…' : '登录' }}
          </button>
        </form>

        <form v-else class="form" @submit.prevent="onRegister">
          <div class="field">
            <el-icon class="field-icon"><User /></el-icon>
            <input v-model="regForm.account" type="text" placeholder="账号（至少3位）" autocomplete="username" />
          </div>
          <div class="field">
            <el-icon class="field-icon"><UserFilled /></el-icon>
            <input v-model="regForm.nickname" type="text" placeholder="昵称（可选）" />
          </div>
          <div class="field">
            <el-icon class="field-icon"><Lock /></el-icon>
            <input
              v-model="regForm.password"
              :type="showPwd ? 'text' : 'password'"
              placeholder="密码（至少6位）"
              autocomplete="new-password"
            />
            <button class="eye" type="button" @click="showPwd = !showPwd">
              <el-icon><View v-if="showPwd" /><Hide v-else /></el-icon>
            </button>
          </div>

          <div class="row">
            <span />
            <button class="link" type="button" @click="tab = 'login'">已有账号？去登录</button>
          </div>

          <button class="submit" type="submit" :disabled="loading">
            {{ loading ? '注册中…' : '注册并登录' }}
          </button>
        </form>

        <label class="agree">
          <input v-model="agreed" type="checkbox" />
          <span>
            同意
            <a href="javascript:;">服务条款</a>、
            <a href="javascript:;">隐私政策</a>
          </span>
        </label>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../stores/user'
import { useUiStore } from '../stores/ui'
import logoUrl from '../assets/logo.png'

const ui = useUiStore()
const user = useUserStore()
const router = useRouter()

const tab = ref<'login' | 'register'>('login')
const loading = ref(false)
const showPwd = ref(false)
const autoLogin = ref(true)
const agreed = ref(true)

const loginForm = reactive({ account: '', password: '' })
const regForm = reactive({ account: '', password: '', nickname: '' })

watch(
  () => ui.loginModalVisible,
  (v) => {
    if (v) tab.value = ui.loginModalTab
  },
)

watch(tab, (v) => {
  ui.loginModalTab = v
})

async function onLogin() {
  if (!agreed.value) {
    ElMessage.warning('请先勾选同意服务条款')
    return
  }
  if (!loginForm.account || !loginForm.password) {
    ElMessage.warning('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    await user.login(loginForm.account, loginForm.password)
    ElMessage.success('登录成功')
    ui.closeLogin()
    const redirect = sessionStorage.getItem('loginRedirect')
    if (redirect) {
      sessionStorage.removeItem('loginRedirect')
      router.replace(redirect)
    }
  } finally {
    loading.value = false
  }
}

async function onRegister() {
  if (!agreed.value) {
    ElMessage.warning('请先勾选同意服务条款')
    return
  }
  if (!regForm.account || !regForm.password) {
    ElMessage.warning('请填写账号和密码')
    return
  }
  loading.value = true
  try {
    await user.register(regForm.account, regForm.password, regForm.nickname || undefined)
    ElMessage.success('注册成功')
    ui.closeLogin()
    router.replace('/discover')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped lang="scss">
.mask {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.45);
  display: grid;
  place-items: center;
}
.modal {
  position: relative;
  width: 360px;
  padding: 28px 32px 22px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
}
.close {
  position: absolute;
  top: 12px;
  right: 12px;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
  &:hover {
    color: #333;
  }
}
.logo-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 18px;
}
.logo-img {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  object-fit: cover;
  display: block;
  box-shadow: 0 4px 14px rgba(236, 65, 65, 0.28);
}
.logo-text {
  margin-top: 8px;
  font-size: 18px;
  font-weight: 700;
  color: #ec4141;
  letter-spacing: 0.5px;
}
.tabs {
  display: flex;
  justify-content: center;
  gap: 28px;
  margin-bottom: 18px;
}
.tab {
  border: none;
  background: none;
  font-size: 15px;
  color: #666;
  cursor: pointer;
  padding: 6px 0;
  position: relative;
  &.active {
    color: #333;
    font-weight: 600;
    &::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: 0;
      width: 20px;
      height: 3px;
      border-radius: 2px;
      background: #ec4141;
      transform: translateX(-50%);
    }
  }
}
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field {
  display: flex;
  align-items: center;
  height: 42px;
  border: 1px solid #e6e6e6;
  border-radius: 8px;
  padding: 0 10px;
  background: #fafafa;
  &:focus-within {
    border-color: #ec4141;
    background: #fff;
  }
  input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 14px;
    min-width: 0;
  }
}
.field-icon {
  color: #bbb;
  margin-right: 8px;
}
.eye {
  border: none;
  background: none;
  color: #aaa;
  cursor: pointer;
  padding: 0 2px;
  display: grid;
  place-items: center;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #888;
}
.auto {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  input {
    accent-color: #ec4141;
  }
}
.link {
  border: none;
  background: none;
  color: #507daf;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}
.submit {
  height: 42px;
  border: none;
  border-radius: 21px;
  background: #ec4141;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 4px;
  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
  &:hover:not(:disabled) {
    background: #e03535;
  }
}
.agree {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 16px;
  font-size: 12px;
  color: #999;
  cursor: pointer;
  input {
    margin-top: 2px;
    accent-color: #ec4141;
  }
  a {
    color: #507daf;
  }
}
</style>
