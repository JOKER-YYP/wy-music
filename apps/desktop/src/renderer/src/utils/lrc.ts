export interface LyricLine {
  time: number
  text: string
}

/** 解析 LRC；无时间轴时按空行/换行拆成伪歌词 */
export function parseLrc(raw?: string | null): LyricLine[] {
  if (!raw?.trim()) return []

  const lines: LyricLine[] = []
  const timeTag = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?]/g

  for (const row of raw.split(/\r?\n/)) {
    const text = row.replace(timeTag, '').trim()
    const tags = [...row.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)]
    if (!tags.length) continue
    for (const m of tags) {
      const min = Number(m[1])
      const sec = Number(m[2])
      const frac = m[3] ? Number(m[3].padEnd(3, '0').slice(0, 3)) / 1000 : 0
      lines.push({ time: min * 60 + sec + frac, text: text || ' ' })
    }
  }

  if (lines.length) {
    return lines.sort((a, b) => a.time - b.time)
  }

  // 纯文本歌词：均匀分配时间占位（仅展示）
  return raw
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, i) => ({ time: i * 3, text }))
}

export function findLyricIndex(lines: LyricLine[], currentTime: number) {
  if (!lines.length) return -1
  let idx = 0
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime + 0.15) idx = i
    else break
  }
  return idx
}
