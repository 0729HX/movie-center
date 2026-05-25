# 未收藏影视自动下载方案设计

## 目标

用户在 Movie Center 中收藏了某部影视但本地没有文件时，系统自动查找高质量夸克网盘链接，转存并下载到指定文件夹，下载完成后自动触发扫描索引和详情缓存预热。

## 整体流程

```
用户点击 "收藏"（影视无本地文件）
  │
  ├─→ local_media 标记 status = 'pending_download'
  │
  ├─→ 下载队列管理器 (DownloadQueue)
  │     │
  │     ├─ 1. 搜索夸克网盘资源
  │     │     ├─ 关键词: "{标题} {年份} 1080p/4K BluRay/Remux"
  │     │     ├─ 搜索源: 夸克搜索API / 第三方聚合接口
  │     │     └─ 返回: 链接列表 + 元数据(大小/分辨率/编码)
  │     │
  │     ├─ 2. 质量评分 & 排序
  │     │     ├─ 分辨率: 4K(+40) > 1080p(+30) > 720p(+10)
  │     │     ├─ 编码: Remux(+30) > BluRay(+25) > WEB-DL(+15) > HDTV(+5)
  │     │     ├─ 音频: 全景声(+15) > DTS(+10) > AAC(+5)
  │     │     ├─ 字幕: 内封中字(+20) > 外挂(+10) > 无(0)
  │     │     └─ 文件大小合理范围加分
  │     │
  │     ├─ 3. 自动转存到夸克网盘
  │     │     ├─ 夸克 Cookie/Token 鉴权
  │     │     ├─ 调用转存API → 目标目录
  │     │     └─ 返回夸克分享链接 + 提取码
  │     │
  │     ├─ 4. 推送到下载队列
  │     │     ├─ aria2 RPC / 夸克客户端下载
  │     │     ├─ 下载到配置的 output_dir
  │     │     └─ 并发控制 (默认 2), 重试 3 次
  │     │
  │     └─ 5. 下载完成
  │           ├─ 更新 local_media: status = 'downloaded', local_path = ...
  │           ├─ 触发 scanner.scanDirectory(output_dir)
  │           └─ 触发 preCacheAllLocalDetails()
  │
  └─→ 前端轮询下载状态，实时更新进度
```

## 数据库扩展

```sql
-- 扩展现有 local_media 表
ALTER TABLE local_media
  ADD COLUMN download_status ENUM('none','pending','searching','downloading','downloaded','failed')
    DEFAULT 'none' COMMENT '下载状态',
  ADD COLUMN download_url VARCHAR(2000) COMMENT '夸克网盘链接',
  ADD COLUMN download_progress FLOAT DEFAULT 0 COMMENT '下载进度 0-100',
  ADD COLUMN download_quality VARCHAR(100) COMMENT '资源质量描述 (如 4K BluRay Remux)',
  ADD COLUMN download_error VARCHAR(500) COMMENT '下载失败原因';

-- 下载任务历史表
CREATE TABLE IF NOT EXISTS download_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  local_id INT NOT NULL,
  title VARCHAR(500) NOT NULL,
  quality VARCHAR(100),
  source_url VARCHAR(2000),
  file_size BIGINT DEFAULT 0,
  status ENUM('searching','found','downloading','completed','failed') NOT NULL,
  error_msg VARCHAR(500),
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  INDEX idx_local (local_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## API 设计

### 手动触发下载

```http
POST /api/download/queue
Content-Type: application/json

{
  "local_id": 123
}
```

Response:
```json
{
  "success": true,
  "status": "searching",
  "message": "已加入下载队列，正在搜索资源..."
}
```

### 查询下载状态

```http
GET /api/download/status?local_id=123
```

Response:
```json
{
  "local_id": 123,
  "download_status": "downloading",
  "download_progress": 45.2,
  "download_quality": "4K BluRay Remux HEVC DTS-HD",
  "download_error": null,
  "estimated_time": "约 12 分钟"
}
```

### 获取下载队列

```http
GET /api/download/queue
```

### 批量下载

```http
POST /api/download/queue/batch
Content-Type: application/json

{
  "local_ids": [123, 456, 789]
}
```

### 取消下载

```http
DELETE /api/download/queue/:local_id
```

### 重试失败下载

```http
POST /api/download/retry/:local_id
```

## 配置项扩展

```sql
INSERT INTO config (`key`, `value`) VALUES
  ('quark_cookie', ''),              -- 夸克网盘 Cookie
  ('quark_target_dir', '/影视'),     -- 夸克网盘目标目录
  ('aria2_rpc_url', 'http://localhost:6800/jsonrpc'),
  ('aria2_rpc_secret', ''),
  ('download_dir', 'D:/downloads/movies'), -- 本地下载目录
  ('max_concurrent_downloads', '2'),
  ('min_quality_score', '25'),       -- 最低质量分数阈值
  ('prefer_quality', '4K,BluRay,Remux'); -- 优先质量关键词
```

## 前端 UI

### 设置页新增

```
┌─ 下载设置 ──────────────────────────────┐
│ 夸克网盘 Cookie          [__________]    │
│ 夸克目标目录             [__________]    │
│ Aria2 RPC URL            [__________]    │
│ Aria2 Secret             [__________]    │
│ 本地下载目录             [__________]    │
│ 最大并发下载数           [____]          │
│ 最低质量标准             [____]          │
│ 优先质量关键词           [__________]    │
└──────────────────────────────────────────┘
```

### 本地影视列表状态标签

```
┌──────────────────────────┐
│  [海报]                   │
│  电影标题 (2024)          │
│  状态: 🔍 搜索资源中...    │
└──────────────────────────┘

┌──────────────────────────┐
│  [海报]                   │
│  电影标题 (2024)          │
│  状态: ⬇ 下载中 45%       │
│  ████████░░░░░░░░         │
└──────────────────────────┘

┌──────────────────────────┐
│  [海报]                   │
│  电影标题 (2024)          │
│  状态: ✅ 已下载 (4K)      │
└──────────────────────────┘
```

## 质量评分算法

```typescript
interface QualityScore {
  resolution: number    // 0-40
  encoding: number      // 0-30
  audio: number         // 0-15
  subtitle: number      // 0-20
  sizeBonus: number     // -10 ~ +10
}

function scoreResource(meta: ResourceMeta): number {
  let score = 0

  // 分辨率评分
  if (meta.resolution === '4K' || meta.resolution === '2160p') score += 40
  else if (meta.resolution === '1080p' || meta.resolution === '1080i') score += 30
  else if (meta.resolution === '720p') score += 10

  // 编码评分
  if (/remux/i.test(meta.encoding)) score += 30
  else if (/blu-?ray/i.test(meta.encoding)) score += 25
  else if (/web-?dl/i.test(meta.encoding)) score += 15
  else if (/hdtv/i.test(meta.encoding)) score += 5

  // 音频评分
  if (/atmos|全景声/i.test(meta.audio)) score += 15
  else if (/dts|dolby/i.test(meta.audio)) score += 10
  else if (/aac|ac3/i.test(meta.audio)) score += 5

  // 字幕评分
  if (/内封|内嵌.*中/.test(meta.subtitle)) score += 20
  else if (/外挂.*中/.test(meta.subtitle)) score += 10

  // 文件大小合理性
  if (meta.resolution === '4K' && meta.sizeGB >= 20 && meta.sizeGB <= 100) score += 10
  else if (meta.resolution === '1080p' && meta.sizeGB >= 8 && meta.sizeGB <= 40) score += 10
  else if (meta.sizeGB < 1) score -= 10

  return score // 满分 ~115
}
```

## 服务文件结构

```text
server/src/
  services/
    download/
      index.ts          DownloadQueue 管理器（单例）
      quark.ts          夸克网盘搜索 & 转存 API 封装
      aria2.ts          Aria2 JSON-RPC 客户端
      scorer.ts         资源质量评分
      matcher.ts        标题匹配 & 去重
  routes/
    download.ts         下载相关 API 路由
```

## 实现阶段

### 第一阶段：基础链路

- [ ] 夸克网盘搜索 API 接入（Cookie 鉴权）
- [ ] 资源列表解析 & 质量评分
- [ ] Aria2 JSON-RPC 下载集成
- [ ] 下载完成 → 目录扫描 → 索引更新
- [ ] 前端下载状态展示

### 第二阶段：自动化

- [ ] 收藏即自动加入下载队列
- [ ] 批量下载 & 队列管理
- [ ] 下载失败自动重试 + 换源
- [ ] 通知推送（下载完成/失败）

### 第三阶段：智能化

- [ ] 多网盘源聚合（夸克 + 阿里 + 百度）
- [ ] AI 资源标题匹配（处理命名差异）
- [ ] 智能选片（根据存储空间、历史偏好）
- [ ] 订阅制自动下载（关注列表自动追新）
