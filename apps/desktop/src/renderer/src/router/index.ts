import { createRouter, createWebHashHistory } from 'vue-router'
import { useUserStore } from '../stores/user'
import { useUiStore } from '../stores/ui'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/mini-player',
      name: 'mini-player',
      component: () => import('../views/MiniPlayerWidget.vue'),
      meta: { public: true, mini: true },
    },
    {
      path: '/desktop-lyric',
      name: 'desktop-lyric',
      component: () => import('../views/DesktopLyricOverlay.vue'),
      meta: { public: true, desktopLyric: true },
    },
    {
      path: '/desktop-lyric-menu',
      name: 'desktop-lyric-menu',
      component: () => import('../views/DesktopLyricMenu.vue'),
      meta: { public: true, desktopLyric: true },
    },
    {
      path: '/',
      component: () => import('../layouts/AppLayout.vue'),
      redirect: '/discover',
      children: [
        {
          path: 'discover',
          name: 'discover',
          component: () => import('../views/DiscoverView.vue'),
          meta: { public: true },
        },
        {
          path: 'library',
          name: 'library',
          component: () => import('../views/LibraryView.vue'),
          meta: { public: true },
        },
        {
          path: 'search',
          name: 'search',
          component: () => import('../views/SearchView.vue'),
          meta: { public: true },
        },
        {
          path: 'upload',
          name: 'upload',
          component: () => import('../views/UploadView.vue'),
          meta: { auth: true },
        },
        {
          path: 'liked',
          name: 'liked',
          component: () => import('../views/LikedView.vue'),
          meta: { auth: true },
        },
        {
          path: 'recent',
          name: 'recent',
          component: () => import('../views/RecentView.vue'),
          meta: { auth: true },
        },
        {
          path: 'mine',
          name: 'mine',
          component: () => import('../views/MineUploadsView.vue'),
          meta: { auth: true },
        },
        {
          path: 'playlist/:id',
          name: 'playlist',
          component: () => import('../views/PlaylistDetailView.vue'),
          meta: { auth: true },
        },
        {
          path: 'chart/:id',
          name: 'chart',
          component: () => import('../views/ChartDetailView.vue'),
          meta: { public: true },
        },
        {
          path: 'artist/:name',
          name: 'artist',
          component: () => import('../views/ArtistDetailView.vue'),
          meta: { public: true },
        },
        {
          path: 'comment/:id',
          name: 'comment',
          component: () => import('../views/CommentsView.vue'),
          meta: { public: true },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('../views/SettingsView.vue'),
          meta: { auth: true },
        },
        {
          path: 'profile',
          name: 'profile',
          component: () => import('../views/ProfileView.vue'),
          meta: { auth: true },
        },
      ],
    },
    // 兼容旧链接：整页登录改为打开弹窗
    {
      path: '/login',
      name: 'login',
      redirect: () => {
        const ui = useUiStore()
        ui.openLogin('login')
        return '/discover'
      },
    },
  ],
})

router.beforeEach((to) => {
  const user = useUserStore()
  user.restore()
  if (to.meta.auth && !user.accessToken) {
    const ui = useUiStore()
    sessionStorage.setItem('loginRedirect', to.fullPath)
    ui.openLogin('login')
    return { path: '/discover' }
  }
})

export default router
