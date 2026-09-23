import type { Response } from 'express'
import type { ApiResponse } from '@wy-music/shared'

export function ok<T>(res: Response, data: T, message = 'ok') {
  const body: ApiResponse<T> = { code: 0, message, data }
  return res.json(body)
}

export function fail(res: Response, code: number, message: string, status = 400) {
  const body: ApiResponse<null> = { code, message, data: null }
  return res.status(status).json(body)
}
