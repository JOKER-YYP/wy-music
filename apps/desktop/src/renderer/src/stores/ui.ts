import { defineStore } from 'pinia'
import type { TrackDto } from '@wy-music/shared'

/** page=浅色整页评论(图一)；player=播放页暗色评论(图三) */
export type CommentsMode = 'page' | 'player'

export const useUiStore = defineStore('ui', {
  state: () => ({
    loginModalVisible: false,
    loginModalTab: 'login' as 'login' | 'register',
    nowPlayingVisible: false,
    collectModalVisible: false,
    collectTrack: null as TrackDto | null,
    commentsVisible: false,
    commentsMode: 'page' as CommentsMode,
    commentsTrack: null as TrackDto | null,
  }),
  actions: {
    openLogin(tab: 'login' | 'register' = 'login') {
      this.loginModalTab = tab
      this.loginModalVisible = true
    },
    closeLogin() {
      this.loginModalVisible = false
    },
    openNowPlaying() {
      this.commentsVisible = false
      this.nowPlayingVisible = true
    },
    closeNowPlaying() {
      this.nowPlayingVisible = false
    },
    toggleNowPlaying() {
      this.nowPlayingVisible = !this.nowPlayingVisible
    },
    openCollect(track: TrackDto) {
      this.collectTrack = track
      this.collectModalVisible = true
    },
    closeCollect() {
      this.collectModalVisible = false
      this.collectTrack = null
    },
    /** 其他入口：浅色评论页 */
    openPageComments(track: TrackDto) {
      this.commentsTrack = track
      this.commentsMode = 'page'
      this.commentsVisible = false
    },
    /** 播放页入口：暗色评论层 */
    openPlayerComments(track: TrackDto) {
      this.commentsTrack = track
      this.commentsMode = 'player'
      this.commentsVisible = true
      this.nowPlayingVisible = true
    },
    closeComments() {
      this.commentsVisible = false
      if (this.commentsMode === 'player') {
        // 回到播放页
        this.nowPlayingVisible = true
      }
      this.commentsTrack = null
    },
    /** 兼容旧调用：默认浅色页由调用方跳路由 */
    openComments(track: TrackDto, mode: CommentsMode = 'page') {
      if (mode === 'player') this.openPlayerComments(track)
      else this.openPageComments(track)
    },
  },
})
