export function mediaUrl(pathOrUrl?: string | null) {
  if (!pathOrUrl) return ''
  if (/^https?:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith('/')) return pathOrUrl
  return `/media/${pathOrUrl.replace(/^\/+/, '')}`
}

export function adminStreamUrl(trackId: string) {
  const token = localStorage.getItem('adminAccessToken') || ''
  return `/api/tracks/${trackId}/stream?token=${encodeURIComponent(token)}`
}

export function formatBytes(n: number) {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
