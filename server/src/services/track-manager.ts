/**
 * Track Manager Service - FFmpeg/FFprobe video track management
 *
 * List tracks via ffprobe, remove via ffmpeg, progress reporting.
 * Rollback: copy original file before modification, delete copy on success.
 * ffmpeg availability checked at startup.
 */

import { execFile } from 'child_process';
import fs from 'fs/promises';
import { query } from '../db';
import { startOperation, updateProgress, completeOperation, failOperation, generateOperationId } from './progress-tracker';

// ======================== Types ========================

export interface MediaTrack {
  index: number;
  type: 'video' | 'audio' | 'subtitle';
  codec: string;
  language: string;
  title: string;
  default: boolean;
  forced: boolean;
  duration?: number;
  width?: number;
  height?: number;
  channels?: number;
  bitRate?: string;
}

export interface TrackHealthStatus {
  available: boolean;
  version?: string;
  error?: string;
}

export interface TrackRemoveRequest {
  mediaId: number;
  trackIndices: number[];
}

export interface TrackRemoveResult {
  operationId: string;
  success: boolean;
  originalSize: number;
  newSize: number;
  removedTracks: number;
  message: string;
}

// ======================== FFmpeg Health Check ========================

let ffmpegHealth: TrackHealthStatus = { available: false };

export async function checkFfmpegHealth(): Promise<TrackHealthStatus> {
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-version'], { timeout: 5000 }, (error, stdout) => {
      if (error) {
        ffmpegHealth = { available: false, error: error.message };
        console.warn('[TrackManager] ffmpeg not available:', error.message);
      } else {
        const versionMatch = stdout.match(/ffmpeg version (\S+)/);
        ffmpegHealth = {
          available: true,
          version: versionMatch ? versionMatch[1] : 'unknown',
        };
        console.log(`[TrackManager] ffmpeg available: ${ffmpegHealth.version}`);
      }
      resolve(ffmpegHealth);
    });
  });
}

export function getFfmpegHealth(): TrackHealthStatus {
  return ffmpegHealth;
}

// ======================== Track Listing ========================

function parseFFprobeOutput(jsonStr: string): MediaTrack[] {
  try {
    const data = JSON.parse(jsonStr);
    if (!data.streams || !Array.isArray(data.streams)) return [];

    return data.streams.map((stream: any) => {
      const type = stream.codec_type === 'video' ? 'video'
        : stream.codec_type === 'audio' ? 'audio'
        : stream.codec_type === 'subtitle' ? 'subtitle'
        : stream.codec_type;

      const tags = stream.tags || {};
      const language = tags.language || tags.LANGUAGE || '';
      const title = tags.title || tags.TITLE || '';

      const disp = stream.disposition || {};
      const isDefault = disp.default === 1;
      const isForced = disp.forced === 1;

      return {
        index: stream.index,
        type,
        codec: stream.codec_name || 'unknown',
        language: language || 'und',
        title: title || '',
        default: isDefault,
        forced: isForced,
        duration: stream.duration ? parseFloat(stream.duration) : undefined,
        width: stream.width,
        height: stream.height,
        channels: stream.channels,
        bitRate: stream.bit_rate ? String(stream.bit_rate) : undefined,
      };
    });
  } catch {
    return [];
  }
}

export async function listTracks(mediaId: number): Promise<MediaTrack[]> {
  if (!ffmpegHealth.available) {
    throw new Error('ffmpeg not installed. Please install ffmpeg and restart the server.');
  }

  const rows: any[] = await query(
    'SELECT local_path FROM local_media WHERE id = ?',
    [mediaId]
  );
  if (rows.length === 0) throw new Error('Local media not found');

  const filePath = rows[0].local_path;
  if (!filePath) throw new Error('Media has no local file path');

  return new Promise((resolve, reject) => {
    execFile('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', filePath], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(new Error(`ffprobe failed: ${error.message}`));
        return;
      }
      const tracks = parseFFprobeOutput(stdout);
      resolve(tracks);
    });
  });
}

// ======================== Track Removal ========================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export async function removeTracks(request: TrackRemoveRequest): Promise<TrackRemoveResult> {
  if (!ffmpegHealth.available) {
    throw new Error('ffmpeg not installed. Please install ffmpeg and restart the server.');
  }

  const rows: any[] = await query(
    'SELECT local_path, file_size FROM local_media WHERE id = ?',
    [request.mediaId]
  );
  if (rows.length === 0) throw new Error('Local media not found');

  const filePath = rows[0].local_path;
  const originalSize = rows[0].file_size || 0;
  if (!filePath) throw new Error('Media has no local file path');

  const operationId = generateOperationId('track');
  startOperation(operationId, 100, `Removing ${request.trackIndices.length} tracks`);

  const backupPath = filePath + '.bak';
  try {
    await fs.access(backupPath);
    await fs.unlink(backupPath);
  } catch { /* Good */ }

  try {
    updateProgress(operationId, 10, 'Creating backup...');
    await fs.copyFile(filePath, backupPath);

    updateProgress(operationId, 20, 'Probing tracks...');
    const tracks = await listTracks(request.mediaId);

    const tracksToKeep = tracks.filter(t => !request.trackIndices.includes(t.index));
    if (tracksToKeep.length === 0) {
      throw new Error('Cannot remove all tracks');
    }

    const mapArgs: string[] = [];
    for (const track of tracksToKeep) {
      mapArgs.push('-map', `0:${track.index}`);
    }

    const outputPath = filePath + '.tmp';
    const ffmpegArgs = ['-y', '-i', filePath, ...mapArgs, '-c', 'copy', outputPath];

    updateProgress(operationId, 30, 'Running ffmpeg...');

    await new Promise<void>((resolve, reject) => {
      execFile('ffmpeg', ffmpegArgs, { timeout: 600000, maxBuffer: 10 * 1024 * 1024 }, (error) => {
        if (error) {
          reject(new Error(`ffmpeg failed: ${error.message}`));
          return;
        }
        resolve();
      });
    });

    updateProgress(operationId, 80, 'Verifying output...');
    const outputStat = await fs.stat(outputPath);
    if (outputStat.size === 0) {
      throw new Error('Output file is empty');
    }

    updateProgress(operationId, 90, 'Replacing original...');
    await fs.rename(outputPath, filePath);

    await fs.unlink(backupPath).catch(() => {});

    const newSize = outputStat.size;
    const removedTracks = request.trackIndices.length;

    completeOperation(operationId, { originalSize, newSize, removedTracks });

    return {
      operationId,
      success: true,
      originalSize,
      newSize,
      removedTracks,
      message: `Successfully removed ${removedTracks} tracks. Size: ${formatBytes(originalSize)} -> ${formatBytes(newSize)}`,
    };
  } catch (err: any) {
    try {
      await fs.access(backupPath);
      await fs.rename(backupPath, filePath);
    } catch { /* backup may not exist */ }

    try {
      await fs.unlink(filePath + '.tmp');
    } catch { /* ignore */ }

    failOperation(operationId, err.message);

    return {
      operationId,
      success: false,
      originalSize,
      newSize: originalSize,
      removedTracks: 0,
      message: `Track removal failed: ${err.message}`,
    };
  }
}
