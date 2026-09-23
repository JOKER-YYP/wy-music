import axios from 'axios'
import type { ApiResponse } from '@wy-music/shared'
import { ElMessage } from 'element-plus'

export const http = axios.create({
  baseURL: '',
  timeout: 30000,
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminAccessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => {
    const body = res.data as ApiResponse
    if (body && typeof body.code === 'number' && body.code !== 0) {
      ElMessage.error(body.message || '请求失败')
      return Promise.reject(body)
    }
    return res
  },
  (err) => {
    ElMessage.error(err.response?.data?.message || err.message || '网络错误')
    if (err.response?.status === 401) {
      localStorage.removeItem('adminAccessToken')
      localStorage.removeItem('adminUser')
    }
    return Promise.reject(err)
  },
)
