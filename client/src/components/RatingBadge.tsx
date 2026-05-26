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

  const s = compact ? { gap: 4, fontSize: 10, pad: 3, iconW: 16, iconH: 16, iconR: 3, iconFont: 7 } as const
    : { gap: 6, fontSize: 11, pad: 4, iconW: 20, iconH: 20, iconR: 4, iconFont: 9 } as const

  return (
    <div className="rating-badges" style={compact ? { gap: 4, marginTop: 6 } : undefined}>
      {ratings.map((r, i) => {
        const colors = colorMap[r.icon] || { bg: '#666', fg: '#fff' }
        const inner = (
          <>
            <span style={{
              width: s.iconW, height: s.iconH,
              borderRadius: s.iconR,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: s.iconFont, fontWeight: 800,
              background: colors.bg, color: colors.fg,
              flexShrink: 0,
            }}>{iconLabels[r.icon] || '?'}</span>
            <span style={{
              fontSize: s.fontSize, fontWeight: 600,
              color: 'var(--text-secondary)',
              lineHeight: 1,
            }}>{formatScore(r)}</span>
          </>
        )

        const className = compact ? '' : 'rating-badge'
        const baseStyle = compact ? {
          display: 'inline-flex', alignItems: 'center', gap: 3,
          background: 'rgba(255,255,255,0.04)',
          padding: `${s.pad}px ${s.pad + 3}px ${s.pad}px ${s.pad}px`,
          borderRadius: 5,
        } : undefined

        if (r.url) {
          return (
            <a key={i} className={className} href={r.url} target="_blank" rel="noopener noreferrer"
              title={`${r.source}: ${formatScore(r)} / ${r.maxScore}`}
              onClick={e => e.stopPropagation()}
              style={{ ...baseStyle, textDecoration: 'none' }}
            >
              {inner}
            </a>
          )
        }
        return <span key={i} className={className} style={baseStyle}>{inner}</span>
      })}
    </div>
  )
}

export default RatingBadge
