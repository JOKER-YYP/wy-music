import axios from 'axios'
import type { ApiResponse } from '@wy-music/shared'
import { ElMessage } from 'element-plus'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export const http = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
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
    const msg = err.response?.data?.message || err.message || '网络错误'
    if (err.response?.status === 401) {
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
    }
    ElMessage.error(msg)
    return Promise.reject(err)
  },
)

export function mediaUrl(path?: string | null) {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path
  // 已是公开路径
  if (path.startsWith('/media/')) return `${API_BASE}${path}`
  // 其它绝对路径（如 /api/...）
  if (path.startsWith('/')) return `${API_BASE}${path}`
  // 相对存储路径：covers/xxx.jpg → /media/covers/xxx.jpg
  return `${API_BASE}/media/${path.replace(/^\/+/, '')}`
}

export function streamUrl(trackId: string) {
  const token = localStorage.getItem('accessToken') || ''
  return `${API_BASE}/api/tracks/${trackId}/stream?token=${encodeURIComponent(token)}`
}
