import type { FC } from 'react'
import type { RatingSource } from '../types'

interface Props {
  ratings: RatingSource[]
  compact?: boolean
}

const iconLabels: Record<string, string> = {
  tmdb: 'T',
  imdb: 'i',
  tomatoes: 'RT',
  metacritic: 'M',
}

const formatScore = (r: RatingSource): string => {
  const s = Number(r.score)
  if (isNaN(s)) return 'N/A'
  if (r.source === 'Rotten Tomatoes') return `${Math.round(s)}%`
  if (r.source === 'Metacritic') return `${Math.round(s)}`
  return s.toFixed(1)
}

const colorMap: Record<string, { bg: string; fg: string }> = {
  tmdb: { bg: '#01d277', fg: '#000' },
  imdb: { bg: '#f5c518', fg: '#000' },
  tomatoes: { bg: '#fa320a', fg: '#fff' },
  metacritic: { bg: '#ffcc33', fg: '#000' },
}

const RatingBadge: FC<Props> = ({ ratings, compact }) => {
  if (!ratings.length) return null

  return (
    <div className="rating-badges" style={compact ? { gap: 4, marginTop: 6 } : undefined}>
      {ratings.map((r, i) => {
        const colors = colorMap[r.icon] || { bg: '#666', fg: '#fff' }
        const iconClass = compact ? 'rating-badge-icon rating-badge-icon-sm' : 'rating-badge-icon rating-badge-icon-lg'
        const scoreClass = compact ? 'rating-badge-score rating-badge-score-sm' : 'rating-badge-score rating-badge-score-lg'
        const inner = (
          <>
            <span className={iconClass} style={{ background: colors.bg, color: colors.fg }}>
              {iconLabels[r.icon] || '?'}
            </span>
            <span className={scoreClass}>{formatScore(r)}</span>
          </>
        )

        const className = compact ? 'rating-badge-compact' : 'rating-badge'

        if (r.url) {
          return (
            <a key={i} className={className} href={r.url} target="_blank" rel="noopener noreferrer"
              title={`${r.source}: ${formatScore(r)} / ${r.maxScore}`}
              onClick={e => e.stopPropagation()}
            >
              {inner}
            </a>
          )
        }
        return <span key={i} className={className}>{inner}</span>
      })}
    </div>
  )
}

export default RatingBadge
