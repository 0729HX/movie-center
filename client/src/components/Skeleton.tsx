import { memo, type FC } from 'react'

// ─── SkeletonCard ─────────────────────────────────────────────────
/** Single poster card skeleton (185x278 image + title/subtitle lines). */
interface SkeletonCardProps {
  index?: number
}

const SkeletonCard: FC<SkeletonCardProps> = ({ index = 0 }) => (
  <div
    className="skeleton-card"
    style={{ '--stagger-index': index } as React.CSSProperties}
  >
    <div className="skeleton-card-img" />
    <div className="skeleton-card-info">
      <div className="skeleton-text skeleton-text-title" />
      <div className="skeleton-text skeleton-text-subtitle" />
      <div className="skeleton-text skeleton-text-rating" />
    </div>
  </div>
)

// ─── SkeletonRow ──────────────────────────────────────────────────
/** Horizontal scroll row of skeleton cards (for trending page sections). */
interface SkeletonRowProps {
  count?: number
}

export const SkeletonRow: FC<SkeletonRowProps> = ({ count = 8 }) => (
  <div className="skeleton-scroll-row">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} index={i} />
    ))}
  </div>
)

// ─── SkeletonWall ─────────────────────────────────────────────────
/** Grid wall of skeleton cards (for Movies/Tv/Search/Local pages). */
interface SkeletonWallProps {
  count?: number
}

export const SkeletonWall: FC<SkeletonWallProps> = ({ count = 12 }) => (
  <div className="skeleton-grid">
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} index={i} />
    ))}
  </div>
)

// ─── SkeletonHero ─────────────────────────────────────────────────
/** Hero banner skeleton (full-width with title/meta/overview placeholders). */
export const SkeletonHero: FC = () => (
  <div className="skeleton-hero">
    <div className="skeleton-hero-content">
      <div className="skeleton-hero-title" />
      <div className="skeleton-hero-meta" />
      <div className="skeleton-hero-overview" />
    </div>
  </div>
)

// ─── SkeletonSectionTitle ─────────────────────────────────────────
/** Section title placeholder. */
export const SkeletonSectionTitle: FC = () => (
  <div className="skeleton-section-title" />
)

export default memo(SkeletonCard)
