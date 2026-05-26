# 个人影院 (Movie Center) — Claude Code 项目指南

## 项目概述

React 19 + Vite 6 + Express 4 + TypeScript 全栈个人影视管理应用，集成 TMDB 在线数据和本地 NAS/硬盘影视文件管理。

## 技术栈

- **前端**: React 19, Vite 6, TypeScript, react-router-dom, CSS (Apple Design System 深色主题)
- **后端**: Express 4, TypeScript, tsx watch
- **数据库**: MySQL (movie_app, root/root)
- **缓存**: Redis (ioredis, prefix `mc:`)
- **外部 API**: TMDB, OMDb

## 端口

- Client: `5173` (Vite dev server)
- Server: `3001` (Express API)

## 启动命令

```bash
# 开发模式
cd server && npm run dev   # tsx watch, 自动重启
cd client && npm run dev   # Vite HMR
```

## 架构

### 前端状态管理

```
DataContext (useReducer) > AppContext (fetch) > DetailContext (actions)
```

- `context/DataContext.tsx` — useReducer 包装器 + useMemo
- `context/AppContext.tsx` — fetch 函数 + 搜索/分页逻辑
- `context/DetailContext.tsx` — 详情弹窗操作
- `context/hooks.ts` — useData() / useApp() / useDetail()
- `reducers/dataReducer.ts` — 18 个 action 类型

### 后端 API 路由

- `routes/tmdb.ts` — /api/trending, /api/movies, /api/tv, /api/search, /api/genres
- `routes/detail.ts` — /api/detail/:type/:id
- `routes/local.ts` — /api/local/* (CRUD, scan, play, batch)
- `routes/config.ts` — /api/config (设置)

### 核心服务

- `services/tmdb.ts` — TMDB API + OMDb 评分 + external_ids 缓存 + getDetailFull 合并请求
- `services/scanner.ts` — 目录递归扫描 + NFO 解析 + 去重
- `services/cache.ts` — Redis 缓存层
- `services/player.ts` — PotPlayer 播放控制

## 缓存策略

| 资源 | TTL | 说明 |
|------|-----|------|
| trending | 10min | 热门榜单 |
| movies/tv | 30min | 分类列表 |
| detail | 1h | 影视详情 (append_to_response 单次请求) |
| genres | 24h | 分类列表 |
| external_ids | 24h (内存) | tmdb_id → imdb_id 映射 |

## 评分来源

TMDB (实时) + OMDb (DB 缓存, 提供 IMDb/RT/Metacritic)

## 注意事项

- mysql2 DECIMAL 列返回字符串，需 `Number()` 转换
- DetailModal 是 overlay 模式（非路由），不改变 URL
- 本地影视海报区分本地文件路径和 TMDB URL（`startsWith('http')`）
- 删除本地影视会同步删除影视文件夹（含 season 目录检测）
