# Movie Center Comprehensive Optimization Plan (Revised)

**Created:** 2026-05-28
**Revised:** 2026-05-28
**Project:** E:\个人影院\movie-app\
**Status:** pending approval
**Revision reason:** Architect + Critic rejection -- 2 CRITICAL + 6 MAJOR issues fixed
**Review status:** Architect APPROVED WITH IMPROVEMENTS, Critic ACCEPT-WITH-RESERVATIONS

---

## RALPLAN-DR Summary

### Principles (5)

1. **Incremental migration** -- Every phase produces a working, testable application. Never break the existing app state.
2. **Visual fidelity first** -- The dark theme and cinematic design tokens must be preserved exactly during Tailwind migration. No regressions.
3. **Quantified acceptance** -- Every feature claims a measurable success rate or performance metric before it ships.
4. **Backend stability** -- Express routes, MySQL schema, and Redis caching patterns remain unchanged. New features are additive.
5. **Parallel execution** -- Frontend Tailwind migration, backend feature routes, and feature UI components can run in parallel once the foundation is laid.

### Decision Drivers (top 3)

1. **Risk of visual regression** -- Tailwind migration touches all 15 components + 6 pages. A wrong step breaks the entire UI.
2. **Feature completeness** -- Three new subsystems (metadata scraping, subtitle management, file organization) need coordinated frontend + backend work.
3. **Performance budget** -- First paint under 4 seconds with all features loaded. Data loading performance must not regress.

### Options Considered

**Option A: Phased vertical slices** (CHOSEN)
- Migrate Tailwind per-component (one component at a time)
- Build each new feature as a complete vertical slice (route + service + UI)
- Pro: Each step independently testable, low blast radius
- Con: More total steps, some CSS duplication during transition

**Option B: Big-bang migration + feature sprint**
- Migrate all CSS to Tailwind in one pass, then build features
- Pro: Faster on paper
- Con: High regression risk, impossible to bisect if something breaks

**Option C: Keep global.css, add Tailwind for new features only**
- Minimal migration, only new components use Tailwind
- Pro: Lowest risk
- Con: Two styling paradigms coexist forever, increases maintenance burden

**Why A was chosen:** The brownfield nature of this project demands incremental verification. Option B's blast radius is unacceptable for a personal project with no QA team. Option C creates permanent technical debt. Option A gives us a working app after every step.

---

## ADR: Tailwind CSS v4 Full Migration

### Decision
Migrate all 3058 lines of `global.css` + 221 lines of `skeleton.css` to Tailwind CSS v4 utility classes, with CSS-first `@theme` configuration (no JS config file). Preserve a residual `global.css` of ~350 lines for keyframes, resets, pseudo-elements, scrollbar styles, `prefers-reduced-motion`, and responsive CSS variable overrides.

### Drivers
- `global.css` is 3058 lines of hand-written CSS with no organization
- Component CSS classes are tightly coupled to global definitions
- Tailwind v4 provides CSS-first config via `@theme` blocks, better Vite integration via `@tailwindcss/vite` plugin
- The project already uses Vite 6, which supports Tailwind v4 natively via the Vite plugin (no PostCSS config needed)

### Alternatives Considered
1. **CSS Modules** -- Would require renaming every className import. More work than Tailwind for the same result.
2. **Styled Components** -- Runtime overhead, harder to maintain design tokens, adds bundle size.
3. **Vanilla Extract** -- Type-safe but requires rewriting all components. Higher effort for similar outcome.
4. **Tailwind v3 with PostCSS** -- Works but adds unnecessary PostCSS + autoprefixer deps. v4 is simpler with Vite plugin.

### Why Tailwind v4 Chosen
- Zero runtime cost (compiled to static CSS)
- CSS-first `@theme` configuration maps directly to existing CSS custom properties
- Utility classes reduce per-component CSS to near zero
- Vite 6 has first-class Tailwind v4 support via `@tailwindcss/vite` plugin (no postcss.config.js needed)
- No JS config file or PostCSS config required

### Consequences
- All `className` attributes in components must be rewritten
- `global.css` shrinks from 3058 lines to ~350 lines (residual: keyframes, resets, pseudo-elements, scrollbar, responsive variable overrides, prefers-reduced-motion)
- `skeleton.css` is fully absorbed into Tailwind utilities
- New features get Tailwind classes from day one

### Follow-ups
- Post-migration: audit for unused CSS, remove dead selectors

---

## Phase 0: Foundation Setup (Sequential, ~30 min)

### Step 0.1: Install Tailwind CSS v4 and configure

**Files to create/modify:**
- `client/package.json` -- add `tailwindcss` and `@tailwindcss/vite`
- `client/vite.config.ts` -- add `@tailwindcss/vite` plugin
- `client/src/styles/globals.css` -- NEW entry point that imports Tailwind + preserves all custom properties via `@theme` block
- `client/src/main.tsx` -- replace `import './styles/global.css'` + `import './styles/skeleton.css'` with `import './styles/globals.css'`

**Install commands:**
```bash
cd client
npm install -D tailwindcss @tailwindcss/vite
```

**vite.config.ts changes:**
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  // ... existing config
})
```

**globals.css structure (NOT a JS config -- CSS-first):**
```css
@import "tailwindcss";

@theme {
  /* Colors - backgrounds */
  --color-bg-primary: #0a0a0c;
  --color-bg-secondary: #141416;
  --color-bg-card: #1a1a1e;
  --color-bg-hover: #252528;
  --color-bg-glass: rgba(20, 20, 22, 0.82);
  --color-bg-glass-light: rgba(40, 40, 44, 0.48);

  /* Colors - text */
  --color-text-primary: #f0f0f5;
  --color-text-secondary: #8e8e96;
  --color-text-tertiary: #5c5c66;

  /* Colors - accent */
  --color-accent: #2997ff;
  --color-accent-hover: #40a8ff;
  --color-accent-active: #1d8af0;

  /* Colors - rating */
  --color-rating-high: #ff9f0a;
  --color-rating-mid: #8e8e93;
  --color-rating-low: #ff453a;

  /* Colors - cinema atmosphere */
  --color-cinema-warm: #ff9f0a;
  --color-cinema-cool: #64d2ff;
  --color-cinema-rose: #ff375f;

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.5);
  --shadow-md: 0 4px 20px rgba(0,0,0,0.55);
  --shadow-lg: 0 16px 48px rgba(0,0,0,0.65);
  --shadow-glow: 0 0 24px rgba(41,151,255,0.12);
  --shadow-cinematic: 0 32px 80px -12px rgba(0,0,0,0.8);

  /* Border radius */
  --radius-card: 12px;
  --radius-card-lg: 18px;
  --radius-banner: 20px;

  /* Font family */
  --font-display: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  --font-body: 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  --font-mono: 'SF Mono', 'Cascadia Code', 'JetBrains Mono', ui-monospace, monospace;

  /* Easing */
  --ease-spring: cubic-bezier(0.32, 0.94, 0.6, 1);
  --ease-smooth: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-dramatic: cubic-bezier(0.22, 1, 0.36, 1);
}

/* All other styles from current global.css remain here */
/* This file is the NEW globals.css, replacing both global.css and skeleton.css */
```

**Acceptance criteria:**
- `npm run dev` starts without errors
- Tailwind utilities work in any component (verified by adding `bg-red-500` to a test element)
- All 30+ CSS custom properties from current `:root` block are preserved in `@theme` block
- `skeleton.css` import removed from `main.tsx`
- No `tailwind.config.js` or `postcss.config.js` created (v4 uses CSS-first config)

### Step 0.2: Complete CSS variable mapping

All 30+ CSS variables must have corresponding `@theme` entries. The complete mapping:

| CSS Variable | @theme Entry | Tailwind Utility |
|---|---|---|
| `--bg-primary` | `--color-bg-primary` | `bg-bg-primary` |
| `--bg-secondary` | `--color-bg-secondary` | `bg-bg-secondary` |
| `--bg-card` | `--color-bg-card` | `bg-bg-card` |
| `--bg-hover` | `--color-bg-hover` | `bg-bg-hover` |
| `--bg-glass` | `--color-bg-glass` | `bg-bg-glass` |
| `--bg-glass-light` | `--color-bg-glass-light` | `bg-bg-glass-light` |
| `--text-primary` | `--color-text-primary` | `text-text-primary` |
| `--text-secondary` | `--color-text-secondary` | `text-text-secondary` |
| `--text-tertiary` | `--color-text-tertiary` | `text-text-tertiary` |
| `--accent` | `--color-accent` | `text-accent` / `bg-accent` |
| `--accent-hover` | `--color-accent-hover` | `hover:bg-accent-hover` |
| `--accent-active` | `--color-accent-active` | `active:bg-accent-active` |
| `--accent-gradient` | Keep as CSS (not a color) | Use inline `style` |
| `--rating-high` | `--color-rating-high` | `text-rating-high` |
| `--rating-mid` | `--color-rating-mid` | `text-rating-mid` |
| `--rating-low` | `--color-rating-low` | `text-rating-low` |
| `--cinema-warm` | `--color-cinema-warm` | `text-cinema-warm` |
| `--cinema-cool` | `--color-cinema-cool` | `text-cinema-cool` |
| `--cinema-rose` | `--color-cinema-rose` | `text-cinema-rose` |
| `--glass-blur` | Keep as CSS (not a color) | Use `backdrop-blur-[48px]` |
| `--glass-saturate` | Keep as CSS (not a color) | Use `saturate-[200%]` |
| `--shadow-sm` | `--shadow-sm` | `shadow-sm` |
| `--shadow-md` | `--shadow-md` | `shadow-md` |
| `--shadow-lg` | `--shadow-lg` | `shadow-lg` |
| `--shadow-glow` | `--shadow-glow` | `shadow-glow` |
| `--shadow-cinematic` | `--shadow-cinematic` | `shadow-cinematic` |
| `--nav-height` | Keep as CSS variable | Use `h-[56px]` or `pt-[56px]` |
| `--section-gap` | Keep as CSS variable | Use `mb-[52px]` |
| `--content-padding` | Keep as CSS variable | Use `px-[48px]` |
| `--max-width` | Keep as CSS variable | Use `max-w-[1600px]` |
| `--card-radius` | `--radius-card` | `rounded-card` |
| `--card-radius-lg` | `--radius-card-lg` | `rounded-card-lg` |
| `--banner-radius` | `--radius-banner` | `rounded-banner` |
| `--font-display` | `--font-display` | `font-display` |
| `--font-body` | `--font-body` | `font-body` |
| `--font-mono` | `--font-mono` | `font-mono` |
| `--ease-spring` | `--ease-spring` | Use via arbitrary values |
| `--ease-smooth` | `--ease-smooth` | Use via arbitrary values |
| `--ease-out-expo` | `--ease-out-expo` | Use via arbitrary values |
| `--ease-dramatic` | `--ease-dramatic` | Use via arbitrary values |

**Acceptance criteria:**
- Every CSS variable in `:root` has a corresponding `@theme` entry
- `bg-primary`, `text-accent`, `font-display`, `rounded-card`, `shadow-cinematic` all work as utility classes
- Non-color tokens (shadows, radii, easing, fonts) are correctly mapped

---

## Phase 1: Core Component Migration (Sequential, ~2-3 hours)

**IMPORTANT:** Phase 1 steps are SEQUENTIAL, not parallel. All steps modify `global.css` (now `globals.css`), so they must be done one at a time to avoid merge conflicts. Each step migrates one component and removes its corresponding CSS rules from the residual file.

**PRE-MIGRATION AUDIT:** Before writing any Tailwind, run `grep -n 'className' <component>.tsx` for each component and ensure EVERY class reference has a mapping in the table below. The mapping tables are comprehensive but the executor must verify completeness against the actual source code. If a class is missing from the table, derive its Tailwind equivalent from the CSS rule in `global.css`.

### Step 1.1: MovieRow (prerequisite for HeroBanner)

**Rationale:** MovieRow uses `.category-section`, `.section-title`, `.scroll-row`, `.stagger-item`, `.scroll-row-fade` -- these are shared classes also used by PosterWall. Migrating MovieRow first establishes the pattern for scroll rows.

**Files:**
- `client/src/components/MovieRow.tsx` -- replace CSS classes with Tailwind
- `client/src/styles/globals.css` -- REMOVE `.category-section`, `.section-title` (only if not used by other un-migrated components -- verify first)

**Key mappings:**
| Old class | Tailwind equivalent |
|---|---|
| `.category-section` | `mb-[var(--section-gap)]` |
| `.section-title` | `font-display text-[28px] font-extrabold tracking-[-0.03em] text-text-primary mb-5 px-[var(--content-padding)]` |
| `.scroll-row` | `flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory px-[var(--content-padding)] pb-3` |
| `.stagger-item` | `animate-[fadeInUp_0.4s_var(--ease-out-expo)_both] [animation-delay:calc(var(--stagger-index,0)*0.06s)]` |
| `.scroll-row-fade` | `absolute top-0 right-0 bottom-2 w-20 bg-gradient-to-r from-transparent to-bg-primary pointer-events-none z-10` |

**Acceptance criteria:**
- MovieRow renders identically to current version
- Scroll rows scroll horizontally with fade indicator
- Stagger animations play on mount
- `prefers-reduced-motion` disables animations

### Step 1.2: Navbar + Layout

**Files:**
- `client/src/components/Navbar.tsx` -- replace all CSS classes with Tailwind
- `client/src/components/Layout.tsx` -- replace CSS classes with Tailwind
- `client/src/styles/globals.css` -- REMOVE all `.navbar*`, `.nav-*`, `.main-content`, `.error-banner*` rules

**Key mappings:**
| Old class | Tailwind equivalent |
|---|---|
| `.navbar` | `fixed top-0 left-0 right-0 z-[100] h-[var(--nav-height)] bg-[rgba(10,10,12,0.78)] backdrop-blur-[var(--glass-blur)] saturate-[var(--glass-saturate)] border-b border-white/5 transition-all duration-400` |
| `.navbar.scrolled` | `bg-[rgba(0,0,0,0.95)]! shadow-[0_1px_0_rgba(255,255,255,0.06),0_4px_24px_rgba(0,0,0,0.4)]!` |
| `.navbar-inner` | `max-w-[var(--max-width)] mx-auto px-[var(--content-padding)] h-full flex items-center justify-between` |
| `.nav-brand` | `text-[20px] font-bold tracking-[-0.02em] bg-gradient-to-r from-accent to-cinema-cool bg-clip-text text-transparent select-none cursor-pointer flex items-center gap-2` |
| `.nav-link` | `text-[13px] font-medium text-text-secondary py-1.5 transition-colors relative cursor-pointer bg-transparent border-none font-inherit tracking-[0.01em] flex items-center gap-1.25` |
| `.nav-link.active` | `text-text-primary` |
| `.nav-link.active::after` | `content-[''] absolute bottom-[-2px] left-1/2 -translate-x-1/2 w-4 h-0.5 bg-accent rounded-sm` |
| `.nav-search` | `flex items-center bg-white/[0.06] rounded-[10px] px-3.5 py-1.5 gap-1.5 border border-white/[0.06] transition-all duration-200` |
| `.nav-search:focus-within` | `border-accent/40 bg-white/[0.08]` |
| `.nav-search.focused` | `bg-white/[0.12] border-accent/50` |
| `.nav-search input` | `bg-transparent border-none outline-none text-text-primary text-[13px] w-[150px] py-0.5 font-inherit transition-all duration-300` |
| `.nav-search.focused input` | `w-[200px]` |
| `.main-content` | `pt-[var(--nav-height)]` |
| `.error-banner` | `bg-[rgba(255,59,48,0.12)] border border-[rgba(255,59,48,0.3)] rounded-xl mx-[var(--content-padding)] my-4 px-5 py-3.5 flex items-center justify-between gap-3` |
| `.error-banner-text` | `text-[#ff453a] text-sm font-medium` |
| `.error-banner-btn` | `bg-white/[0.08] text-[#f5f5f7] border border-white/[0.12] px-4 py-1.5 rounded-lg text-[13px] font-semibold cursor-pointer whitespace-nowrap font-inherit transition-all duration-200` |

**Acceptance criteria:**
- Navbar renders identically to current version (visual comparison)
- Scrolled state applies blur and shadow
- Search box focus state works (width expands)
- Mobile responsive (verified at 768px and 480px breakpoints)
- Error banner displays correctly
- Nav link active indicator (underline) renders

### Step 1.3: HeroBanner + PosterCard + PosterWall + RatingBadge

**Files:**
- `client/src/components/HeroBanner.tsx` -- replace CSS classes with Tailwind
- `client/src/components/PosterCard.tsx` -- replace CSS classes with Tailwind
- `client/src/components/PosterWall.tsx` -- replace CSS classes with Tailwind
- `client/src/components/RatingBadge.tsx` -- replace CSS classes with Tailwind
- `client/src/styles/globals.css` -- REMOVE all `.hero-*`, `.poster-*`, `.rating-*`, `.genre-*`, `.btn-*`, `.scroll-row*`, `.stagger-*` rules (those already removed in Step 1.1 stay removed)

**Key mappings (PosterCard):**
| Old class | Tailwind equivalent |
|---|---|
| `.poster-card` | `relative w-[185px] shrink-0 rounded-card overflow-hidden cursor-pointer transition-all duration-350 bg-bg-card contain-[layout_style_paint] will-change-[transform]` |
| `.poster-card:hover` | `translate-y-[-8px] scale-[1.03] shadow-[0_20px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.08),0_0_40px_rgba(113,227,255,0.08)]` |
| `.poster-card .poster-img` | `w-[185px] h-[278px] object-cover bg-bg-secondary block opacity-0 transition-opacity-300 transition-transform-400` |
| `.poster-card .poster-img.loaded` | `opacity-100` |
| `.poster-card:hover .poster-img` | `scale-[1.04]` |
| `.poster-info` | `p-3 pr-2.5 pb-3.5 relative` |
| `.poster-title` | `text-[13px] font-semibold text-text-primary whitespace-nowrap overflow-hidden text-ellipsis leading-[1.3]` |
| `.poster-year` | `text-[11px] text-text-tertiary mt-[3px]` |
| `.poster-card-img-wrap` | `relative overflow-hidden` |
| `.poster-card-overlay` | `absolute inset-0 bg-gradient-to-b from-transparent to-[rgba(0,0,0,0.88)] opacity-0 transition-opacity-350 pointer-events-none flex flex-col justify-end p-3.5` |
| `.poster-card:hover .poster-card-overlay` | `opacity-100` |

**Key mappings (HeroBanner):**
| Old class | Tailwind equivalent |
|---|---|
| `.hero-banner` | `relative w-full h-[75vh] min-h-[520px] max-h-[860px] overflow-hidden` |
| `.hero-backdrop` | `w-full h-full object-cover block transition-opacity-800 brightness-[0.85] contrast-[1.05]` |
| `.hero-gradient` | `absolute inset-0 bg-[linear-gradient(0deg,var(--bg-primary) 0%,rgba(10,10,12,0.85) 25%,rgba(10,10,12,0.4) 50%,transparent 100%),linear-gradient(90deg,rgba(10,10,12,0.6) 0%,transparent 40%)]` |
| `.hero-content` | `absolute bottom-0 left-0 right-0 px-[var(--content-padding)] pb-16 pt-20 max-w-[var(--max-width)] mx-auto z-10` |
| `.hero-title` | `font-display text-[56px] font-extrabold tracking-[-0.045em] leading-[1.05] mb-4 text-shadow-[0_4px_40px_rgba(0,0,0,0.7)]` |
| `.hero-meta` | `flex gap-2.5 items-center mb-4.5 text-sm text-text-secondary font-medium` |
| `.hero-overview` | `text-[15px] leading-[1.65] text-[rgba(255,255,255,0.55)] max-w-[520px] line-clamp-3` |
| `.hero-nav` | `flex justify-center items-center gap-2 py-4` |
| `.hero-dot` | `w-2 h-2 rounded-full bg-[rgba(255,255,255,0.25)] border-none p-0 cursor-pointer transition-all-300` |
| `.hero-dot.active` | `w-6 rounded bg-[rgba(255,255,255,0.12)] relative overflow-hidden` |

**Acceptance criteria:**
- Poster cards display with correct aspect ratio (2:3)
- Hover effects work (scale, overlay gradient, save button appears)
- Poster wall grid layout is responsive
- Scroll rows scroll horizontally with fade indicator
- Genre filter pills work correctly
- Stagger animations play on mount
- Hero banner backdrop, gradient overlay, and content render correctly
- Hero navigation dots work with progress animation
- `prefers-reduced-motion` disables animations

### Step 1.4: DetailModal ( rebuilt from actual source)

**IMPORTANT:** The original plan referenced `.detail-overlay`, `.detail-modal`, `.detail-backdrop`, `.detail-content` -- these DO NOT EXIST in the actual code. The real classes are listed below, rebuilt from `DetailModal.tsx` source.

**Files:**
- `client/src/components/DetailModal.tsx` -- replace CSS classes with Tailwind
- `client/src/styles/globals.css` -- REMOVE all `.modal-overlay`, `.modal-content`, `.modal-close-btn`, `.modal-backdrop-*`, `.modal-clearlogo`, `.modal-detail-body`, `.modal-poster-*`, `.modal-info`, `.modal-detail-*`, `.modal-genre-tag`, `.modal-section*`, `.modal-actions`, `.modal-action-btn`, `.modal-play-*`, `.modal-local-path`, `.modal-overview-text`, `.modal-cast-*`, `.cast-*`, `.rec-*`, `.stream-*`, `.skeleton-cast*`, `.skeleton-rec-*`, `.batch-confirm-*` rules

**Complete class list from DetailModal.tsx (actual source):**
- `modal-overlay`, `modal-content`, `modal-close-btn`
- `modal-backdrop-wrap`, `modal-backdrop-img`, `modal-backdrop-fade`, `modal-backdrop-fallback`, `modal-backdrop-fallback-img`, `modal-backdrop-empty`
- `modal-clearlogo`
- `modal-detail-body`, `modal-poster-wrap`, `modal-poster-img`, `modal-poster-placeholder`
- `modal-info`, `modal-detail-title`, `modal-detail-tagline`, `modal-detail-meta`, `modal-year-badge`, `modal-status-text`
- `modal-genre-tag`
- `modal-section`, `modal-section-overview`, `modal-section-actions`, `modal-section-cast`, `modal-section-recs`
- `modal-overview-text`, `modal-local-path`
- `modal-actions`, `modal-action-btn`, `modal-play-btn`, `modal-play-result`
- `modal-section-heading`, `modal-cast-row`
- `cast-card`, `cast-avatar`, `cast-avatar-placeholder`, `cast-name`, `cast-character`
- `rec-card`, `rec-card-poster`, `rec-card-placeholder`, `rec-card-info`, `rec-card-title`, `rec-card-year`
- `stream-badges`, `stream-badge`, `stream-badge-resolution`, `stream-badge-codec`, `stream-badge-audio`
- `rating-badges`, `rating-badge`, `badge-icon`, `badge-score`
- `batch-confirm-backdrop`, `batch-confirm-dialog`, `batch-confirm-title`, `batch-confirm-msg`, `batch-confirm-actions`
- `genre-pill` (reused in batch confirm)
- `batch-toolbar-delete` (reused in batch confirm)
- `skeleton`, `skeleton-cast`, `skeleton-cast-name`, `skeleton-cast-char`
- `skeleton-rec-poster`, `skeleton-rec-title`, `skeleton-rec-year`

**Key mappings (outer shell):**
| Old class | Tailwind equivalent |
|---|---|
| `.modal-overlay` | `fixed inset-0 z-[200] bg-[rgba(0,0,0,0.72)] flex items-center justify-center p-10 backdrop-blur-[24px] saturate-[140%] animate-[fadeIn_0.3s_ease]` |
| `.modal-content` | `bg-bg-secondary rounded-card-lg max-w-[860px] w-full max-h-[88vh] overflow-y-auto shadow-cinematic shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_0_120px_-20px_rgba(41,151,255,0.06)] animate-[modalEnter_0.45s_var(--ease-dramatic)] relative` |
| `.modal-close-btn` | `absolute top-4 right-4 w-8 h-8 rounded-full bg-[rgba(0,0,0,0.55)] backdrop-blur-[16px] text-white flex items-center justify-center text-base cursor-pointer transition-all-250 border border-white/10 z-[2]` |
| `.modal-close-btn:hover` | `bg-white/[0.15] scale-110 rotate-90 border-white/20` |

**Key mappings (backdrop section):**
| Old class | Tailwind equivalent |
|---|---|
| `.modal-backdrop-wrap` | `relative overflow-hidden rounded-card-lg rounded-b-none` |
| `.modal-backdrop-img` | `w-full h-[280px] object-cover block brightness-[0.8] contrast-[1.05]` |
| `.modal-backdrop-fade` | `absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-bg-secondary to-transparent` |
| `.modal-backdrop-fallback` | `h-[200px] flex items-center justify-center bg-gradient-to-br from-bg-card to-bg-secondary` |
| `.modal-backdrop-fallback-img` | `h-[80%] object-contain opacity-50 blur-[24px]` |
| `.modal-backdrop-empty` | `h-[100px] bg-gradient-to-br from-bg-card to-bg-secondary` |
| `.modal-clearlogo` | `absolute bottom-5 left-7 max-w-[220px] max-h-[60px] object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)] z-[2] opacity-0 animate-[fadeInUp_0.5s_var(--ease-out-expo)_0.2s_forwards]` |

**Key mappings (detail body):**
| Old class | Tailwind equivalent |
|---|---|
| `.modal-detail-body` | `p-6 px-8 pb-3 flex gap-[26px] relative` |
| `.modal-poster-wrap` | `shrink-0 w-[160px] self-stretch relative z-10` |
| `.modal-poster-wrap.has-backdrop` | `mt-[-56px]` |
| `.modal-poster-img` | `w-[160px] h-full object-cover rounded-[14px] shadow-[0_16px_48px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.05)]` |
| `.modal-poster-placeholder` | `w-[160px] h-full min-h-[220px] bg-gradient-to-br from-accent to-cinema-cool rounded-[14px] opacity-40 flex items-center justify-center text-white text-[40px] font-extrabold font-display` |
| `.modal-info` | `flex-1 min-w-0 flex flex-col justify-evenly gap-1` |
| `.modal-detail-title` | `font-display text-[30px] font-extrabold tracking-[-0.035em] mb-1 leading-[1.12]` |
| `.modal-detail-tagline` | `text-sm text-text-secondary italic opacity-70 m-0 tracking-[0.01em]` |
| `.modal-detail-meta` | `flex gap-2.5 items-center flex-wrap text-[13px] text-text-secondary` |
| `.modal-year-badge` | `font-bold text-text-primary bg-white/[0.07] py-0.5 px-2.5 rounded-md border border-white/5` |
| `.modal-status-text` | `text-accent` |
| `.modal-genre-tag` | `text-xs font-semibold text-accent bg-accent/[0.08] py-[5px] px-3.5 rounded-full border border-accent/[0.12]` |

**Key mappings (sections & actions):**
| Old class | Tailwind equivalent |
|---|---|
| `.modal-section` | `px-7 pt-3.5 pb-0` |
| `.modal-section-overview` | `pt-3.5` |
| `.modal-section-actions` | `pt-[18px]` |
| `.modal-section-cast` | `pt-[22px] pb-2` |
| `.modal-section-recs` | `pt-2 pb-7` |
| `.modal-overview-text` | `text-[14px] leading-[1.8] text-[rgba(255,255,255,0.6)] m-0 tracking-[0.005em]` |
| `.modal-local-path` | `p-2.5 px-3.5 bg-white/[0.03] rounded-lg text-xs text-text-tertiary font-mono break-all leading-[1.5] border border-white/[0.04]` |
| `.modal-actions` | `flex gap-2.5 items-center flex-wrap` |
| `.modal-play-btn` | `inline-flex items-center gap-2 py-3 px-[30px] bg-gradient-to-br from-[#2997ff] via-[#40a8ff] to-[#64d2ff] text-white text-[15px] font-semibold rounded-[14px] transition-all-300 shadow-[0_2px_10px_rgba(41,151,255,0.3),inset_0_1px_0_rgba(255,255,255,0.18)] relative overflow-hidden` |
| `.modal-action-btn` | `inline-flex items-center gap-[7px] py-[10px] px-6 bg-white/[0.05] text-[14px] font-medium rounded-xl cursor-pointer transition-all-250 font-inherit border border-white/[0.08] backdrop-blur-[8px] text-text-secondary tracking-[0.01em]` |
| `.modal-action-btn.save:hover` | `bg-accent/[0.1] border-accent/35 text-accent translate-y-[-1px] shadow-[0_4px_16px_rgba(41,151,255,0.12)]` |
| `.modal-action-btn.remove` | `text-[#ff453a] bg-[rgba(255,69,58,0.05)] border-[rgba(255,69,58,0.15)]` |
| `.modal-play-result.error` | `text-[#ff453a]` |
| `.modal-play-result.success` | `text-[#30d158]` |

**Key mappings (cast & recommendations):**
| Old class | Tailwind equivalent |
|---|---|
| `.modal-section-heading` | `text-xs font-bold mb-3 text-text-secondary uppercase tracking-[0.8px]` |
| `.modal-cast-row` | `flex gap-[18px] overflow-x-auto pb-2` |
| `.cast-card` | `shrink-0 w-[86px] text-center contain-[layout_style_paint] will-change-[transform]` |
| `.cast-avatar` | `w-[68px] h-[68px] rounded-full object-cover mx-auto mb-2 border-2 border-white/[0.06] bg-bg-card block transition-all-300` |
| `.cast-card:hover .cast-avatar` | `scale-[1.08] border-accent/30` |
| `.cast-avatar-placeholder` | `w-[68px] h-[68px] rounded-full mx-auto mb-2 bg-gradient-to-br from-accent/20 to-cinema-cool/[0.15] flex items-center justify-center text-accent text-2xl font-bold font-display` |
| `.cast-name` | `text-xs font-semibold leading-[1.25] text-text-primary` |
| `.cast-character` | `text-[10px] text-text-tertiary mt-[3px] leading-[1.25]` |
| `.rec-card` | `shrink-0 w-[140px] cursor-pointer rounded-[10px] overflow-hidden bg-bg-card transition-all-300 border border-white/[0.03] contain-[layout_style_paint] will-change-[transform]` |
| `.rec-card:hover` | `translate-y-[-8px] scale-[1.02] shadow-[0_12px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.06)]` |
| `.rec-card-poster` | `w-[140px] h-[210px] object-cover block transition-transform-400` |
| `.rec-card:hover .rec-card-poster` | `scale-[1.04]` |
| `.rec-card-info` | `p-2.5 px-3 pb-3` |
| `.rec-card-title` | `text-xs font-semibold overflow-hidden text-ellipsis whitespace-nowrap text-text-primary` |
| `.rec-card-year` | `text-[11px] text-text-tertiary mt-[3px]` |
| `.stream-badges` | `flex gap-1.5 flex-wrap mt-1` |
| `.stream-badge` | `inline-flex items-center gap-1 py-[3px] px-2 bg-white/[0.05] border border-white/[0.06] rounded-md text-[11px] font-semibold text-text-secondary font-mono tracking-[0.02em]` |
| `.stream-badge-resolution` | `bg-accent/[0.08] border-accent/[0.12] text-cinema-cool` |
| `.stream-badge-codec` | `bg-cinema-warm/[0.06] border-cinema-warm/10 text-cinema-warm` |
| `.stream-badge-audio` | `bg-[#30d158]/[0.06] border-[#30d158]/10 text-[#30d158]` |

**Acceptance criteria:**
- Modal opens with backdrop blur and animation
- Close button works (click outside, X button, Escape key)
- Backdrop image renders with correct filtering
- Clearlogo animates in
- Poster displays with correct sizing and shadow
- Title, tagline, meta, genres, ratings all render correctly
- Stream badges show resolution/codec/audio info
- Cast grid displays horizontally with avatar hover effect
- Recommendation cards scroll horizontally
- Action buttons (play, save/remove) work with correct states
- Delete confirmation dialog renders
- Mobile: modal adapts (poster stacks vertically at 480px)

### Step 1.5: LocalMediaView + SettingsPanel + ErrorBoundary + Skeleton

**Files:**
- `client/src/components/LocalMediaView.tsx` -- replace CSS classes with Tailwind
- `client/src/components/SettingsPanel.tsx` -- replace CSS classes with Tailwind
- `client/src/components/ErrorBoundary.tsx` -- replace CSS classes with Tailwind
- `client/src/components/Skeleton.tsx` -- replace CSS classes with Tailwind (uses skeleton.css classes)
- `client/src/styles/globals.css` -- REMOVE all remaining component-specific rules (`.local-*`, `.scan-*`, `.sort-*`, `.batch-*`, `.settings-*`, `.watcher-*`, `.error-boundary-*`, `.skeleton-*`, `.recently-watched-*`, `.series-*`, `.poster-grid`, `.genre-*`, `.btn-*`, `.loading-hint`, `.initial-loading`, `.omdb-usage-*`, `.rating-badge-*`)
- `client/src/styles/skeleton.css` -- DELETE entirely (all absorbed into Tailwind)
- `client/src/main.tsx` -- remove `import './styles/skeleton.css'`

**Key mappings (LocalMediaView):**
| Old class | Tailwind equivalent |
|---|---|
| `.scan-container` | `flex gap-3 items-center flex-wrap p-4 bg-white/[0.03] rounded-[14px] border border-white/[0.06]` |
| `.scan-input` | `flex-1 min-w-[280px] py-2.5 px-3.5 text-sm bg-bg-card border border-white/[0.08] rounded-[10px] text-text-primary font-inherit outline-none transition-all-200` |
| `.scan-btn` | `py-2.5 px-6 bg-gradient-to-br from-[#2997ff] via-[#40a8ff] to-[#64d2ff] text-white text-sm font-semibold rounded-[10px] border-none cursor-pointer transition-all-250 flex items-center gap-1.5 font-inherit shadow-[0_2px_10px_rgba(41,151,255,0.3)] relative overflow-hidden` |
| `.local-search-input` | `bg-white/[0.06] border border-white/[0.08] rounded-[10px] py-1.5 px-3.5 text-text-primary text-[13px] outline-none min-w-[160px] transition-all-200` |
| `.sort-toolbar` | `flex items-center gap-3 flex-wrap` |
| `.sort-controls` | `flex gap-1.5 flex-wrap` |
| `.local-card-overlay` | `absolute inset-0 bg-gradient-to-b from-transparent to-[rgba(0,0,0,0.88)] opacity-0 transition-opacity-350 pointer-events-none flex flex-col justify-end p-3.5` |
| `.local-card-delete-btn` | `absolute top-2 right-2 w-[34px] h-[34px] rounded-full flex items-center justify-center text-[13px] bg-[rgba(0,0,0,0.55)] text-[#ff453a] backdrop-blur-[12px] border border-[rgba(255,69,58,0.25)] cursor-pointer transition-all-300 z-[2] opacity-0 scale-[0.8]` |
| `.local-card-play-btn` | `absolute bottom-2 left-2 w-8 h-8 rounded-full border-none bg-[rgba(0,0,0,0.55)] backdrop-blur-[12px] saturate-[1.8] text-white flex items-center justify-center cursor-pointer opacity-0 scale-[0.8] transition-all-200 z-[2]` |
| `.local-card-checkbox` | `absolute top-2 left-2 w-6 h-6 rounded-md border-2 border-white/40 bg-[rgba(0,0,0,0.3)] backdrop-blur-[8px] flex items-center justify-center text-white z-[3] transition-all-150` |
| `.local-card-checkbox.checked` | `bg-accent border-accent` |
| `.batch-toolbar` | `fixed bottom-0 left-0 right-0 flex items-center justify-center gap-4 py-3.5 px-6 bg-[rgba(30,30,30,0.85)] backdrop-blur-[20px] saturate-[1.8] border-t border-white/[0.08] z-[200] animate-[fadeInUp_0.2s_ease-out]` |
| `.batch-toolbar-delete` | `py-2 px-5 rounded-[10px] border-none bg-gradient-to-br from-[#ff453a] to-[#ff6b5a] text-white text-[13px] font-semibold cursor-pointer transition-all-250 shadow-[0_2px_8px_rgba(255,59,48,0.3)]` |

**Key mappings (SettingsPanel):**
| Old class | Tailwind equivalent |
|---|---|
| `.settings-view` | `pt-[calc(var(--nav-height)+24px)] max-w-[600px] mx-auto px-[var(--content-padding)] pb-[60px]` |
| `.settings-title` | `text-[32px] font-extrabold tracking-[-0.03em] mb-9` |
| `.settings-section-heading` | `text-base font-bold mb-[18px] mt-9 text-text-primary flex items-center gap-2 tracking-[-0.01em]` |
| `.settings-group label` | `block text-xs font-semibold text-text-secondary mb-1.5 uppercase tracking-[0.6px]` |
| `.settings-group input` | `w-full py-[11px] px-3.5 text-[15px] bg-bg-card border border-white/[0.08] rounded-[10px] text-text-primary font-inherit outline-none transition-all-200` |
| `.settings-textarea` | `w-full py-[11px] px-3.5 text-[15px] bg-bg-card border border-white/[0.08] rounded-[10px] text-text-primary font-inherit outline-none resize-y min-h-[60px] transition-all-200` |
| `.settings-save-btn` | `py-[11px] px-7 bg-gradient-to-br from-[#2997ff] via-[#40a8ff] to-[#64d2ff] text-white text-[15px] font-semibold rounded-xl transition-all-250 shadow-[0_2px_10px_rgba(41,151,255,0.3)] relative overflow-hidden` |
| `.settings-success` | `mt-3 text-sm text-[#30d158] font-medium` |
| `.watcher-status` | `flex gap-3 items-center mb-5 py-3 px-4 bg-white/[0.03] rounded-xl border border-white/[0.06]` |
| `.watcher-dot` | `inline-block w-[10px] h-[10px] rounded-full bg-[#8e8e93]` |
| `.watcher-dot.active` | `bg-[#30d158] shadow-[0_0_8px_rgba(48,209,88,0.4)]` |
| `.watcher-toggle-btn` | `py-[7px] px-[18px] text-[13px] font-semibold rounded-lg border-none cursor-pointer text-white transition-all-250 font-inherit shadow-[0_2px_6px_rgba(0,0,0,0.2)]` |
| `.watcher-toggle-btn.start` | `bg-gradient-to-br from-[#2997ff] to-[#64d2ff]` |
| `.watcher-toggle-btn.stop` | `bg-gradient-to-br from-[#ff453a] to-[#ff6b5a]` |

**Key mappings (ErrorBoundary + Skeleton):**
| Old class | Tailwind equivalent |
|---|---|
| `.error-boundary` | `flex flex-col items-center justify-center min-h-screen bg-black text-[#f5f5f7] p-10 text-center font-[-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif]` |
| `.error-boundary-icon` | `text-[48px] mb-4 opacity-60` |
| `.error-boundary-title` | `text-[22px] font-bold mb-2 tracking-[-0.02em]` |
| `.error-boundary-msg` | `text-[#86868b] text-sm mb-6 max-w-[400px] leading-[1.6]` |
| `.error-boundary-btn` | `bg-gradient-to-br from-[#2997ff] via-[#40a8ff] to-[#64d2ff] text-white border-none py-2.5 px-6 rounded-xl text-[15px] font-semibold cursor-pointer font-inherit transition-all-250 shadow-[0_2px_10px_rgba(41,151,255,0.35)]` |
| `.skeleton` | `bg-[linear-gradient(90deg,rgba(255,255,255,0.06)_25%,rgba(255,255,255,0.12)_50%,rgba(255,255,255,0.06)_75%)] bg-[length:200%_100%] animate-[shimmer_1.8s_ease-in-out_infinite] rounded-card` |
| `.skeleton-card` | `w-[185px] shrink-0 rounded-card overflow-hidden bg-bg-card animate-[fadeInUp_0.4s_var(--ease-out-expo)_both]` |
| `.skeleton-card-img` | `w-[185px] h-[278px] bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_25%,rgba(255,255,255,0.08)_50%,rgba(255,255,255,0.04)_75%)] bg-[length:200%_100%] animate-[shimmer_1.8s_ease-in-out_infinite]` |
| `.skeleton-poster` | `w-[185px] h-[278px]` |
| `.skeleton-row` | `flex gap-4 px-[var(--content-padding)]` |

**Acceptance criteria:**
- Scan input and button work
- Type filter (all/movie/tv) toggles correctly
- Batch mode with selection checkboxes works
- Series group expansion/collapse works
- Episode list scrolls within max-height
- Sort controls work
- Settings form loads current config
- Save button persists changes
- Watcher start/stop controls work
- Skeleton loading states look identical to current
- Error boundary catches and displays errors
- All existing `.skeleton-*` classes work via Tailwind

### Step 1.6: Residual global.css cleanup

**Files:**
- `client/src/styles/globals.css` -- final cleanup pass

**What MUST remain in globals.css (~350 lines target):**
1. `@import "tailwindcss"` + `@theme` block (~80 lines)
2. `*, *::before, *::after` reset (~6 lines)
3. `html` base styles (~6 lines)
4. `body` base styles (~8 lines)
5. `body::before` atmospheric gradient pseudo-element (~12 lines)
6. `::selection` highlight (~4 lines)
7. `:focus-visible` ring (~5 lines)
8. `@keyframes` block: `pageEnter`, `fadeIn`, `modalEnter`, `shimmer`, `fadeInUp`, `slideOutLeft`, `slideInRight`, `slideOutRight`, `slideInLeft`, `slideContentLeft`, `slideContentRight`, `dotProgress` (~60 lines)
9. `.page-transition` class (~3 lines)
10. Scrollbar styles: `::-webkit-scrollbar`, `::-webkit-scrollbar-track`, `::-webkit-scrollbar-thumb` (~12 lines)
11. Base element styles: `img`, `a`, `button` (~10 lines)
12. Responsive `@media (max-width: 768px)` -- CSS variable overrides (`--content-padding: 16px`, `--section-gap: 32px`, `--nav-height: 48px`) + `body::before { display: none }` (~15 lines)
13. Responsive `@media (max-width: 480px)` (~5 lines)
14. `@media (prefers-reduced-motion: reduce)` block (~20 lines)
15. `.stagger-item` animation definition (~3 lines)
16. `.search-highlight` and `.search-result-count` global utility classes (~6 lines) -- used by PosterCard and PosterWall

**Acceptance criteria:**
- `globals.css` is ~350 lines (not 200 -- that target was unrealistic given keyframes, resets, pseudo-elements, scrollbar styles, responsive media queries, and prefers-reduced-motion)
- `body::before` atmospheric gradient is preserved
- Scrollbar styles are preserved
- `prefers-reduced-motion` media query is preserved
- Responsive `@media` overrides for CSS variables work (Tailwind responsive prefixes cannot override CSS variables, so these MUST remain in CSS)
- Component-level responsive overrides (e.g., `.modal-detail-body` flex-direction at 480px) use Tailwind responsive prefixes (`max-[480px]:flex-col`) in the component classes, NOT residual CSS
- All keyframe animations are preserved
- `npm run dev` starts without errors
- Visual comparison shows no regressions

---

## Phase 2: Feature Optimization (Sequential after Phase 1, ~1-2 hours)

**Dependency note:** Step 2.1 modifies `Navbar.tsx` which was migrated in Phase 1 Step 1.2. It must run AFTER Phase 1 completes, not in parallel.

### Step 2.1: Search experience improvement

**Files:**
- `client/src/components/Navbar.tsx` -- enhance search UX
  - Add keyboard navigation (up/down arrows in history dropdown)
  - Add search suggestions dropdown with recent + popular
  - Improve debounce timing (300ms -> 250ms)
- `client/src/pages/SearchResultsPage.tsx` -- add loading skeleton during search
- `server/src/routes/search.ts` -- add search result caching (5min TTL)

**Acceptance criteria:**
- Search history dropdown shows with keyboard navigation
- Search results load with skeleton (not blank screen)
- Subsequent searches for same query are instant (cached)
- Search input clears properly when navigating away
- Search works from URL deep link (`/search?q=xxx`)

### Step 2.2: Detail modal information display

**Files:**
- `client/src/components/DetailModal.tsx` -- enhance detail display
  - Add runtime display (hours/minutes format)
  - Add status badge (Released/Returning/etc.)
  - Add tagline in italic below title
  - Add NFO ratings section (if available)
  - Add stream info badges (resolution, codec, audio)
- `client/src/components/RatingBadge.tsx` -- add NFO rating display

**Acceptance criteria:**
- Runtime shows as "2h 14m" format
- Status badge color-coded
- Tagline displays in italic
- NFO ratings display when available (distinct from TMDB ratings)
- Stream info badges show video/audio codec details

### Step 2.3: Local media management UX

**Files:**
- `client/src/components/LocalMediaView.tsx` -- enhance UX
  - Add drag-and-drop reordering (within groups)
  - Add batch operations toolbar (move, rename, delete)
  - Add progress indicators for scan/delete operations
  - Improve empty state messaging
- `client/src/pages/LocalPage.tsx` -- add loading states

**Acceptance criteria:**
- Batch delete shows confirmation dialog with count
- Scan progress shows real-time updates
- Empty state shows helpful guidance
- Sort controls are clearly visible
- Filter pills show active state

---

## Phase 3: New Backend Features (Sequential, ~3-4 hours)

### Shared Infrastructure

**ProgressTracker service (polling-based):**
All new long-running operations (scraping, file organization, track removal) will use a shared polling-based progress tracker. This matches the existing `GET /api/watcher/status` pattern and avoids SSE complexity.

**Files to create:**
- `server/src/services/progress-tracker.ts` -- NEW
  - In-memory progress store keyed by operation ID
  - `startOperation(id, total, description)` -- register new operation
  - `updateProgress(id, current, message?)` -- update progress
  - `completeOperation(id, result?)` -- mark complete
  - `failOperation(id, error)` -- mark failed
  - `getProgress(id)` -- get current progress
  - Auto-cleanup after 30 minutes

**Pattern for all new routes:**
```typescript
import { badRequest, internalError } from '../middleware/errorHandler';
// All new routes MUST use errorHandler middleware for consistent error responses
```

### Step 3.1: Metadata scraping service

**Files to create:**
- `server/src/services/metadata-scraper.ts` -- NEW
  - Integrate with TMDB + OMDb fallback
  - Batch scraping with concurrency control (max 3 concurrent)
  - Progress reporting via ProgressTracker polling
  - Uses existing `services/tmdb.ts` and `services/omdb.ts` patterns
- `server/src/routes/metadata.ts` -- NEW
  - `POST /api/metadata/scrape` -- trigger scrape for local media
  - `GET /api/metadata/status/:operationId` -- get scrape progress (polling)
  - `GET /api/metadata/preview/:id` -- preview scraped data before applying
  - All routes use `badRequest()`, `internalError()` from `middleware/errorHandler.ts`
- `server/src/types/api.ts` -- add metadata types
- `client/src/types/api.ts` -- add metadata response types
- `client/src/api/client.ts` -- add metadata API methods
- `server/src/index.ts` -- register metadata router

**Database changes:**
```sql
-- No new tables needed. Uses existing local_media columns:
-- tmdb_id, nfo_ratings, stream_info, nfo_plot, nfo_genres, etc.
-- Add scrape_status column for tracking
ALTER TABLE local_media
  ADD COLUMN scrape_status ENUM('pending','scraped','failed','manual') DEFAULT NULL,
  ADD COLUMN last_scraped_at TIMESTAMP NULL;
```

**Acceptance criteria:**
- Scraping triggers for all local media without tmdb_id
- Scraping success rate >= 80% (measured by tmdb_id population)
- Progress updates every 5 items via polling
- Preview shows before applying changes
- Failed items are marked and retryable
- All routes use existing errorHandler middleware

### Step 3.2: Subtitle management service

**Files to create:**
- `server/src/services/subtitle-manager.ts` -- NEW
  - Subtitle search via OpenSubtitles API
  - Subtitle download and placement alongside video files
  - Language preference configuration
  - OpenSubtitles API key management via config (not hardcoded)
- `server/src/routes/subtitles.ts` -- NEW
  - `GET /api/subtitles/search/:id` -- search subtitles for local media
  - `POST /api/subtitles/download` -- download subtitle file
  - `GET /api/subtitles/languages` -- list supported languages
  - All routes use `badRequest()`, `internalError()` from `middleware/errorHandler.ts`
- `server/src/index.ts` -- register subtitles router
- `client/src/types/api.ts` -- add subtitle types
- `client/src/api/client.ts` -- add subtitle API methods

**OpenSubtitles API key management:**
- Store API key in the existing config system (same pattern as TMDB/OMDb keys)
- Add `opensubtitles_api_key` field to config
- Validate key existence before making API calls
- Graceful error if key is missing ("Please configure OpenSubtitles API key in Settings")

**Acceptance criteria:**
- Subtitle search returns results from OpenSubtitles API
- Download places .srt/.ass file alongside video
- Language preference saved in config
- Match rate >= 60% for popular titles
- Subtitle file is correctly named for player detection
- Missing API key produces clear error message

### Step 3.3: File organization service

**Files to create:**
- `server/src/services/file-organizer.ts` -- NEW
  - Batch rename based on metadata
  - Directory restructuring (flat -> organized structure)
  - Conflict detection and resolution
  - Rollback strategy: before any file operation, create a JSON manifest of original paths. On failure, iterate manifest and rename back. Store manifest in `server/.rollback/{operationId}.json` with 24h auto-cleanup.
- `server/src/routes/organize.ts` -- NEW
  - `POST /api/organize/rename` -- batch rename files
  - `POST /api/organize/structure` -- restructure directories
  - `GET /api/organize/preview` -- preview changes before applying
  - `POST /api/organize/rollback/:operationId` -- rollback a completed operation
  - All routes use `badRequest()`, `internalError()` from `middleware/errorHandler.ts`
- `server/src/index.ts` -- register organize router

**Rollback strategy:**
```typescript
// Before any file operation:
const manifest = { operationId, files: originalPaths.map(p => ({ from: newPath, to: originalPath })) };
await fs.writeFile(`server/.rollback/${operationId}.json`, JSON.stringify(manifest));

// On failure or explicit rollback:
for (const file of manifest.files) {
  await fs.rename(file.from, file.to);
}
await fs.unlink(`server/.rollback/${operationId}.json`);
```

**Acceptance criteria:**
- Rename preview shows old -> new path mapping
- Batch rename handles 100+ files without timeout
- Directory restructuring preserves file integrity
- Conflicts are detected and reported
- Operations are atomic (rollback on failure via manifest)
- Rollback endpoint restores previous state
- Manifests auto-cleanup after 24 hours

### Step 3.4: FFmpeg video track management

**Files to create:**
- `server/src/services/track-manager.ts` -- NEW
  - List video/audio/subtitle tracks via ffprobe
  - Remove specified tracks via ffmpeg
  - Progress reporting for long operations via ProgressTracker
  - Rollback: copy original file before modification, delete copy on success
- `server/src/routes/tracks.ts` -- NEW
  - `GET /api/tracks/:id` -- list tracks for a media file
  - `POST /api/tracks/remove` -- remove specified tracks
  - `GET /api/tracks/preview` -- preview track removal
  - `GET /api/tracks/health` -- check ffmpeg availability
  - All routes use `badRequest()`, `internalError()` from `middleware/errorHandler.ts`
- `server/src/index.ts` -- register tracks router

**ffmpeg availability check:**
- On server startup: run `ffmpeg -version` via `child_process.exec`
- Store result in memory: `{ available: boolean, version?: string }`
- `GET /api/tracks/health` returns this status
- If ffmpeg not available: all track routes return `503 Service Unavailable` with message "ffmpeg not installed. Please install ffmpeg and restart the server."
- Frontend: show ffmpeg status in Settings page

**Dependencies:**
- ffmpeg binary must be installed and in PATH
- ffprobe for track inspection

**Acceptance criteria:**
- Track listing shows all audio/subtitle tracks with language/codec
- Track removal produces valid video file
- Original file is backed up before modification (rollback via backup copy)
- Progress updates during ffmpeg operation
- File size reduction is reported
- ffmpeg availability checked at startup
- `GET /api/tracks/health` returns availability status
- Clear error message when ffmpeg is not installed

---

## Phase 4: Feature UI (Sequential after Phase 3, ~2-3 hours)

### Step 4.1: Metadata scraping UI

**Files:**
- `client/src/components/MetadataScrapePanel.tsx` -- NEW (all Tailwind)
  - Scrape trigger button
  - Progress bar with item count (polls `GET /api/metadata/status/:operationId`)
  - Results preview table
  - Apply/reject changes
- `client/src/pages/LocalPage.tsx` -- integrate scrape panel
- `client/src/api/client.ts` -- add metadata API calls

**Acceptance criteria:**
- Scrape button triggers batch operation
- Progress shows "Scraping 15/42 items..."
- Preview table shows title, year, poster, ratings
- User can apply all or selectively
- Failed items are highlighted

### Step 4.2: Subtitle management UI

**Files:**
- `client/src/components/SubtitlePanel.tsx` -- NEW (all Tailwind)
  - Subtitle search interface
  - Language selector
  - Download button
  - Current subtitle display
- `client/src/components/DetailModal.tsx` -- add subtitle section
- `client/src/api/client.ts` -- add subtitle API calls

**Acceptance criteria:**
- Subtitle search shows available downloads
- Language dropdown with common languages
- Download progress indicator
- Subtitle status shows in detail modal

### Step 4.3: File organization UI

**Files:**
- `client/src/components/OrganizePanel.tsx` -- NEW (all Tailwind)
  - Rename preview table
  - Directory structure preview
  - Execute button with confirmation
  - Undo last operation (calls rollback endpoint)
- `client/src/pages/LocalPage.tsx` -- add organize tab

**Acceptance criteria:**
- Preview shows before/after paths
- Execute button requires confirmation
- Undo restores previous state via rollback endpoint
- Progress shows during operation

### Step 4.4: Track management UI

**Files:**
- `client/src/components/TrackManager.tsx` -- NEW (all Tailwind)
  - Track list with checkboxes
  - Remove button
  - Backup confirmation
  - ffmpeg availability indicator
- `client/src/components/DetailModal.tsx` -- add track management section
- `client/src/api/client.ts` -- add track API calls

**Acceptance criteria:**
- Track list shows all streams with language/codec
- User can select tracks to remove
- Backup confirmation before removal
- File size comparison after operation
- ffmpeg status shown (available / not installed)

---

## Phase 5: Performance Optimization (Sequential, ~1-2 hours)

### Step 5.1: Data loading optimization

**Files:**
- `client/src/context/AppContext.tsx` -- optimize fetch patterns
  - Implement request deduplication
  - Add stale-while-revalidate caching
  - Lazy load non-critical data
- `client/src/hooks/useApi.ts` -- add request caching
- `client/src/main.tsx` -- add React.lazy for route splitting

**Acceptance criteria:**
- First paint < 4 seconds (measured via Performance tab)
- No duplicate requests for same data
- Non-critical data loads after first paint
- Route-level code splitting reduces initial bundle

### Step 5.2: Bundle optimization

**Files:**
- `client/vite.config.ts` -- optimize build config
  - Enable manual chunks
  - Configure asset optimization
- `client/tsconfig.json` -- enable path aliases for cleaner imports

**Acceptance criteria:**
- Initial JS bundle < 200KB gzipped
- No duplicate dependencies in chunks
- Assets are properly hashed for caching

---

## Parallel Execution Map

```
Phase 0 (Foundation) ─────────────────────────────────────────────┐
    Step 0.1: Install + configure ────────────────────────────────┤│
    Step 0.2: CSS variable mapping ───────────────────────────────┘│
                                                                   │
Phase 1 (Component Migration) ──── SEQUENTIAL (all modify CSS) ──┤
    Step 1.1: MovieRow ───────────────────────────────────────────┤│
    Step 1.2: Navbar + Layout ────────────────────────────────────┤│
    Step 1.3: Hero + Poster + Wall + Rating ──────────────────────┤│
    Step 1.4: DetailModal ────────────────────────────────────────┤│
    Step 1.5: Local + Settings + ErrorBoundary + Skeleton ────────┤│
    Step 1.6: Residual cleanup ───────────────────────────────────┘│
                                                                   │
Phase 2 (Feature Optimization) ── SEQUENTIAL after Phase 1 ──────┤
    Step 2.1: Search UX ──────────────────────────────────────────┤│
    Step 2.2: Detail display ─────────────────────────────────────┤│
    Step 2.3: Local media UX ─────────────────────────────────────┘│
                                                                   │
Phase 3 (Backend Features) ────── SEQUENTIAL ────────────────────┤
    Step 3.1: Metadata scraping ──────────────────────────────────┤│
    Step 3.2: Subtitle management ────────────────────────────────┤│
    Step 3.3: File organization ──────────────────────────────────┤│
    Step 3.4: FFmpeg tracks ──────────────────────────────────────┘│
                                                                   │
Phase 4 (Feature UI) ──────────── SEQUENTIAL after Phase 3 ──────┤
    Step 4.1: Metadata UI ────────────────────────────────────────┤│
    Step 4.2: Subtitle UI ────────────────────────────────────────┤│
    Step 4.3: Organize UI ────────────────────────────────────────┤│
    Step 4.4: Track UI ───────────────────────────────────────────┘│
                                                                   │
Phase 5 (Performance) ─────────── SEQUENTIAL ────────────────────┤
    Step 5.1: Data loading optimization ──────────────────────────┤│
    Step 5.2: Bundle optimization ────────────────────────────────┘│
                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Tailwind migration breaks visual appearance | HIGH | MEDIUM | Migrate one component at a time, visual test after each |
| New backend features break existing routes | HIGH | LOW | New routes are additive, existing routes untouched |
| FFmpeg not available on target machine | MEDIUM | HIGH | Startup check + `/api/tracks/health` endpoint, clear user message |
| OpenSubtitles API rate limiting | MEDIUM | HIGH | Implement retry with backoff, cache results |
| Performance regression from new features | MEDIUM | MEDIUM | Monitor bundle size, lazy load new features |
| MySQL schema migration fails | HIGH | LOW | ALTER TABLE with defaults, backward compatible |
| Phase 1 components share CSS classes | HIGH | MEDIUM | Sequential execution, verify no shared class breakage |
| Rollback operations fail | MEDIUM | LOW | Test rollback paths, manifest validation before execution |

---

## Dependencies to Install

### Frontend
```bash
cd client
npm install -D tailwindcss @tailwindcss/vite
```

### Backend (new dependencies)
```bash
cd server
# Subtitle API client (e.g., opensubtitles-api)
npm install opensubtitles-api
# No ffmpeg npm package needed -- use child_process to call ffmpeg binary
```

---

## Testing Strategy

### Per-phase verification
- **Phase 0:** `npm run dev` starts, Tailwind classes render, all CSS variables work
- **Phase 1:** Visual comparison of each migrated component vs. original, pixel-level check
- **Phase 2:** Manual testing of search, detail, local media flows
- **Phase 3:** API testing via curl/Postman for each new route, error handling verification
- **Phase 4:** Manual testing of new UI panels
- **Phase 5:** Performance measurement via Chrome DevTools

### Existing tests (10 files, must all pass)
- `client/src/components/__tests__/PosterCard.test.tsx`
- `client/src/components/__tests__/RatingBadge.test.tsx`
- `client/src/hooks/__tests__/useApi.test.ts`
- `client/src/api/__tests__/client.test.ts`
- `client/src/reducers/__tests__/dataReducer.test.ts`
- `server/src/services/__tests__/cache.test.ts`
- `server/src/services/__tests__/external-id-cache.test.ts`
- `server/src/services/__tests__/omdb.test.ts`
- `server/src/services/__tests__/scanner.test.ts`
- `server/src/services/__tests__/tmdb.test.ts`

### New tests to write
- `server/src/services/__tests__/metadata-scraper.test.ts`
- `server/src/services/__tests__/subtitle-manager.test.ts`
- `server/src/services/__tests__/file-organizer.test.ts`
- `server/src/services/__tests__/track-manager.test.ts`
- `server/src/services/__tests__/progress-tracker.test.ts`

---

## File Change Summary

### Files to CREATE (17 new files)
1. `client/src/styles/globals.css` -- NEW entry point replacing global.css + skeleton.css
2. `server/src/services/progress-tracker.ts` -- shared progress tracking
3. `server/src/services/metadata-scraper.ts`
4. `server/src/routes/metadata.ts`
5. `server/src/services/subtitle-manager.ts`
6. `server/src/routes/subtitles.ts`
7. `server/src/services/file-organizer.ts`
8. `server/src/routes/organize.ts`
9. `server/src/services/track-manager.ts`
10. `server/src/routes/tracks.ts`
11. `client/src/components/MetadataScrapePanel.tsx`
12. `client/src/components/SubtitlePanel.tsx`
13. `client/src/components/OrganizePanel.tsx`
14. `client/src/components/TrackManager.tsx`
15. `server/src/services/__tests__/progress-tracker.test.ts`

### Files to MODIFY (22 files)
1. `client/package.json` -- add tailwindcss, @tailwindcss/vite
2. `client/vite.config.ts` -- add @tailwindcss/vite plugin
3. `client/src/main.tsx` -- update CSS imports, add lazy loading
4. `client/src/components/MovieRow.tsx` -- Tailwind migration (NEW -- was missing)
5. `client/src/components/Navbar.tsx` -- Tailwind migration + search UX
6. `client/src/components/Layout.tsx` -- Tailwind migration
7. `client/src/components/HeroBanner.tsx` -- Tailwind migration
8. `client/src/components/PosterCard.tsx` -- Tailwind migration
9. `client/src/components/PosterWall.tsx` -- Tailwind migration
10. `client/src/components/DetailModal.tsx` -- Tailwind migration (rebuilt from actual source) + new sections
11. `client/src/components/LocalMediaView.tsx` -- Tailwind migration + UX
12. `client/src/components/RatingBadge.tsx` -- Tailwind migration
13. `client/src/components/Skeleton.tsx` -- Tailwind migration
14. `client/src/components/SettingsPanel.tsx` -- Tailwind migration
15. `client/src/components/ErrorBoundary.tsx` -- Tailwind migration
16. `client/src/pages/SearchResultsPage.tsx` -- search UX
17. `client/src/pages/LocalPage.tsx` -- integrate new panels
18. `client/src/api/client.ts` -- add new API methods
19. `client/src/types/api.ts` -- add new types
20. `server/src/index.ts` -- register new routers
21. `server/src/types/api.ts` -- add new types
22. `server/src/routes/search.ts` -- add caching
23. `server/src/migrations/add-local-media-fields.sql` -- add scrape_status

### Files to DELETE (1 file)
1. `client/src/styles/skeleton.css` -- absorbed into Tailwind
2. `client/src/styles/global.css` -- replaced by globals.css (after migration complete)

---

## Success Criteria

1. **Tailwind v4 migration complete:** All 15 components + 6 pages use Tailwind utilities, `globals.css` ~350 lines, `skeleton.css` and `global.css` deleted
2. **Visual fidelity:** Dark theme preserved, all 30+ design tokens intact, responsive at 768px and 480px
3. **Search UX:** History dropdown, keyboard nav, cached results
4. **Detail modal:** Runtime, status, tagline, NFO ratings, stream info all displayed (using actual CSS class names)
5. **Local media UX:** Batch operations, progress indicators, helpful empty states
6. **Metadata scraping:** >= 80% success rate for tmdb_id population
7. **Subtitle management:** >= 60% match rate for popular titles
8. **File organization:** Batch rename/restructure with preview and rollback
9. **Track management:** List/remove tracks via ffmpeg with backup and availability check
10. **Performance:** First paint < 4s, initial bundle < 200KB gzipped
11. **All 10 existing tests pass:** No regressions
12. **Error handling:** All new routes use existing errorHandler middleware
13. **Progress tracking:** Polling-based ProgressTracker for all long-running operations
