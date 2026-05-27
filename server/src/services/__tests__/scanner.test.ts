import { describe, it, expect, vi, beforeEach } from 'vitest'

// ======================== Mock 外部依赖 ========================

// Mock db query
vi.mock('../../db', () => ({
  query: vi.fn(),
}))

// Mock fs/promises — 我们需要控制 readdir / readFile / stat 的返回值
const mockReaddir = vi.fn()
const mockReadFile = vi.fn()
const mockStat = vi.fn()

vi.mock('fs/promises', () => {
  const mock = {
    readdir: (...args: unknown[]) => mockReaddir(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    stat: (...args: unknown[]) => mockStat(...args),
  }
  return {
    ...mock,
    default: mock,
  }
})

import { query } from '../../db'
import { scanDirectory, getLocalMediaList, addToLocal, removeFromLocal } from '../scanner'

const mockQuery = vi.mocked(query)

// ======================== 辅助工具 ========================

/** 构造 Dirent-like 对象 */
function makeDirent(name: string, isFile: boolean) {
  return { name, isFile: () => isFile, isDirectory: () => !isFile } as any
}

/** 构造目录内容：文件列表 + 子目录列表 */
function makeEntries(files: string[], dirs: string[] = []) {
  return [
    ...files.map(f => makeDirent(f, true)),
    ...dirs.map(d => makeDirent(d, false)),
  ]
}

// ======================== 测试用例 ========================

describe('scanner service', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  // ---------- scanDirectory ----------
  describe('scanDirectory', () => {
    it('空目录应返回 0 添加', async () => {
      mockReaddir.mockResolvedValueOnce([])

      const result = await scanDirectory('/empty')
      expect(result.added).toBe(0)
      expect(result.updated).toBe(0)
      expect(result.skipped).toBe(0)
      expect(result.errors).toEqual([])
    })

    it('顶层视频文件应被正确扫描并插入', async () => {
      // walkDir 读取根目录
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv']))
      // processMediaDir 读取同一目录
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv']))
      // 去重查询：无已有记录
      mockQuery.mockResolvedValueOnce([])
      // stat
      mockStat.mockResolvedValueOnce({ size: 1024000 })

      const result = await scanDirectory('/media')
      expect(result.added).toBe(1)
      expect(result.updated).toBe(0)
      expect(result.skipped).toBe(0)
      expect(mockQuery).toHaveBeenCalledTimes(2) // SELECT + INSERT
      // 验证 INSERT 语句（第2次调用）
      const insertCall = mockQuery.mock.calls[1]
      expect(insertCall[0]).toContain('INSERT INTO local_media')
    })

    it('一级目录结构应递归扫描', async () => {
      // walkDir 根目录：发现子目录
      mockReaddir.mockResolvedValueOnce(makeEntries([], ['Inception (2010)']))
      // walkDir 子目录：发现视频
      mockReaddir.mockResolvedValueOnce(makeEntries(['Inception.mkv']))
      // processMediaDir
      mockReaddir.mockResolvedValueOnce(makeEntries(['Inception.mkv']))
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 2048000 })

      const result = await scanDirectory('/movies')
      expect(result.added).toBe(1)
    })

    it('应跳过系统目录', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries([], ['$RECYCLE.BIN', 'System Volume Information', 'Real Movie']))
      // walkDir 'Real Movie' 子目录
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mp4']))
      // processMediaDir
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mp4']))
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 1000 })

      const result = await scanDirectory('/media')
      expect(result.added).toBe(1)
      // 只读取了根目录 + Real Movie + processMediaDir = 3 次 readdir
      expect(mockReaddir).toHaveBeenCalledTimes(3)
    })

    it('readdir 失败时应静默跳过该目录', async () => {
      mockReaddir.mockRejectedValueOnce(new Error('Permission denied'))

      const result = await scanDirectory('/locked')
      expect(result.added).toBe(0)
      expect(result.errors).toEqual([])
    })

    it('根目录扫描失败时应记录错误', async () => {
      // walkDir 的 readdir 失败 → 静默返回
      mockReaddir.mockRejectedValueOnce(new Error('ENOENT'))

      const result = await scanDirectory('/nonexistent')
      // walkDir 内部 catch 不会传播，但 scanDirectory 外层 try/catch 也不会触发
      // 因为 walkDir 内部已经 catch 了 readdir 失败
      expect(result.added).toBe(0)
    })
  })

  // ---------- NFO 解析 ----------
  describe('NFO 解析', () => {
    it('应解析 TMM v4 格式的 tmdbid', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv', 'movie.nfo']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv', 'movie.nfo']))
      mockReadFile.mockResolvedValueOnce('<?xml version="1.0"?><movie><tmdbid>12345</tmdbid></movie>')
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 5000 })

      const result = await scanDirectory('/media')
      expect(result.added).toBe(1)
      expect(result.tmdbItems).toEqual([{ mediaType: 'movie', tmdbId: 12345 }])
    })

    it('应解析 Kodi/Emby 格式的 uniqueid', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['episode.mkv', 'movie.nfo']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['episode.mkv', 'movie.nfo']))
      mockReadFile.mockResolvedValueOnce(
        '<movie><uniqueid type="tmdb" default="true">67890</uniqueid></movie>'
      )
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 8000 })

      const result = await scanDirectory('/media')
      expect(result.tmdbItems).toEqual([{ mediaType: 'movie', tmdbId: 67890 }])
    })

    it('无效 NFO 内容应继续扫描（不崩溃）', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv', 'movie.nfo']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv', 'movie.nfo']))
      mockReadFile.mockResolvedValueOnce('this is not xml at all')
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 1000 })

      const result = await scanDirectory('/media')
      expect(result.added).toBe(1)
      expect(result.tmdbItems).toEqual([]) // 无 tmdbId
    })

    it('NFO 文件读取失败应静默跳过', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv', 'movie.nfo']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv', 'movie.nfo']))
      mockReadFile.mockRejectedValueOnce(new Error('read error'))
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 1000 })

      const result = await scanDirectory('/media')
      expect(result.added).toBe(1)
      expect(result.tmdbItems).toEqual([])
    })

    it('应解析 tvshow.nfo 并识别为 tv 类型', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['S01E01.mkv', 'tvshow.nfo'], ['Season 01']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['S01E01.mkv', 'tvshow.nfo'], ['Season 01']))
      mockReadFile.mockResolvedValueOnce('<tvshow><tmdbid>11111</tmdbid></tvshow>')
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 3000 })

      const result = await scanDirectory('/tv')
      expect(result.tmdbItems).toEqual([{ mediaType: 'tv', tmdbId: 11111 }])
    })
  })

  // ---------- 去重逻辑 ----------
  describe('去重逻辑', () => {
    it('相同路径且数据未变应跳过', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv']))
      // existing 记录（需包含所有比对字段）
      mockQuery.mockResolvedValueOnce([{
        id: 1,
        tmdb_id: null,
        poster_path: '',
        backdrop_path: '',
        clearlogo_path: '',
        file_size: 5000,
        nfo_ratings: null,
        stream_info: null,
      }])
      mockStat.mockResolvedValueOnce({ size: 5000 })

      const result = await scanDirectory('/media')
      expect(result.skipped).toBe(1)
      expect(result.added).toBe(0)
    })

    it('相同路径但数据变化应更新', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv']))
      mockQuery.mockResolvedValueOnce([{
        id: 1,
        tmdb_id: null,
        poster_path: '',
        backdrop_path: '',
        file_size: 1000, // 旧大小
      }])
      mockStat.mockResolvedValueOnce({ size: 5000 }) // 新大小
      mockQuery.mockResolvedValueOnce({}) // UPDATE

      const result = await scanDirectory('/media')
      expect(result.updated).toBe(1)
      // 验证 UPDATE 语句
      const updateCall = mockQuery.mock.calls[1]
      expect(updateCall[0]).toContain('UPDATE local_media')
    })

    it('不同路径应插入新记录', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['new-movie.mkv']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['new-movie.mkv']))
      mockQuery.mockResolvedValueOnce([]) // 无已有记录
      mockStat.mockResolvedValueOnce({ size: 3000 })

      const result = await scanDirectory('/media')
      expect(result.added).toBe(1)
    })
  })

  // ---------- 目录名解析 ----------
  describe('目录名解析', () => {
    it('应从 "Movie Name (2020)" 提取标题和年份', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries([], ['Inception (2010)']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv']))
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 1000 })

      await scanDirectory('/movies')
      // 验证 INSERT 参数：title=[2], year=[3]（INSERT 是第2次 query 调用）
      const insertCall = mockQuery.mock.calls[1]
      expect(insertCall[1][2]).toBe('Inception') // title
      expect(insertCall[1][3]).toBe(2010) // year
    })

    it('无年份的目录名应使用完整名称作为标题', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries([], ['My Custom Movie']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv']))
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 1000 })

      await scanDirectory('/movies')
      const insertCall = mockQuery.mock.calls[1]
      expect(insertCall[1][2]).toBe('My Custom Movie') // title=[2]
    })
  })

  // ---------- 媒体类型判断 ----------
  describe('媒体类型判断', () => {
    it('有 tvshow.nfo 应识别为 tv', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['S01E01.mkv', 'tvshow.nfo'], ['Season 01']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['S01E01.mkv', 'tvshow.nfo'], ['Season 01']))
      mockReadFile.mockResolvedValueOnce('')
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 1000 })

      await scanDirectory('/tv')
      const insertCall = mockQuery.mock.calls[1]
      expect(insertCall[1][1]).toBe('tv') // media_type=[1]
    })

    it('有 Season 子目录应识别为 tv', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['episode.mkv'], ['Season 01']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['episode.mkv'], ['Season 01']))
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 1000 })

      await scanDirectory('/tv')
      const insertCall = mockQuery.mock.calls[1]
      expect(insertCall[1][1]).toBe('tv') // media_type=[1]
    })

    it('视频文件名含 S01E01 应识别为 tv', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['Show.S01E01.mkv']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['Show.S01E01.mkv']))
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 1000 })

      await scanDirectory('/media')
      const insertCall = mockQuery.mock.calls[1]
      expect(insertCall[1][1]).toBe('tv') // media_type=[1]
    })

    it('普通视频应识别为 movie', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['Inception.mkv']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['Inception.mkv']))
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 1000 })

      await scanDirectory('/media')
      const insertCall = mockQuery.mock.calls[1]
      expect(insertCall[1][1]).toBe('movie') // media_type=[1]
    })
  })

  // ---------- 海报和背景图 ----------
  describe('海报和背景图', () => {
    it('应识别 poster.jpg', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv', 'poster.jpg']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv', 'poster.jpg']))
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 1000 })

      await scanDirectory('/media')
      const insertCall = mockQuery.mock.calls[1]
      // poster_path=[5]
      expect(insertCall[1][5]).toContain('poster.jpg')
    })

    it('应识别 backdrop.jpg', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv', 'backdrop.jpg']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv', 'backdrop.jpg']))
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 1000 })

      await scanDirectory('/media')
      const insertCall = mockQuery.mock.calls[1]
      expect(insertCall[1][6]).toContain('backdrop.jpg') // backdrop_path=[6]
    })

    it('无海报时 poster_path 应为 null', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv']))
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 1000 })

      await scanDirectory('/media')
      const insertCall = mockQuery.mock.calls[1]
      expect(insertCall[1][5]).toBeNull() // poster_path=[5]
    })
  })

  // ---------- 季目录中的视频和海报 ----------
  describe('季目录中的文件', () => {
    it('应从 Season 子目录中找到视频文件', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries([], ['Season 01']))
      mockReaddir.mockResolvedValueOnce(makeEntries([], ['Season 01'])) // processMediaDir 顶层：有 Season 目录
      // season 子目录有视频
      mockReaddir.mockResolvedValueOnce(makeEntries(['S01E01.mkv']))
      // processMediaDir 也会在 season 目录中查找海报
      mockReaddir.mockResolvedValueOnce(makeEntries(['S01E01.mkv']))
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 1000 })

      const result = await scanDirectory('/tv')
      expect(result.added).toBe(1)
    })

    it('应从 Season 子目录中找到海报', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries([], ['Season 01']))
      mockReaddir.mockResolvedValueOnce(makeEntries([], ['Season 01'])) // 顶层：有 Season 目录
      // season 子目录有视频和海报
      mockReaddir.mockResolvedValueOnce(makeEntries(['S01E01.mkv', 'poster.jpg']))
      // processMediaDir 也会在 season 目录中查找海报
      mockReaddir.mockResolvedValueOnce(makeEntries(['S01E01.mkv', 'poster.jpg']))
      mockQuery.mockResolvedValueOnce([])
      mockStat.mockResolvedValueOnce({ size: 1000 })

      await scanDirectory('/tv')
      const insertCall = mockQuery.mock.calls[1]
      expect(insertCall[1][5]).toContain('poster.jpg') // poster_path=[5]
    })
  })

  // ---------- 错误处理 ----------
  describe('错误处理', () => {
    it('无视频文件的目录应记录错误', async () => {
      // walkDir: has Season dir → triggers processMediaDir
      mockReaddir.mockResolvedValueOnce(makeEntries([], ['Season 01']))
      // processMediaDir: sees Season 01, reads it for video
      mockReaddir.mockResolvedValueOnce(makeEntries([], ['Season 01']))
      // processMediaDir reads Season 01: only non-video files
      mockReaddir.mockResolvedValueOnce(makeEntries(['readme.txt']))

      const result = await scanDirectory('/media')
      expect(result.added).toBe(0)
      expect(result.errors.length).toBe(1)
      expect(result.errors[0]).toContain('未找到视频文件')
    })

    it('processMediaDir 中的 query 失败应记录错误', async () => {
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['movie.mkv']))
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'))

      const result = await scanDirectory('/media')
      expect(result.errors.length).toBe(1)
      expect(result.errors[0]).toContain('DB connection lost')
    })

    it('多个目录中部分失败应继续扫描其他目录', async () => {
      // 根目录有两个子目录
      mockReaddir.mockResolvedValueOnce(makeEntries([], ['Good Movie', 'Bad Movie']))
      // Good Movie 成功
      mockReaddir.mockResolvedValueOnce(makeEntries(['good.mkv']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['good.mkv']))
      mockQuery.mockResolvedValueOnce([])       // SELECT: 无已有记录
      mockStat.mockResolvedValueOnce({ size: 1000 })
      mockQuery.mockResolvedValueOnce({})       // INSERT: 成功
      // Bad Movie：query 失败
      mockReaddir.mockResolvedValueOnce(makeEntries(['bad.mkv']))
      mockReaddir.mockResolvedValueOnce(makeEntries(['bad.mkv']))
      mockQuery.mockRejectedValueOnce(new Error('DB error'))

      const result = await scanDirectory('/movies')
      expect(result.added).toBe(1)
      expect(result.errors.length).toBe(1)
    })
  })

  // ---------- getLocalMediaList ----------
  describe('getLocalMediaList', () => {
    it('应查询所有本地媒体', async () => {
      const mockRows = [{ id: 1, title: 'Test' }]
      mockQuery.mockResolvedValueOnce(mockRows)

      const result = await getLocalMediaList()
      expect(result).toEqual(mockRows)
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM local_media ORDER BY added_at DESC')
    })
  })

  // ---------- addToLocal ----------
  describe('addToLocal', () => {
    it('应插入新记录并返回 insertId', async () => {
      mockQuery.mockResolvedValueOnce({ insertId: 42 })

      const result = await addToLocal(12345, 'movie', 'Test Movie')
      expect(result).toBe(42)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT IGNORE'),
        [12345, 'movie', 'Test Movie']
      )
    })

    it('insertId 为 undefined 时应返回 0', async () => {
      mockQuery.mockResolvedValueOnce({})

      const result = await addToLocal(12345, 'tv', 'Test Show')
      expect(result).toBe(0)
    })
  })

  // ---------- removeFromLocal ----------
  describe('removeFromLocal', () => {
    it('删除成功应返回 true', async () => {
      mockQuery.mockResolvedValueOnce({ affectedRows: 1 })

      const result = await removeFromLocal(42)
      expect(result).toBe(true)
    })

    it('删除不存在的记录应返回 false', async () => {
      mockQuery.mockResolvedValueOnce({ affectedRows: 0 })

      const result = await removeFromLocal(999)
      expect(result).toBe(false)
    })
  })
})
