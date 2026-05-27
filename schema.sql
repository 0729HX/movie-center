-- Movie Center 数据库表结构
-- 使用方法: mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS movie_app
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE movie_app;

-- 本地媒体索引表（通过扫描 Emby 目录生成）
CREATE TABLE IF NOT EXISTS local_media (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tmdb_id INT,                       -- TMDB ID（用于匹配元数据）
  media_type ENUM('movie','tv') NOT NULL DEFAULT 'movie',
  title VARCHAR(500) NOT NULL,        -- 标题
  year YEAR,                          -- 年份
  local_path TEXT NOT NULL,           -- 本地视频文件绝对路径
  poster_path VARCHAR(1000),          -- 本地海报路径
  backdrop_path VARCHAR(1000),        -- 本地背景图路径
  clearlogo_path VARCHAR(1000),       -- 本地清晰logo路径
  file_size BIGINT DEFAULT 0,         -- 文件大小（字节）
  nfo_ratings JSON,                   -- NFO多源评分 [{source,displayName,score,maxScore,icon}]
  stream_info JSON,                   -- 流媒体信息 {video:{codec,resolution},audio:{codec,channels},subtitles:[]}
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_local_path (local_path(255)),
  INDEX idx_type (media_type),
  INDEX idx_tmdb (tmdb_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 评分缓存表（OMDb 多源评分本地缓存）
CREATE TABLE IF NOT EXISTS rating_cache (
  imdb_id VARCHAR(20) NOT NULL,
  tmdb_id INT NOT NULL,
  media_type ENUM('movie','tv') NOT NULL DEFAULT 'movie',
  imdb_score DECIMAL(3,1),            -- IMDb 评分 (0-10)
  tomatoes_score VARCHAR(10),         -- Rotten Tomatoes (如 "80%")
  metacritic_score INT,               -- Metacritic (0-100)
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (imdb_id),
  INDEX idx_tmdb (tmdb_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 系统配置表（PotPlayer 路径、媒体目录等）
CREATE TABLE IF NOT EXISTS config (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 默认配置
INSERT IGNORE INTO config (`key`, `value`) VALUES
  ('potplayer_path', 'C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe'),
  ('media_root', ''),
  ('tmdb_api_key', '95777cd0ce9652f08bd77103f658cf2b'),
  ('omdb_api_key', '');

-- ======================== 增量变更 ========================
-- Feature 4: 继续观看（播放进度记录）
ALTER TABLE local_media
  ADD COLUMN last_played_at DATETIME DEFAULT NULL COMMENT '最后播放时间',
  ADD COLUMN play_progress INT DEFAULT 0 COMMENT '播放进度(秒)';
