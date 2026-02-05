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

- **Navigation updates**: Cleaned up header and footer
  - Removed Blog and Contributors links from `header.tsx`
  - Removed Blog and Contributors links from `footer.tsx`
  - Removed blog and contributors entries from `sitemap.ts`
