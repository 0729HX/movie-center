# 个人影院 — Movie Center

面向本地家庭影院的影视聚合管理应用，集 TMDB 在线元数据、本地媒体索引、多源评分聚合、刮削自动化于一体。Apple Design System 深色主题 UI。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + TypeScript + Vite 6 |
| 后端 | Express 4 + TypeScript + tsx |
| 数据库 | MySQL 8.0+ (mysql2) |
| 缓存 | Redis (ioredis)，优雅降级 |
| 外部 API | TMDB、OMDb、豆瓣代理 |
| 播放器 | PotPlayer (child_process) |
| 刮削 | tinyMediaManager CLI |

## 目录结构

```text
movie-app/
  client/                    React 前端
    src/
      App.tsx                主应用（状态中心、页面路由）
      main.tsx               入口
      types.ts               类型定义
      components/
        Navbar.tsx            导航栏（Logo、链接、搜索）
        HeroBanner.tsx        首页轮播 Hero
        PosterCard.tsx        海报卡片（hover 简介、收藏按钮）
        PosterWall.tsx        海报网格墙（分页、分类筛选、无限滚动）
        MovieRow.tsx          水平滚动行
        LocalMediaView.tsx    本地影视（扫描、分类筛选、卡片）
        DetailModal.tsx       详情弹窗（演员、推荐、评分）
        RatingBadge.tsx       多源评分徽章
        ErrorBoundary.tsx     错误边界
        SettingsPanel.tsx     设置面板
      styles/global.css       全局样式
  server/                    Express 后端
    src/
      index.ts               服务入口
      db.ts                  MySQL 连接池
      types.ts               类型定义
      routes/
        trending.ts           热门 API
        movies.ts             电影 API
        tv.ts                 剧集 API
        search.ts             搜索 API
        detail.ts             详情 API（缓存 1h）
        local.ts              本地影视 CRUD + 预缓存
        config.ts             配置读写
        watcher.ts            文件监控
      services/
        tmdb.ts               TMDB/OMDb/豆瓣客户端 + 评分聚合
        scanner.ts            递归扫描器
        player.ts             PotPlayer 启动
        watcher.ts            文件系统监控
        cache.ts              Redis 缓存封装
  schema.sql                 数据库初始化
```

## 快速开始

### 环境要求

- Node.js 20+
- MySQL 8.0+
- Redis（可选，不启动则自动降级）
- Windows（PotPlayer + TMM 依赖）

### 1. 初始化数据库

```bash
mysql -u root -p < schema.sql
```

创建数据库 `movie_app`，表：`local_media`、`rating_cache`、`config`。

### 2. 安装依赖

```bash
cd client && npm install
cd server && npm install
```

### 3. 启动

```bash
# 后端 (端口 3001)
cd server && npm run dev

# 前端 (端口 5173，自动代理 /api → 3001)
cd client && npm run dev
```

## 核心功能

### 在线影视浏览

- **首页**：Hero 轮播 + 热门电影/剧集网格，5 分钟客户端缓存
- **电影/剧集**：分页 + 分类筛选 + 无限滚动加载
- **搜索**：跨电影/剧集/人物多类型搜索
- **详情弹窗**：0ms 立即显示（列表数据），后台渐进增强（演员 + 推荐 + 多源评分）
- **推荐联动**：详情页推荐卡片点击 → 当前系统内打开新详情

### 多源评分聚合

| 来源 | 图标 | 说明 |
|------|------|------|
| TMDB | T (绿) | 实时从 API 获取 |
| IMDb | i (黄) | OMDb 缓存，首次抓取后持久化 |
| Rotten Tomatoes | RT (红) | OMDb 缓存 |
| Metacritic | M (黄) | OMDb 缓存 |
| 豆瓣 | 豆 (绿) | 豆瓣代理 API，缓存策略同上 |

评分缓存表 `rating_cache` 持久化，OMDb/豆瓣不走 Redis 过期。

### 本地媒体管理

- **递归扫描**：给定根路径，自动下钻多级子目录查找所有视频文件
- **智能识别**：电影（目录含视频文件）/ 剧集（Season 子目录或 S01E01 命名）
- **NFO 解析**：兼容 `<tmdbid>` 和 `<uniqueid type="tmdb">` 两种格式
- **文件去重**：按 `local_path` 精确去重，重复扫描区分新增/更新/跳过
- **分类筛选**：全部 / 电影 / 剧集 标签切换
- **详情预加载**：无 TMDB 匹配 → 列表数据即详情（0ms）；有匹配 → 后台搜索 TMDB + 回写 tmdb_id
- **全量预缓存**：打开本地影视页即后台预热所有项目详情（有 TMDB ID 直接缓存，无则搜索匹配后缓存）
- **PotPlayer 播放**：一键调用本地播放器打开视频文件

### 自动化

- **TMM 刮削**：配置文件监控目录，新视频自动触发刮削
- **文件监控**：轮询检测 + TMM 集成 + 自动移动到输出目录

### 性能优化

| 优化项 | 方案 |
|--------|------|
| 客户端缓存 | Tab 切换不重载，5 分钟 TTL |
| 详情 0ms 打开 | 列表数据立即显示 + 后台渐进增强 |
| 推荐联动 | 系统内弹窗，不跳转外部 |
| 本地详情预缓存 | 列表加载时后台预热全部项目 |
| 扫描后预热 | 新发现 TMDB 项目自动预缓存 |
| Redis 缓存 | 热门 10min / 列表 30min / 详情 1h / 分类 24h |
| 服务端搜索回退 | 无 TMDB ID 时按标题+年份自动搜索匹配 |
| 推广 | 本地影视详情懒加载 → 主动预缓存 |

## API 路由

### 在线内容

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/trending` | 本周热门（缓存 10min） |
| GET | `/api/movies?page=&genre=` | 电影列表（缓存 30min） |
| GET | `/api/movies/genres` | 电影分类（缓存 24h） |
| GET | `/api/tv?page=&genre=` | 剧集列表（缓存 30min） |
| GET | `/api/tv/genres` | 剧集分类（缓存 24h） |
| GET | `/api/search?q=` | 搜索 |
| GET | `/api/detail/:type/:id` | 在线详情（缓存 1h） |

### 本地媒体

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/local` | 本地媒体列表（响应后自动预缓存详情） |
| POST | `/api/local/scan` | 扫描目录（递归下钻 + 去重 + 预热缓存） |
| POST | `/api/local/save` | 收藏到本地（自动预热详情） |
| DELETE | `/api/local/:id` | 删除本地收藏 |
| GET | `/api/local/detail/:id` | 本地影视详情（含 TMDB 搜索匹配） |
| POST | `/api/local/play/:id` | PotPlayer 播放 |
| GET | `/api/local/file?path=` | 本地海报/背景图服务 |

### 系统

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/PUT | `/api/config` | 系统配置读写 |
| GET | `/api/watcher/status` | 文件监控状态 |
| POST | `/api/watcher/start` | 启动监控 |
| POST | `/api/watcher/stop` | 停止监控 |
| GET | `/api/health` | 健康检查 |

## 配置项

| 键 | 说明 |
|----|------|
| `potplayer_path` | PotPlayer 可执行文件路径 |
| `media_root` | 媒体根目录 |
| `tmdb_api_key` | TMDB API Key |
| `omdb_api_key` | OMDb API Key（可选，留空仅 TMDB 评分） |
| `tmm_path` | tinyMediaManager CLI 路径 |
| `tmm_args` | TMM 启动参数 |
| `watch_dir` | 文件监控目录 |
| `output_dir` | 刮削后输出目录 |

## 本地媒体目录约定

扫描器支持多级嵌套，自动下钻直到找到视频文件：

```text
D:/media/
  Movies/                         ← 无视频，继续下钻
    Sci-Fi/                       ← 无视频，继续下钻
      Inception (2010)/           ← 有 .mkv → 处理！
        Inception (2010).mkv
        poster.jpg
        movie.nfo
  TV Shows/                       ← 无视频，继续下钻
    Breaking Bad/                 ← 有 Season 子目录 → 处理为剧集！
      tvshow.nfo
      Season 01/
        S01E01.mkv
```

## TODO

### P0 — 自动下载未收藏影视

未下载到本地的收藏影视，自动查找高质量夸克网盘链接并转存下载到指定文件夹。

**流程设计**：
```
用户收藏影视（无本地文件）
  → 后台标记为 "待下载"
  → 调用夸克网盘搜索 API（按标题 + 年份 + 分辨率关键词）
  → 过滤高质量链接（≥1080p，优先 BluRay/Remux/原盘）
  → 自动转存到夸克网盘指定目录
  → 推送到本地下载队列
  → aria2 / 夸克客户端下载到指定文件夹
  → 下载完成 → 触发目录扫描 → 自动索引 → 预热缓存
```

**技术要点**：
- 夸克网盘搜索 API / 第三方聚合搜索接口
- 链接质量评分（分辨率、编码、音频、字幕）
- 自动转存（夸克 Cookie / Token 鉴权）
- 下载队列管理（并发数、重试、断点续传）
- 下载完成回调 → 触发 scanner + preCache

### P1 — 完善自动刮削流水线

- TMM 刮削失败时的重试和回退策略
- 支持多 TMM 实例并行刮削
- 刮削完成后自动触发本地索引更新和预热

### P2 — 架构优化

- 抽取前端数据请求为 hooks / React Query
- `.env` 配置文件收口敏感信息
- 前端状态管理拆分（当前全部集中在 App.tsx）
- `/api/local/file` 增加访问路径白名单限制
- 拆分 `local_media` 为收藏表和索引表

### P3 — 功能增强

- 合集/系列视图（自动聚合同系列电影）
- 演员/导演详情页
- 播放历史记录 + 断点续播
- 字幕自动下载匹配
- PWA 支持（离线缓存海报和元数据）

### P4 — 工程化

- 单元测试 + E2E 测试
- ESLint + Prettier
- Docker 部署方案
- CI/CD 自动构建

## 已知限制

- 配置和密钥存在数据库 `config` 表，适合本地使用
- PotPlayer / TMM 依赖 Windows 环境
- `/api/local/file` 通过绝对路径读取本地文件，建议生产环境加白名单
- 前端状态集中在 `App.tsx`，功能增多后维护成本升高
