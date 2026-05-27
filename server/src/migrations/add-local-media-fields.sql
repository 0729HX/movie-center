-- Migration: Add scrape_status and last_scraped_at to local_media
-- Used by the metadata scraping service to track scrape progress

ALTER TABLE local_media
  ADD COLUMN scrape_status ENUM('pending','scraped','failed','manual') DEFAULT NULL COMMENT '元数据刮削状态',
  ADD COLUMN last_scraped_at TIMESTAMP NULL COMMENT '最后刮削时间';
