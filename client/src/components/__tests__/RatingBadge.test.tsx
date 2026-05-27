import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { RatingSource } from '../../types'
import RatingBadge from '../RatingBadge'

// ======================== 辅助工具 ========================

function makeRating(overrides: Partial<RatingSource> = {}): RatingSource {
  return {
    source: 'TMDB',
    icon: 'tmdb',
    score: 8.5,
    maxScore: 10,
    url: 'https://www.themoviedb.org/movie/1',
    ...overrides,
  }
}

// ======================== 测试用例 ========================

describe('RatingBadge', () => {
  // ---------- 空状态 ----------
  describe('空状态', () => {
    it('无评分时应返回 null', () => {
      const { container } = render(<RatingBadge ratings={[]} />)
      expect(container.innerHTML).toBe('')
    })
  })

  // ---------- 不同评分源渲染 ----------
  describe('不同评分源', () => {
    it('应渲染 TMDB 评分', () => {
      render(<RatingBadge ratings={[makeRating({ source: 'TMDB', icon: 'tmdb', score: 8.5 })]} />)
      expect(screen.getByText('T')).toBeDefined()
      expect(screen.getByText('8.5')).toBeDefined()
    })

    it('应渲染 IMDb 评分', () => {
      render(<RatingBadge ratings={[makeRating({ source: 'IMDb', icon: 'imdb', score: 7.2 })]} />)
      expect(screen.getByText('i')).toBeDefined()
      expect(screen.getByText('7.2')).toBeDefined()
    })

    it('应渲染 Rotten Tomatoes 评分', () => {
      render(<RatingBadge ratings={[makeRating({ source: 'Rotten Tomatoes', icon: 'tomatoes', score: 92, maxScore: 100 })]} />)
      expect(screen.getByText('RT')).toBeDefined()
      expect(screen.getByText('92%')).toBeDefined()
    })

    it('应渲染 Metacritic 评分', () => {
      render(<RatingBadge ratings={[makeRating({ source: 'Metacritic', icon: 'metacritic', score: 85, maxScore: 100 })]} />)
      expect(screen.getByText('M')).toBeDefined()
      expect(screen.getByText('85')).toBeDefined()
    })

    it('未知 icon 应显示 "?"', () => {
      render(<RatingBadge ratings={[makeRating({ icon: 'unknown', score: 5 })]} />)
      expect(screen.getByText('?')).toBeDefined()
    })

    it('应同时渲染多个评分源', () => {
      const ratings = [
        makeRating({ source: 'TMDB', icon: 'tmdb', score: 8.5 }),
        makeRating({ source: 'IMDb', icon: 'imdb', score: 8.0 }),
        makeRating({ source: 'Rotten Tomatoes', icon: 'tomatoes', score: 87, maxScore: 100 }),
      ]
      const { container } = render(<RatingBadge ratings={ratings} />)
      const badges = container.querySelectorAll('.rating-badge')
      expect(badges.length).toBe(3)
    })
  })

  // ---------- 分数格式化 ----------
  describe('分数格式化', () => {
    it('TMDB 分数应保留一位小数', () => {
      render(<RatingBadge ratings={[makeRating({ source: 'TMDB', icon: 'tmdb', score: 7 })]} />)
      expect(screen.getByText('7.0')).toBeDefined()
    })

    it('Rotten Tomatoes 分数应显示百分比', () => {
      render(<RatingBadge ratings={[makeRating({ source: 'Rotten Tomatoes', icon: 'tomatoes', score: 87.3, maxScore: 100 })]} />)
      expect(screen.getByText('87%')).toBeDefined()
    })

    it('Metacritic 分数应显示整数', () => {
      render(<RatingBadge ratings={[makeRating({ source: 'Metacritic', icon: 'metacritic', score: 72.6, maxScore: 100 })]} />)
      expect(screen.getByText('73')).toBeDefined()
    })

    it('NaN 分数应显示 N/A', () => {
      render(<RatingBadge ratings={[makeRating({ source: 'TMDB', icon: 'tmdb', score: NaN })]} />)
      expect(screen.getByText('N/A')).toBeDefined()
    })
  })

  // ---------- 链接跳转 ----------
  describe('链接跳转', () => {
    it('有 url 的评分应渲染为链接', () => {
      render(<RatingBadge ratings={[makeRating({ url: 'https://www.imdb.com/title/tt1375666' })]} />)
      const link = screen.getByRole('link')
      expect(link).toBeDefined()
      expect(link.getAttribute('href')).toBe('https://www.imdb.com/title/tt1375666')
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    })

    it('无 url 的评分应渲染为 span', () => {
      render(<RatingBadge ratings={[makeRating({ url: undefined })]} />)
      expect(screen.queryByRole('link')).toBeNull()
    })

    it('链接应包含正确的 title 属性', () => {
      render(<RatingBadge ratings={[makeRating({ source: 'IMDb', icon: 'imdb', score: 8.5, maxScore: 10, url: 'https://imdb.com' })]} />)
      const link = screen.getByRole('link')
      expect(link.getAttribute('title')).toBe('IMDb: 8.5 / 10')
    })
  })

  // ---------- compact 模式 ----------
  describe('compact 模式', () => {
    it('compact=true 时不使用 rating-badge 类名', () => {
      const { container } = render(<RatingBadge ratings={[makeRating()]} compact />)
      const badges = container.querySelectorAll('.rating-badge')
      expect(badges.length).toBe(0)
    })

    it('compact=false 时使用 rating-badge 类名', () => {
      const { container } = render(<RatingBadge ratings={[makeRating()]} />)
      const badges = container.querySelectorAll('.rating-badge')
      expect(badges.length).toBe(1)
    })

    it('compact 模式下容器应有紧凑样式', () => {
      const { container } = render(<RatingBadge ratings={[makeRating()]} compact />)
      const wrapper = container.querySelector('.rating-badges') as HTMLElement
      expect(wrapper.style.gap).toBe('4px')
      expect(wrapper.style.marginTop).toBe('6px')
    })
  })

  // ---------- 颜色映射 ----------
  describe('颜色映射', () => {
    it('TMDB 图标应使用绿色背景', () => {
      const { container } = render(<RatingBadge ratings={[makeRating({ icon: 'tmdb' })]} />)
      const icon = container.querySelector('span') as HTMLElement
      expect(icon.style.background).toBe('rgb(1, 210, 119)') // #01d277
    })

    it('IMDb 图标应使用黄色背景', () => {
      const { container } = render(<RatingBadge ratings={[makeRating({ icon: 'imdb' })]} />)
      const icon = container.querySelector('span') as HTMLElement
      expect(icon.style.background).toBe('rgb(245, 197, 24)') // #f5c518
    })

    it('Rotten Tomatoes 图标应使用红色背景', () => {
      const { container } = render(<RatingBadge ratings={[makeRating({ icon: 'tomatoes' })]} />)
      const icon = container.querySelector('span') as HTMLElement
      expect(icon.style.background).toBe('rgb(250, 50, 10)') // #fa320a
    })

    it('Metacritic 图标应使用金色背景', () => {
      const { container } = render(<RatingBadge ratings={[makeRating({ icon: 'metacritic' })]} />)
      const icon = container.querySelector('span') as HTMLElement
      expect(icon.style.background).toBe('rgb(255, 204, 51)') // #ffcc33
    })

    it('未知 icon 应使用灰色背景', () => {
      const { container } = render(<RatingBadge ratings={[makeRating({ icon: 'unknown' })]} />)
      const icon = container.querySelector('span') as HTMLElement
      expect(icon.style.background).toBe('rgb(102, 102, 102)') // #666
    })
  })
})
