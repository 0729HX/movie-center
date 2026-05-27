import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { MediaWithRatings } from '../../types'

// ======================== Mock 依赖 ========================

const mockHandleSelect = vi.fn()
const mockHandleSaveLocal = vi.fn()
const mockHandleRemoveLocal = vi.fn()

vi.mock('../../context/hooks', () => ({
  useDetail: () => ({
    handleSelect: mockHandleSelect,
    handleSaveLocal: mockHandleSaveLocal,
    handleRemoveLocal: mockHandleRemoveLocal,
  }),
}))

// Mock RatingBadge 以隔离测试
vi.mock('../RatingBadge', () => ({
  default: ({ ratings }: { ratings: any[] }) => (
    <div data-testid="rating-badge">{ratings.length} ratings</div>
  ),
}))

import PosterCard from '../PosterCard'

// ======================== 辅助工具 ========================

function makeItem(overrides: Partial<MediaWithRatings> = {}): MediaWithRatings {
  return {
    id: 1,
    tmdbId: 100,
    title: 'Inception',
    overview: 'A dream within a dream',
    posterPath: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    backdropPath: null,
    year: '2010',
    mediaType: 'movie',
    ratings: [
      { source: 'TMDB', icon: 'tmdb', score: 8.8, maxScore: 10, url: 'https://tmdb.org/movie/1' },
    ],
    genres: ['Action'],
    status: 'Released',
    tagline: '',
    isLocal: false,
    ...overrides,
  }
}

// ======================== 测试用例 ========================

describe('PosterCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---------- 基本渲染 ----------
  describe('基本渲染', () => {
    it('应渲染标题', () => {
      render(<PosterCard item={makeItem()} />)
      expect(screen.getByText('Inception')).toBeDefined()
    })

    it('应渲染年份和媒体类型', () => {
      render(<PosterCard item={makeItem()} />)
      expect(screen.getByText(/2010/)).toBeDefined()
      expect(screen.getByText(/电影/)).toBeDefined()
    })

    it('剧集应显示"剧集"标签', () => {
      render(<PosterCard item={makeItem({ mediaType: 'tv', title: 'Breaking Bad' })} />)
      expect(screen.getByText(/剧集/)).toBeDefined()
    })

    it('应渲染评分组件', () => {
      render(<PosterCard item={makeItem()} />)
      expect(screen.getByTestId('rating-badge')).toBeDefined()
      expect(screen.getByTestId('rating-badge').textContent).toBe('1 ratings')
    })

    it('应渲染简介', () => {
      render(<PosterCard item={makeItem()} />)
      expect(screen.getByText('A dream within a dream')).toBeDefined()
    })

    it('无简介时应显示"暂无简介"', () => {
      render(<PosterCard item={makeItem({ overview: '' })} />)
      expect(screen.getByText('暂无简介')).toBeDefined()
    })
  })

  // ---------- 海报图片 ----------
  describe('海报图片', () => {
    it('有 posterPath 时应渲染 img 元素', () => {
      render(<PosterCard item={makeItem()} />)
      const img = screen.getByAltText('Inception') as HTMLImageElement
      expect(img).toBeDefined()
      expect(img.src).toContain('poster.jpg')
    })

    it('图片加载失败应显示占位符', () => {
      render(<PosterCard item={makeItem()} />)
      const img = screen.getByAltText('Inception')
      fireEvent.error(img)
      // 占位符应出现
      expect(screen.getByText('🎬')).toBeDefined()
    })

    it('无 posterPath 时应显示占位符', () => {
      render(<PosterCard item={makeItem({ posterPath: null })} />)
      expect(screen.getByText('🎬')).toBeDefined()
    })

    it('剧集占位符应显示电视图标', () => {
      render(<PosterCard item={makeItem({ posterPath: null, mediaType: 'tv' })} />)
      expect(screen.getByText('📺')).toBeDefined()
    })

    it('图片加载完成应移除 skeleton', () => {
      render(<PosterCard item={makeItem()} />)
      const img = screen.getByAltText('Inception')
      // 初始状态：有 skeleton
      expect(document.querySelector('.poster-img-skeleton')).not.toBeNull()
      fireEvent.load(img)
      // 加载后：skeleton 消失
      expect(document.querySelector('.poster-img-skeleton')).toBeNull()
    })
  })

  // ---------- 点击事件 ----------
  describe('点击事件', () => {
    it('点击卡片应调用 handleSelect', () => {
      const item = makeItem()
      render(<PosterCard item={item} />)
      const card = document.querySelector('.poster-card')!
      fireEvent.click(card)
      expect(mockHandleSelect).toHaveBeenCalledWith(item)
    })

    it('点击收藏按钮应调用 handleSaveLocal', () => {
      render(<PosterCard item={makeItem({ isLocal: false })} />)
      const btn = document.querySelector('.poster-card-save-btn')!
      fireEvent.click(btn)
      expect(mockHandleSaveLocal).toHaveBeenCalled()
    })

    it('已收藏时点击应调用 handleRemoveLocal', () => {
      render(<PosterCard item={makeItem({ isLocal: true })} />)
      const btn = document.querySelector('.poster-card-save-btn')!
      fireEvent.click(btn)
      expect(mockHandleRemoveLocal).toHaveBeenCalled()
    })

    it('收藏按钮点击不应触发卡片点击', () => {
      render(<PosterCard item={makeItem()} />)
      const btn = document.querySelector('.poster-card-save-btn')!
      fireEvent.click(btn)
      // handleSelect 不应被调用（stopPropagation）
      expect(mockHandleSelect).not.toHaveBeenCalled()
    })
  })

  // ---------- 本地标记 ----------
  describe('本地标记', () => {
    it('isLocal=true 时收藏按钮应有 saved 类名', () => {
      render(<PosterCard item={makeItem({ isLocal: true })} />)
      const btn = document.querySelector('.poster-card-save-btn')!
      expect(btn.classList.contains('saved')).toBe(true)
    })

    it('isLocal=false 时收藏按钮不应有 saved 类名', () => {
      render(<PosterCard item={makeItem({ isLocal: false })} />)
      const btn = document.querySelector('.poster-card-save-btn')!
      expect(btn.classList.contains('saved')).toBe(false)
    })

    it('已收藏时 SVG 应使用 fill', () => {
      render(<PosterCard item={makeItem({ isLocal: true })} />)
      const svg = document.querySelector('.poster-card-save-btn svg')!
      expect(svg.getAttribute('fill')).toBe('currentColor')
    })

    it('未收藏时 SVG 应使用 none fill', () => {
      render(<PosterCard item={makeItem({ isLocal: false })} />)
      const svg = document.querySelector('.poster-card-save-btn svg')!
      expect(svg.getAttribute('fill')).toBe('none')
    })
  })

  // ---------- 高亮搜索 ----------
  describe('搜索高亮', () => {
    it('有 highlightQuery 时应高亮匹配文本', () => {
      render(<PosterCard item={makeItem({ title: 'Inception' })} highlightQuery="Incep" />)
      const marks = document.querySelectorAll('mark.search-highlight')
      expect(marks.length).toBeGreaterThan(0)
      expect(marks[0].textContent).toBe('Incep')
    })

    it('无 highlightQuery 时不应有高亮', () => {
      render(<PosterCard item={makeItem()} />)
      const marks = document.querySelectorAll('mark.search-highlight')
      expect(marks.length).toBe(0)
    })

    it('highlightQuery 为空字符串时不应有高亮', () => {
      render(<PosterCard item={makeItem()} highlightQuery="" />)
      const marks = document.querySelectorAll('mark.search-highlight')
      expect(marks.length).toBe(0)
    })
  })

  // ---------- style prop ----------
  describe('style prop', () => {
    it('应将 style 传递给卡片元素', () => {
      const style = { opacity: 0.5 }
      render(<PosterCard item={makeItem()} style={style} />)
      const card = document.querySelector('.poster-card') as HTMLElement
      expect(card.style.opacity).toBe('0.5')
    })
  })
})
