<template>
  <div class="edit-profile">
    <h2>编辑个人信息</h2>

    <div class="form-wrap">
      <div class="left">
        <div class="field">
          <label>昵称:</label>
          <input v-model="form.nickname" class="input" maxlength="32" placeholder="请输入昵称" />
        </div>

        <div class="field field-top">
          <label>简介:</label>
          <div class="bio-box">
            <textarea
              v-model="form.bio"
              class="textarea"
              maxlength="300"
              rows="5"
              placeholder="介绍一下自己吧"
            />
            <span class="bio-count">{{ form.bio.length }}/300</span>
          </div>
        </div>

        <div class="field">
          <label>性别:</label>
          <div class="radios">
            <label class="radio">
              <input v-model="form.gender" type="radio" value="male" />
              <span>男</span>
            </label>
            <label class="radio">
              <input v-model="form.gender" type="radio" value="female" />
              <span>女</span>
            </label>
            <label class="radio">
              <input v-model="form.gender" type="radio" value="unknown" />
              <span>保密</span>
            </label>
          </div>
        </div>

        <div class="field">
          <label>生日:</label>
          <div class="selects">
            <select v-model="birthYear" class="select">
              <option value="">年</option>
              <option v-for="y in years" :key="y" :value="String(y)">{{ y }}</option>
            </select>
            <select v-model="birthMonth" class="select">
              <option value="">月</option>
              <option v-for="m in 12" :key="m" :value="String(m)">{{ m }}</option>
            </select>
            <select v-model="birthDay" class="select">
              <option value="">日</option>
              <option v-for="d in daysInMonth" :key="d" :value="String(d)">{{ d }}</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label>地区:</label>
          <div class="selects">
            <select v-model="form.province" class="select wide" @change="onProvinceChange">
              <option value="">请选择省份</option>
              <option v-for="p in PROVINCES" :key="p" :value="p">{{ p }}</option>
            </select>
            <select v-model="form.city" class="select wide">
              <option value="">请选择城市</option>
              <option v-for="c in cities" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
        </div>

        <div class="actions">
          <button class="btn-save" type="button" :disabled="saving" @click="onSave">
            {{ saving ? '保存中…' : '保存' }}
          </button>
          <button class="btn-cancel" type="button" @click="onCancel">取消</button>
        </div>
      </div>

      <div class="right">
        <div class="avatar-wrap" @click="pickAvatar">
          <div class="avatar" :style="avatarStyle">{{ avatarLetter }}</div>
          <div class="avatar-mask">修改头像</div>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          class="file-input"
          @change="onAvatarChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../stores/user'
import { http, mediaUrl } from '../services/http'
import { PROVINCES, REGION_MAP } from '../data/regions'

const router = useRouter()
const user = useUserStore()

const saving = ref(false)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const previewUrl = ref('')

const form = reactive({
  nickname: '',
  bio: '',
  gender: 'unknown' as 'unknown' | 'male' | 'female',
  province: '',
  city: '',
})

const birthYear = ref('')
const birthMonth = ref('')
const birthDay = ref('')

const years = computed(() => {
  const now = new Date().getFullYear()
  const list: number[] = []
  for (let y = now; y >= 1920; y--) list.push(y)
  return list
})

const daysInMonth = computed(() => {
  const y = Number(birthYear.value) || 2000
  const m = Number(birthMonth.value) || 1
  return new Date(y, m, 0).getDate()
})

const cities = computed(() => {
  if (!form.province) return []
  return REGION_MAP[form.province] || []
})

const avatarLetter = computed(() => (form.nickname || user.user?.nickname || '用').slice(0, 1))
const avatarStyle = computed(() => {
  const url = previewUrl.value || mediaUrl(user.user?.avatarUrl)
  if (url) return { backgroundImage: `url(${url})`, color: 'transparent' }
  return {}
})

watch([birthYear, birthMonth], () => {
  const max = daysInMonth.value
  if (Number(birthDay.value) > max) birthDay.value = String(max)
})

function onProvinceChange() {
  const list = REGION_MAP[form.province] || []
  if (!list.includes(form.city)) form.city = list[0] || ''
}

function fillFromUser() {
  const u = user.user
  if (!u) return
  form.nickname = u.nickname || ''
  form.bio = u.bio || ''
  form.gender = (u.gender as 'male' | 'female') || 'unknown'
  form.province = u.province || ''
  form.city = u.city || ''
  if (u.birthday && /^\d{4}-\d{2}-\d{2}$/.test(u.birthday)) {
    const [y, m, d] = u.birthday.split('-')
    birthYear.value = y
    birthMonth.value = String(Number(m))
    birthDay.value = String(Number(d))
  }
}

function pickAvatar() {
  fileInput.value?.click()
}

async function onAvatarChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.warning('头像不能超过 5MB')
    input.value = ''
    return
  }
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)

  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('avatar', file)
    const { data } = await http.post('/api/auth/me/avatar', fd)
    user.user = data.data
    localStorage.setItem('user', JSON.stringify(data.data))
    ElMessage.success('头像已更新')
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function buildBirthday() {
  if (!birthYear.value || !birthMonth.value || !birthDay.value) return ''
  const m = String(birthMonth.value).padStart(2, '0')
  const d = String(birthDay.value).padStart(2, '0')
  return `${birthYear.value}-${m}-${d}`
}

async function onSave() {
  if (!form.nickname.trim()) {
    ElMessage.warning('请填写昵称')
    return
  }
  saving.value = true
  try {
    const { data } = await http.put('/api/auth/me', {
      nickname: form.nickname.trim(),
      bio: form.bio,
      gender: form.gender,
      birthday: buildBirthday(),
      province: form.province,
      city: form.city,
    })
    user.user = data.data
    localStorage.setItem('user', JSON.stringify(data.data))
    ElMessage.success('资料已保存')
    router.push('/profile')
  } finally {
    saving.value = false
  }
}

function onCancel() {
  router.back()
}

onMounted(async () => {
  if (!user.accessToken) return
  await user.fetchMe()
  fillFromUser()
})
</script>

<style scoped>
.edit-profile {
  max-width: 780px;
  padding: 8px 8px 40px;
}
h2 {
  margin: 0 0 28px;
  font-size: 22px;
  font-weight: 600;
  color: #333;
}
.form-wrap {
  display: flex;
  gap: 48px;
  align-items: flex-start;
}
.left {
  flex: 1;
  min-width: 0;
}
.field {
  display: flex;
  align-items: center;
  margin-bottom: 22px;
  gap: 12px;
}
.field-top {
  align-items: flex-start;
}
label {
  width: 48px;
  flex-shrink: 0;
  color: #666;
  font-size: 14px;
  line-height: 36px;
  text-align: right;
}
.input,
.select,
.textarea {
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  background: #f7f7f7;
  color: #333;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}
.input:focus,
.select:focus,
.textarea:focus {
  border-color: #ec4141;
  background: #fff;
}
.input {
  flex: 1;
  height: 36px;
  padding: 0 12px;
}
.bio-box {
  flex: 1;
  position: relative;
}
.textarea {
  width: 100%;
  padding: 10px 12px 28px;
  resize: vertical;
  min-height: 110px;
  line-height: 1.5;
  font-family: inherit;
  box-sizing: border-box;
}
.bio-count {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-size: 12px;
  color: #bbb;
}
.radios {
  display: flex;
  gap: 24px;
  align-items: center;
  height: 36px;
}
.radio {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #333;
  font-size: 14px;
  line-height: 1;
}
.radio input {
  accent-color: #ec4141;
  width: 16px;
  height: 16px;
  margin: 0;
}
.selects {
  display: flex;
  gap: 10px;
  flex: 1;
  flex-wrap: wrap;
}
.select {
  height: 36px;
  padding: 0 8px;
  min-width: 88px;
}
.select.wide {
  flex: 1;
  min-width: 140px;
}
.actions {
  display: flex;
  gap: 14px;
  padding-left: 60px;
  margin-top: 12px;
}
.btn-save,
.btn-cancel {
  min-width: 96px;
  height: 36px;
  border-radius: 18px;
  font-size: 14px;
  cursor: pointer;
  border: none;
}
.btn-save {
  background: #ec4141;
  color: #fff;
}
.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-cancel {
  background: #fff;
  color: #333;
  border: 1px solid #d9d9d9;
}
.btn-cancel:hover {
  border-color: #ec4141;
  color: #ec4141;
}
.right {
  width: 140px;
  flex-shrink: 0;
  padding-top: 4px;
}
.avatar-wrap {
  position: relative;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
}
.avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(145deg, #ff8a80, #ec4141);
  background-size: cover;
  background-position: center;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  font-weight: 600;
}
.avatar-mask {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  opacity: 0;
  transition: opacity 0.15s;
}
.avatar-wrap:hover .avatar-mask {
  opacity: 1;
}
.file-input {
  display: none;
}

@media (max-width: 720px) {
  .form-wrap {
    flex-direction: column-reverse;
    gap: 24px;
  }
  .right {
    align-self: center;
  }
}
</style>
