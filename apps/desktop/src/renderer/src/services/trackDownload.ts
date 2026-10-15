import type { TrackDto } from '@wy-music/shared'
import { isExternalTrackId, parseExternalTrackId } from '@wy-music/shared'
import { ElMessage, ElMessageBox } from 'element-plus'
import { importExternalToLibrary, resolveExternalDetail } from './externalMusic'
import { streamUrl } from './http'
import { isElectronApp } from './localUpload'

function sanitizeFileName(name: string) {
  return (
    String(name || '未命名')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || '未命名'
  )
}

function guessExtFromUrl(url: string) {
  const clean = url.split('?')[0].toLowerCase()
  const m = clean.match(/\.(mp3|flac|wav|m4a|aac)(?:$|\/)/)
  return m ? `.${m[1]}` : '.mp3'
}

export function suggestedDownloadName(track: TrackDto, ext = '.mp3') {
  const artist = (track.artists || []).filter(Boolean).join('、') || ''
  const base = artist ? `${artist} - ${track.name}` : track.name
  const safe = sanitizeFileName(base)
  return safe.toLowerCase().endsWith(ext.toLowerCase()) ? safe : `${safe}${ext}`
}

export function isExternalTrack(track: TrackDto) {
  return isExternalTrackId(track.id) || Boolean(track.source && track.source !== 'local')
}

/** 外部曲：选曲库 / 自定义；曲库曲：仅自定义 */
export async function pickDownloadMode(
  track: TrackDto,
): Promise<'library' | 'file' | null> {
  if (!isExternalTrack(track)) return 'file'
  try {
    await ElMessageBox.confirm(
      `「${track.name}」\n\n下载到曲库：写入服务器曲库，可在线播放\n自定义路径：保存到本机，可改文件名与位置`,
      '选择下载方式',
      {
        distinguishCancelAndClose: true,
        confirmButtonText: '下载到曲库',
        cancelButtonText: '自定义路径…',
        type: 'info',
        closeOnClickModal: false,
      },
    )
    return 'library'
  } catch (action) {
    if (action === 'cancel') return 'file'
    return null
  }
}

/** 弹出另存为对话框（自定义文件名 + 位置） */
export async function chooseLocalSavePath(track: TrackDto): Promise<string | null> {
  if (!isElectronApp() || !window.wyAPI?.saveAudioFile) {
    throw new Error('请在桌面端使用自定义下载')
  }
  return window.wyAPI.saveAudioFile({
    defaultName: suggestedDownloadName(track, '.mp3'),
    title: '下载到本地',
  })
}

async function resolveDownloadSource(track: TrackDto): Promise<{
  url: string
  lyricText?: string | null
}> {
  if (isExternalTrack(track)) {
    const parsed =
      parseExternalTrackId(track.id) ||
      (track.source && track.source !== 'local' && track.externalId
        ? { source: track.source, externalId: track.externalId }
        : null)
    if (!parsed) throw new Error('无法识别外部曲目')
    const detail = await resolveExternalDetail(parsed.source, parsed.externalId)
    if (!detail.musicUrl) throw new Error('未获取到可下载的音频地址')
    return {
      url: detail.musicUrl,
      lyricText: detail.lyricText,
    }
  }
  if (!localStorage.getItem('accessToken')) {
    throw new Error('请先登录')
  }
  return {
    url: streamUrl(track.id),
    lyricText: track.lyricText,
  }
}

/** 下载到已选定的本机路径 */
export async function downloadTrackToPath(
  track: TrackDto,
  destPath: string,
): Promise<string> {
  if (!window.wyAPI?.downloadFile) {
    throw new Error('请在桌面端使用自定义下载')
  }
  const source = await resolveDownloadSource(track)
  await window.wyAPI.downloadFile({ url: source.url, destPath })

  const lyric = String(source.lyricText || '').trim()
  if (lyric && window.wyAPI.writeTextFile) {
    const lrcPath = destPath.replace(/\.[^.]+$/, '') + '.lrc'
    try {
      await window.wyAPI.writeTextFile({ path: lrcPath, text: lyric })
    } catch {
      /* 歌词失败不阻断 */
    }
  }
  return destPath
}

/** 自定义路径：先选位置，再下载（供调用方控制 loading） */
export async function downloadTrackToLocalFile(track: TrackDto): Promise<string | null> {
  const destPath = await chooseLocalSavePath(track)
  if (!destPath) return null
  return downloadTrackToPath(track, destPath)
}

/** 下载到曲库 */
export async function downloadTrackToLibrary(track: TrackDto) {
  if (!isExternalTrack(track)) {
    throw new Error('曲库歌曲请使用自定义路径下载到本地')
  }
  if (!localStorage.getItem('accessToken')) {
    throw new Error('请先登录')
  }
  const imported = await importExternalToLibrary(track)
  ElMessage.success(
    imported.status === 'pending'
      ? `「${imported.name}」已提交审核`
      : `「${imported.name}」已下载到曲库`,
  )
  return imported
}

// 保留导出，避免未使用告警（扩展名推断可供后续）
export { guessExtFromUrl }
