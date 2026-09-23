# WY Music — 仿网易云自建曲库播放器

Vue 3 + TypeScript + Vite + Electron + Element Plus（用户端）  
Vue 3 + Element Plus（管理端）  
Node.js + Express + Prisma（后端，本地开发使用 SQLite）

详细设计见 [docs/项目说明.md](docs/项目说明.md)。

## 环境要求

- Node.js **≥ 20**（可用 nvm：`nvm use 20`）
- pnpm 9+

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 构建共享类型包
pnpm --filter @wy-music/shared build

# 3. 初始化数据库并写入管理员
pnpm db:generate
pnpm db:push
pnpm db:seed

# 4. 启动后端（新开终端）
pnpm dev:server

# 5. 启动用户端 Electron（新开终端）
pnpm dev:desktop

# 6. 启动管理端 Web（新开终端）
pnpm dev:admin
```

| 服务 | 地址 |
|------|------|
| API | http://127.0.0.1:3001 |
| 管理端 | http://127.0.0.1:5174 |
| 用户端 | Electron 窗口（Vite :5173） |

### 默认管理员

- 账号：`admin`
- 密码：`admin123`

普通用户请在用户端注册。

## 目录结构

```text
apps/desktop   # Electron 用户端
apps/admin     # Web 管理端
apps/server    # Express API
packages/shared
docs/
```

## MVP 已实现

- 用户注册 / 登录（JWT）
- 公共曲库列表、搜索、播放（需登录）
- 登录用户上传歌曲到公共库
- 我喜欢 / 最近播放 / 我的上传
- 管理端：仪表盘、歌曲审核（通过/驳回/下架/删除）、用户启用禁用

## 说明

- 本地开发数据库为 **SQLite**（`apps/server/prisma/dev.db`），便于零配置启动；生产可按文档切换 MySQL。
- 上传文件保存在 `apps/server/storage/`。
- 请勿上传无版权授权的商用音乐；本项目仅供学习演示。
