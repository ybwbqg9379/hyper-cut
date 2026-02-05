# Changelog

All notable changes to this project (forked from HyperCut) will be documented in this file.

## [Unreleased]

### Fixed

- **React version mismatch**: Upgraded `react` from 19.2.0 to 19.2.4 to match `react-dom` version

### Changed

- **Re-branding**: OpenCut → HyperCut
  - Replaced all `OpenCut` / `opencut` text references with `HyperCut` / `hypercut`
  - Renamed package namespace `@opencut/*` → `@hypercut/*`
  - Renamed logo directory `logos/opencut/` → `logos/hypercut/`
  - Updated site URL to `https://hypercut.app`

### Removed

- **Blog feature**: Removed Marble CMS integration and all blog-related code
  - Deleted `apps/web/src/app/blog/`
  - Deleted `apps/web/src/lib/blog/`
  - Deleted `apps/web/src/types/blog.ts`
  - Removed `MARBLE_WORKSPACE_KEY` and `NEXT_PUBLIC_MARBLE_API_URL` from env schema
- **Contributors page**: Removed GitHub contributors showcase
  - Deleted `apps/web/src/app/contributors/`
- **RSS feed**: Removed blog RSS feed
  - Deleted `apps/web/src/app/rss.xml/`
- **Sponsors page**: Removed sponsors showcase
  - Deleted `apps/web/src/app/sponsors/`
- **Roadmap page**: Removed OpenCut roadmap
  - Deleted `apps/web/src/app/roadmap/`
- **Legal pages**: Removed (will add custom versions later)
  - Deleted `apps/web/src/app/privacy/`
  - Deleted `apps/web/src/app/terms/`
- **UI cleanup**:
  - Changed homepage headline from "The open source" to "HyperCut"
  - Removed GitHub 40k+ star counter button from header
  - Simplified footer to only show logo + copyright
  - Removed all navigation links (Blog, Contributors, Sponsors, Roadmap, etc.)
