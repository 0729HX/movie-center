-- Migration: 为 local_media 表添加 NFO 增强字段
-- 新增：本地清晰logo路径、NFO多源评分、流媒体信息
-- 所有新字段均为 nullable，向后兼容

ALTER TABLE local_media
  ADD COLUMN clearlogo_path VARCHAR(1000) DEFAULT NULL COMMENT '本地清晰logo路径' AFTER backdrop_path,
  ADD COLUMN nfo_ratings JSON DEFAULT NULL COMMENT 'NFO多源评分 JSON' AFTER file_size,
  ADD COLUMN stream_info JSON DEFAULT NULL COMMENT '流媒体信息 JSON（视频编码/音频/字幕）' AFTER nfo_ratings;
