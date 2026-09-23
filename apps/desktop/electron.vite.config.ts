import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@wy-music/shared'] })],
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@wy-music/shared'] })],
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
      },
    },
    plugins: [vue()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
        '/media': { target: 'http://127.0.0.1:3001', changeOrigin: true },
      },
    },
  },
})
