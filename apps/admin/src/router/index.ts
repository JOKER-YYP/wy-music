import { createRouter, createWebHistory } from 'vue-router'
import { useAdminStore } from '../stores/admin'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('../layouts/AdminLayout.vue'),
      redirect: '/dashboard',
      children: [
        { path: 'dashboard', component: () => import('../views/DashboardView.vue') },
        { path: 'tracks', component: () => import('../views/TracksView.vue') },
        { path: 'users', component: () => import('../views/UsersView.vue') },
        { path: 'playlists', component: () => import('../views/PlaylistsView.vue') },
        { path: 'banners', component: () => import('../views/BannersView.vue') },
        { path: 'comments', component: () => import('../views/CommentsView.vue') },
        { path: 'settings', component: () => import('../views/SettingsView.vue') },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const admin = useAdminStore()
  admin.restore()
  if (!to.meta.public && !admin.accessToken) return { name: 'login' }
  if (to.name === 'login' && admin.accessToken) return { path: '/dashboard' }
})

export default router
