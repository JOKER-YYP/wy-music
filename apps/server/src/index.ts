import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { config } from './config.js'
import { ensureStorageDirs } from './utils/storage.js'
import authRoutes from './routes/auth.js'
import trackRoutes from './routes/tracks.js'
import likeRoutes from './routes/likes.js'
import historyRoutes from './routes/history.js'
import discoverRoutes from './routes/discover.js'
import adminRoutes from './routes/admin/index.js'
import playlistRoutes from './routes/playlists.js'
import commentRoutes from './routes/comments.js'
import notificationRoutes from './routes/notifications.js'
import { ok } from './utils/response.js'

ensureStorageDirs()

const app = express()

app.use(
  cors({
    origin: config.corsOrigin.includes('*') ? true : config.corsOrigin,
    credentials: true,
    exposedHeaders: ['Accept-Ranges', 'Content-Range', 'Content-Length', 'Content-Type'],
  }),
)
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/api/health', (_req, res) => ok(res, { status: 'ok', time: new Date().toISOString() }))

app.use('/media', express.static(config.storageRoot))

app.use('/api/auth', authRoutes)
app.use('/api/tracks', trackRoutes)
app.use('/api/likes', likeRoutes)
app.use('/api/history', historyRoutes)
app.use('/api/discover', discoverRoutes)
app.use('/api/playlists', playlistRoutes)
app.use('/api/comments', commentRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/admin', adminRoutes)

app.use((_req, res) => {
  res.status(404).json({ code: 40400, message: 'Not Found', data: null })
})

app.listen(config.port, () => {
  console.log(`[wy-music-server] http://127.0.0.1:${config.port}`)
  console.log(`[storage] ${path.resolve(config.storageRoot)}`)
})
