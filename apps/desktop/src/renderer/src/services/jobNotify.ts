import { ElNotification } from 'element-plus'
import { http } from './http'
import { useUserStore } from '../stores/user'
import router from '../router'

export type JobNotifyKind = 'batch_search_done' | 'batch_download_done'

const LINK = '/batch-search'

/** 通知 AppLayout 刷新未读角标 */
export function emitNotificationsChanged() {
  window.dispatchEvent(new CustomEvent('wy:notifications-changed'))
}

/**
 * 任务完成：写入系统通知（需登录）+ 桌面弹窗，点击跳转批量搜歌页
 */
export async function notifyBatchJobDone(opts: {
  kind: JobNotifyKind
  title: string
  body: string
}) {
  const user = useUserStore()
  if (user.accessToken) {
    try {
      await http.post(
        '/api/notifications/system-self',
        {
          type: opts.kind,
          title: opts.title,
          body: opts.body,
          refId: LINK,
        },
        { silent: true } as never,
      )
      emitNotificationsChanged()
    } catch {
      // 接口失败时仍弹本地通知
    }
  }

  ElNotification({
    title: opts.title,
    message: opts.body,
    type: 'success',
    duration: 8000,
    position: 'bottom-right',
    onClick: () => {
      void router.push(LINK)
    },
  })
}
