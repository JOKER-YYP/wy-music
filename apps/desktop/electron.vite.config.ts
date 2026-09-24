import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

/** 开发时直接吃 shared 源码，避免 dist 未重建导致解析逻辑不生效 */
const sharedSrc = resolve(__dirname, '../../packages/shared/src/index.ts')

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@wy-music/shared': sharedSrc,
      },
    },
    plugins: [externalizeDepsPlugin({ exclude: ['@wy-music/shared'] })],
  },
  preload: {
    resolve: {
      alias: {
        '@wy-music/shared': sharedSrc,
      },
    },
    plugins: [externalizeDepsPlugin({ exclude: ['@wy-music/shared'] })],
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@wy-music/shared': sharedSrc,
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
