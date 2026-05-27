# Deep Interview Spec: 个人影院项目全面优化

## Metadata
- Interview ID: movie-center-optimize-2026-05-28
- Rounds: 16
- Final Ambiguity Score: 19.3%
- Type: brownfield
- Generated: 2026-05-28
- Threshold: 0.2
- Threshold Source: default
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.315 |
| Constraint Clarity | 0.80 | 0.25 | 0.200 |
| Success Criteria | 0.75 | 0.25 | 0.188 |
| Context Clarity | 0.70 | 0.15 | 0.105 |
| **Total Clarity** | | | **0.808** |
| **Ambiguity** | | | **19.3%** |

## Topology

| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| 前端设计优化 | active | Tailwind CSS 全量迁移 + 暗色主题精修 + 全页面视觉/交互优化 | 所有页面和组件均需改进，保持现有暗色主题 |
| 现有功能优化 | active | 搜索/本地影视/详情/性能四维度优化，合理性能目标 | 准确率/成功率量化指标验证 |
| 功能扩展 | active | 媒体管理增强：元数据刮削、字幕管理、文件整理、轨道物理移除 | 开源 API 数据源，ffmpeg 轨道移除 |

## Goal

对个人影院项目进行全面优化，涵盖三大方向：
1. **前端设计优化**：将现有 3058 行 global.css + 14 组件 + 6 页面全量迁移到 Tailwind CSS，保持"Cinematic Editorial"暗色主题风格，精修视觉细节和交互体验
2. **现有功能优化**：改进搜索体验、本地影视管理、详情弹窗浏览、数据加载性能，以合理性能为目标
3. **功能扩展**：新增四个媒体管理功能——元数据刮削（开源 API）、字幕管理（开源 API）、文件整理（批量重命名/目录整理）、视频音轨和字幕轨道物理移除（ffmpeg）

## Constraints
- 保持现有暗色主题风格（Cinematic Editorial v4 色彩体系）
- Tailwind CSS 全量迁移（替换现有 global.css 和所有组件内联类）
- 性能目标：合理即可（首屏 < 4s，不卡顿，不追求极致）
- 新增外部依赖：ffmpeg（轨道移除）、开源字幕/刮削 API
- 不改变现有后端架构（Express + MySQL + Redis）
- 不改变现有路由结构（react-router-dom 6 路由）
- 不引入新的状态管理方案（保持 useReducer + Context）

## Non-Goals
- 不引入 UI 组件库（Ant Design / MUI 等）
- 不改变主题色（保持暗色）
- 不添加多用户/共享功能
- 不添加观影记录/历史功能
- 不添加推荐/片单功能
- 不扩展设置页功能
- 不进行转码/压缩功能开发

## Acceptance Criteria
- [ ] Tailwind CSS 全量迁移完成，global.css 可删除或仅保留 CSS 变量定义
- [ ] 所有 14 个组件 + 6 个页面使用 Tailwind 类
- [ ] 暗色主题视觉风格保持一致（色彩、间距、圆角、阴影等）
- [ ] 页面切换动画流畅，无明显卡顿
- [ ] 搜索体验改进（响应速度、结果展示）
- [ ] 本地影视管理体验改进（扫描、播放、批量操作）
- [ ] 详情弹窗信息展示优化
- [ ] 数据加载性能合理（首屏 < 4s）
- [ ] 字幕管理功能可用：能通过开源 API 匹配和下载字幕，匹配成功率可量化
- [ ] 元数据刮削功能可用：能通过开源 API 获取影视元数据，刮削成功率可量化
- [ ] 文件整理功能可用：支持批量重命名和目录结构整理
- [ ] 轨道移除功能可用：能通过 ffmpeg 从视频文件中物理移除不需要的音轨/字幕轨道
- [ ] 所有功能流程可跑通（输入→处理→输出）
- [ ] 主观体验达标（用户手动测试满意）

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 用户想引入 UI 组件库 | 提供了 4 个选项 | 选择 Tailwind CSS（实用优先，不改变组件结构） |
| 用户想改变主题色 | 提供了风格选项 | 保持暗色主题，精修细节 |
| 用户需要极致性能 | 量化了性能指标 | 合理即可，不追求极致 |
| 用户想扩展设置页 | 询问了具体设置项 | 取消设置扩展方向 |
| 轨道删减是播放器功能 | 区分了播放器切换 vs 物理移除 | 确认是物理移除（ffmpeg） |
| 字幕/刮削数据自建 | 询问了数据源 | 使用开源 API |
| 需要量化验证指标 | 询问了指标类型 | 准确率/成功率 |

## Technical Context

### 现有架构
- 前端：React 19 + Vite 6 + TypeScript + react-router-dom
- 后端：Express 4 + TypeScript + tsx watch
- 数据库：MySQL (movie_app)
- 缓存：Redis (ioredis, prefix `mc:`)
- 外部 API：TMDB + OMDb

### 当前 CSS 体系
- `global.css` (3058 行)：完整设计系统 "Cinematic Editorial v4"
- `skeleton.css` (221 行)：骨架屏加载状态
- CSS 变量：背景色、文字色、强调色、评分色、阴影、圆角、字体、缓动函数
- 响应式断点：768px、480px
- 无障碍：prefers-reduced-motion 媒体查询

### 组件清单（14 个）
Layout, Navbar, HeroBanner, MovieRow, PosterCard, PosterWall, DetailModal, LocalMediaView, SettingsPanel, RatingBadge, Skeleton, ErrorBoundary, App, SearchResultsPage

### 页面清单（6 个）
TrendingPage, MoviesPage, TvPage, LocalPage, SettingsPage, SearchResultsPage

### 后端服务
tmdb.ts, omdb.ts, scanner.ts, cache.ts, player.ts, watcher.ts, external-id-cache.ts, local-marker.ts

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Tailwind CSS | external system | utility-first, CSS framework | 替代 global.css |
| ffmpeg | external system | binary, CLI tool | 轨道物理移除 |
| 开源字幕 API | external system | subtitle matching, download | 字幕管理功能 |
| 开源刮削 API | external system | metadata scraping | 元数据刮削功能 |
| 前端设计 | core domain | visual, interaction, animation | 所有页面/组件 |
| 现有功能 | core domain | search, local media, detail, performance | 24 项已完成优化 |
| 媒体管理 | core domain | subtitle, metadata, file organization, track removal | 新增功能 |
| 暗色主题 | constraint | Cinematic Editorial v4, color system | 保持不变 |
| 性能指标 | success criteria | accuracy rate, success rate, reasonable performance | 验证标准 |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 5 | 5 | - | - | N/A |
| 2 | 6 | 1 | 0 | 5 | 83% |
| 3 | 7 | 1 | 0 | 6 | 86% |
| 4 | 8 | 1 | 0 | 7 | 88% |
| 5 | 9 | 1 | 0 | 8 | 89% |
| 6 | 9 | 0 | 0 | 9 | 100% |
| 7 | 9 | 0 | 0 | 9 | 100% |
| 8 | 10 | 1 | 0 | 9 | 90% |
| 9 | 10 | 0 | 0 | 10 | 100% |
| 10 | 10 | 0 | 0 | 10 | 100% |
| 11 | 10 | 0 | 0 | 10 | 100% |
| 12 | 10 | 0 | 0 | 10 | 100% |
| 13 | 10 | 0 | 0 | 10 | 100% |
| 14 | 10 | 0 | 0 | 10 | 100% |
| 15 | 10 | 0 | 0 | 10 | 100% |
| 16 | 10 | 0 | 0 | 10 | 100% |

**Ontology has converged** — 实体从 Round 6 开始稳定在 9-10 个，连续 10 轮无变化。

## Interview Transcript

<details>
<summary>Full Q&A (16 rounds)</summary>

### Round 1
**Q:** 你说的"前端设计优化"，最让你不满意的是哪一点？
**A:** 视觉效果升级, 交互体验改进, 引入组件库
**Ambiguity:** 83.5%

### Round 2
**Q:** 你想引入什么组件库？
**A:** Tailwind CSS
**Ambiguity:** 74.5%

### Round 3
**Q:** 现有 24 项已完成的功能中，哪些你觉得体验还不够好？
**A:** 搜索体验, 本地影视管理, 详情/浏览体验, 加载/性能
**Ambiguity:** 84.0%

### Round 4
**Q:** 如果这些优化全部做完，你用什么标准判断"做好了"？
**A:** 性能指标
**Ambiguity:** 67.5%

### Round 5
**Q:** 你想新增哪些功能？
**A:** 媒体管理增强, 设置中已有功能的扩展和优化
**Ambiguity:** 69.3%

### Round 6
**Q:** "媒体管理增强"具体想增强哪些方面？
**A:** 元数据/刮削, 字幕管理, 文件整理, 视频音轨和字幕轨道删减
**Ambiguity:** 62.8%

### Round 7
**Q:** 你希望前端优化后的整体视觉风格是怎样的？
**A:** 保持暗色主题，精修细节
**Ambiguity:** 58.5%

### Round 8
**Q:** "视频音轨和字幕轨道删减"具体是指播放器切换还是物理移除？
**A:** 物理移除轨道
**Ambiguity:** 53.5%

### Round 9
**Q:** 对于这次优化，你希望用什么方式验证"做完了"？
**A:** 全部（主观+量化+流程）
**Ambiguity:** 46.8%

### Round 10
**Q:** "设置中已有功能的扩展和优化"具体指什么？
**A:** 算了不扩展了
**Ambiguity:** 47.3%（设置扩展取消）

### Round 11
**Q:** 这次优化涉及面很广，你希望怎么推进？
**A:** 全部一次做
**Ambiguity:** 42.5%

### Round 12
**Q:** 前端设计优化，你觉得哪个页面/组件最需要优先改进？
**A:** 全部（首页/Trending, 详情弹窗, 本地影视页, 导航/搜索/设置）
**Ambiguity:** 38.8%

### Round 13
**Q:** 对于性能优化，你期望的目标是什么？
**A:** 合理即可
**Ambiguity:** 36.3%

### Round 14
**Q:** 对于字幕管理、元数据刮削、文件整理、轨道移除，你怎么判断"做好了"？
**A:** 有量化指标（准确率/成功率）
**Ambiguity:** 30.0%

### Round 15
**Q:** 字幕匹配和元数据刮削的数据从哪里来？
**A:** 开源 API
**Ambiguity:** 25.5%

### Round 16
**Q:** Tailwind 迁移的范围是什么？
**A:** 全量迁移
**Ambiguity:** 19.3% — Below threshold

</details>
