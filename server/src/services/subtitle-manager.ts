/**
 * Subtitle Manager Service - OpenSubtitles API integration
 *
 * Subtitle search, download, and language preference management.
 * API key stored in the existing config system (same pattern as TMDB/OMDb keys).
 */

import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { query } from '../db';

// ======================== Types ========================

export interface SubtitleSearchResult {
  id: number;
  filename: string;
  downloadCount: number;
  language: string;
  languageCode: string;
  format: string;
  rating: number;
  uploader: string;
  url: string;
}

export interface SubtitleDownloadRequest {
  mediaId: number;
  subtitleId: number;
}

export interface SubtitleDownloadResult {
  success: boolean;
  filePath: string;
  message: string;
}

export interface SubtitleLanguage {
  code: string;
  name: string;
  localName: string;
}

// ======================== API Key Management ========================

const OPENSUBTITLES_API_BASE = 'https://api.opensubtitles.com/api/v1';

async function getApiKey(): Promise<string | null> {
  const rows: any[] = await query('SELECT `value` FROM config WHERE `key` = ?', ['opensubtitles_api_key']);
  const key = rows[0]?.value?.trim();
  return key || null;
}

async function getApiHeaders(): Promise<Record<string, string>> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('Please configure OpenSubtitles API Key in Settings');
  }
  return {
    'Api-Key': apiKey,
    'Content-Type': 'application/json',
    'User-Agent': 'MovieCenter v1.0',
  };
}

// ======================== Supported Languages ========================

const SUPPORTED_LANGUAGES: SubtitleLanguage[] = [
  { code: 'zh', name: 'Chinese (simplified)', localName: '中文(简体)' },
  { code: 'zh-hant', name: 'Chinese (traditional)', localName: '中文(繁体)' },
  { code: 'en', name: 'English', localName: 'English' },
  { code: 'ja', name: 'Japanese', localName: '日本語' },
  { code: 'ko', name: 'Korean', localName: '한국어' },
  { code: 'fr', name: 'French', localName: 'Français' },
  { code: 'de', name: 'German', localName: 'Deutsch' },
  { code: 'es', name: 'Spanish', localName: 'Español' },
  { code: 'pt', name: 'Portuguese', localName: 'Português' },
  { code: 'ru', name: 'Russian', localName: 'Русский' },
  { code: 'it', name: 'Italian', localName: 'Italiano' },
  { code: 'th', name: 'Thai', localName: 'ไทย' },
  { code: 'vi', name: 'Vietnamese', localName: 'Tiếng Việt' },
];

// ======================== Public API ========================

export function getSupportedLanguages(): SubtitleLanguage[] {
  return SUPPORTED_LANGUAGES;
}

export async function searchSubtitles(
  mediaId: number,
  language?: string
): Promise<SubtitleSearchResult[]> {
  const rows: any[] = await query(
    'SELECT title, year, media_type FROM local_media WHERE id = ?',
    [mediaId]
  );
  if (rows.length === 0) {
    throw new Error('Local media not found');
  }

  const media = rows[0];
  const headers = await getApiHeaders();

  const params: Record<string, string> = {
    query: media.title,
    year: media.year ? String(media.year) : '',
  };
  if (language) {
    params.languages = language;
  }

  try {
    const { data } = await axios.get(`${OPENSUBTITLES_API_BASE}/subtitles`, {
      headers,
      params,
      timeout: 15000,
    });

    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }

    return data.data.slice(0, 20).map((item: any) => {
      const attrs = item.attributes || {};
      const lang = SUPPORTED_LANGUAGES.find(
        (l) => l.code === attrs.language_code || l.code === attrs.language
      );
      return {
        id: item.id,
        filename: attrs.files?.[0]?.file_name || attrs.release_name || 'unknown',
        downloadCount: attrs.download_count || 0,
        language: lang?.localName || attrs.language || attrs.language_code || 'Unknown',
        languageCode: attrs.language_code || '',
        format: attrs.files?.[0]?.file_format || 'srt',
        rating: attrs.ratings || 0,
        uploader: attrs.uploader?.name || 'Unknown',
        url: attrs.url || '',
      };
    });
  } catch (err: any) {
    if (err.response?.status === 406) {
      throw new Error('Please configure a valid OpenSubtitles API Key in Settings');
    }
    throw new Error(`Subtitle search failed: ${err.message}`);
  }
}

export async function downloadSubtitle(
  request: SubtitleDownloadRequest
): Promise<SubtitleDownloadResult> {
  const headers = await getApiHeaders();

  const rows: any[] = await query(
    'SELECT local_path, title FROM local_media WHERE id = ?',
    [request.mediaId]
  );
  if (rows.length === 0) {
    throw new Error('Local media not found');
  }

  const media = rows[0];
  if (!media.local_path) {
    throw new Error('Media has no local file path');
  }

  try {
    const { data } = await axios.post(
      `${OPENSUBTITLES_API_BASE}/download`,
      { file_id: request.subtitleId },
      { headers, timeout: 30000 }
    );

    if (!data.link) {
      throw new Error('Download link not available');
    }

    const response = await axios.get(data.link, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const videoDir = path.dirname(media.local_path);
    const videoBaseName = path.basename(media.local_path, path.extname(media.local_path));

    let ext = '.srt';
    const contentType = String(response.headers['content-type'] || '');
    if (contentType.includes('ass')) ext = '.ass';
    else if (contentType.includes('vtt')) ext = '.vtt';

    const subtitleFilePath = path.join(videoDir, `${videoBaseName}${ext}`);
    await fs.writeFile(subtitleFilePath, Buffer.from(response.data));

    return {
      success: true,
      filePath: subtitleFilePath,
      message: `Subtitle saved to: ${subtitleFilePath}`,
    };
  } catch (err: any) {
    if (err.response?.status === 406) {
      throw new Error('Please configure a valid OpenSubtitles API Key in Settings');
    }
    throw new Error(`Subtitle download failed: ${err.message}`);
  }
}

export async function isApiKeyConfigured(): Promise<boolean> {
  const key = await getApiKey();
  return !!key;
}
