/**
 * DownloadQueue -- 下载队列管理器 (单例)
 *
 * 职责:
 * 1. 管理下载队列 (并发控制, 重试逻辑)
 * 2. 编排完整下载流程 (搜索→评分→转存→下载→完成)
 * 3. 更新 local_media 表的 download_status/progress
 * 4. 写入 download_log 历史记录
 * 5. 下载完成后触发 scanner.scanDirectory
 */

export { rankResources, applyPreferenceBonus, parseResourceMeta, scoreResource } from './scorer';
export type { QuarkResource, ResourceMeta, ScoredResource } from './scorer';
export { isMatch, filterMatches } from './matcher';
