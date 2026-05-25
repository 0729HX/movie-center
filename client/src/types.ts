export interface RatingSource {
  source: string
  icon: string
  score: number
  maxScore: number
  url?: string
}

export interface CastMember {
  id: number
  name: string
  character: string
  profilePath: string | null
  order: number
}

export interface Recommendation {
  id: number
  title: string
  posterPath: string | null
  year: string
  mediaType: 'movie' | 'tv'
}

export interface MediaWithRatings {
  id: number
  tmdbId: number
  title: string
  overview: string
  posterPath: string | null
  backdropPath: string | null
  year: string
  mediaType: 'movie' | 'tv'
  ratings: RatingSource[]
  genres: string[]
  runtime?: number
  status: string
  tagline: string
  localPath?: string
  localId?: number
  isLocal: boolean
  credits?: CastMember[]
  recommendations?: Recommendation[]
}

export interface LocalMedia {
  id: number
  tmdb_id: number
  media_type: 'movie' | 'tv'
  title: string
  year: number
  local_path: string
  poster_path: string | null
  backdrop_path: string | null
  file_size: number
  added_at: string
}

export interface AppConfig {
  potplayer_path: string
  media_root: string
  tmdb_api_key: string
  omdb_api_key?: string
}
