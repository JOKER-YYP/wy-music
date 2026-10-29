# WY Music — 仿网易云自建曲库播放器

Vue 3 + TypeScript + Vite + Electron + Element Plus（用户端）  
Vue 3 + Element Plus（管理端）  
Node.js + Express + Prisma（后端，本地开发使用 SQLite）

详细设计见 [docs/项目说明.md](docs/项目说明.md)。视觉 token 见 [DESIGN.md](DESIGN.md)。

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
DESIGN.md
```

## 已实现能力（摘要）

- 用户注册 / 登录（JWT）；公共曲库列表、搜索、播放、上传
- 我喜欢 / 最近播放 / 我的上传；歌单 CRUD 与批量操作
- 发现页、每日推荐、评论、消息、桌面歌词、迷你播放器
- **多音源外部搜索**（可勾选源，含下歌吧·夸克 / 下歌吧·百度）
- **批量搜歌**（Excel 清单、完全匹配、源优先级、下载到曲库或文件夹）
- **夸克 / 百度网盘登录**（顶栏）：下歌吧资源解析与本机下载
- 管理端：仪表盘、歌曲审核、用户启用禁用

## 说明

- 本地开发数据库为 **SQLite**（`*.db` 已 gitignore；克隆后 `pnpm install` 会生成 Prisma Client，再执行 `pnpm db:push` / `pnpm db:seed`）。
- Prisma 生成代码、本地上传文件均不提交；仅保留 `schema` / `seed` 与 `storage/samples` 示例曲。
- 自建曲库为播放与归属的权威来源；外部音源仅用于搜索与导入，请勿上传无版权授权的商用音乐。本项目仅供学习演示。
