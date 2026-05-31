-- ============================================================
-- 夸克网盘自动下载功能 - 数据库迁移脚本
-- 执行方式: mysql -u root -p movie_center < add-download-fields.sql
-- ============================================================

-- 1. 扩展 local_media 表, 新增下载相关字段
ALTER TABLE local_media
  ADD COLUMN download_status ENUM('none','pending','searching','downloading','downloaded','failed')
    NOT NULL DEFAULT 'none' COMMENT '下载状态',
  ADD COLUMN download_url VARCHAR(2000) DEFAULT NULL COMMENT '夸克网盘资源链接',
  ADD COLUMN download_progress FLOAT NOT NULL DEFAULT 0 COMMENT '下载进度 0-100',
  ADD COLUMN download_quality VARCHAR(100) DEFAULT NULL COMMENT '资源质量描述 (如 4K BluRay Remux)',
  ADD COLUMN download_error VARCHAR(500) DEFAULT NULL COMMENT '下载失败原因',
  ADD COLUMN aria2_gid VARCHAR(100) DEFAULT NULL COMMENT 'Aria2 任务 GID',
  ADD COLUMN download_started_at DATETIME DEFAULT NULL COMMENT '下载开始时间',
  ADD COLUMN download_completed_at DATETIME DEFAULT NULL COMMENT '下载完成时间';

-- 2. 下载历史日志表
CREATE TABLE IF NOT EXISTS download_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  local_id INT NOT NULL,
  title VARCHAR(500) NOT NULL,
  media_type ENUM('movie','tv') NOT NULL DEFAULT 'movie',
  tmdb_id INT DEFAULT NULL,
  quality VARCHAR(100) DEFAULT NULL,
  source_url VARCHAR(2000) DEFAULT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  status ENUM('searching','found','transferring','downloading','completed','failed','cancelled') NOT NULL,
  error_msg VARCHAR(500) DEFAULT NULL,
  aria2_gid VARCHAR(100) DEFAULT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME DEFAULT NULL,
  INDEX idx_local_id (local_id),
  INDEX idx_status (status),
  INDEX idx_started (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 新增下载相关配置项 (使用 ON DUPLICATE KEY UPDATE 防止重复插入)
INSERT INTO config (`key`, `value`) VALUES
  ('quark_cookie', ''),
  ('quark_target_dir', '/影视'),
  ('aria2_rpc_url', 'http://localhost:6800/jsonrpc'),
  ('aria2_rpc_secret', ''),
  ('download_dir', ''),
  ('max_concurrent_downloads', '2'),
  ('min_quality_score', '25'),
  ('prefer_quality', '4K,BluRay,Remux')
ON DUPLICATE KEY UPDATE `value` = `value`;
