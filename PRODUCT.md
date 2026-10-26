# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are people adopting a distributable desktop music client (not only a private self-host toy): listening, building libraries, and managing content. Secondary users are operators using the admin console to review uploads and keep the catalog healthy.

## Product Purpose

WY Music is a NetEase Cloud Music–inspired player with a **self-hosted library**. Success means users can discover, play, organize, and grow their catalog without depending on a single commercial stream service—especially by searching multiple external sources and batching songs into the library.

## Positioning

The meaningfully different mechanism is **multi-source search + batch ingest** (Excel-driven bulk search, source-aware selection, download to library or folder)—not a pixel-perfect clone of NetEase Cloud alone.

## Operating Context

- Desktop client (Electron + Vue): discover, search, playlists, player chrome, external/batch search, downloads, lyrics, window/taskbar behaviors.
- Admin (Vue): catalog/upload review and operational management against the same API.
- Server API + shared types; local and remote audio workflows.

## Capabilities and Constraints

- Confirmed: playback, playlists, keyword search, multi-source external search, batch search/import/download, upload and review flows, desktop affordances (mini player, desktop lyric, custom download paths).
- Technical: monorepo (`apps/desktop`, `apps/admin`, `apps/server`, `packages/shared`); Node ≥ 20; pnpm.
- Undecided / open: formal public distribution channel, licensing of external sources, and a future visual rebrand (allowed; not locked to NetEase clone aesthetics).

## Brand Commitments

- Product name: **WY Music**.
- Current shipping UI is NetEase-inspired (notably red accent around `#ec4141`); this is the **incumbent** look for refinement work.
- Binding decision for future work: a **clear visual redesign/rebrand is allowed** later; do not treat NetEase parity as a permanent identity lock. Refinement of the incumbent system remains valid until an explicit redesign brief.

## Evidence on Hand

- Runnable apps under `apps/desktop` and `apps/admin`; shared package `@wy-music/shared`.
- No fabricated testimonials, metrics, or store listings. Do not invent marketing claims.

## Product Principles

1. **Catalog control first** — self-hosted library remains the source of truth for play and ownership.
2. **Ingest as a first-class job** — multi-source find + batch import must stay fast to understand and trustworthy.
3. **Operate, don’t decorate** — desktop and admin are task surfaces; clarity and consistency beat novelty until a redesign is requested.
4. **One product, two roles** — user client and admin share the same catalog language and constraints.
5. **Honest about sources** — external results, failures, and origins stay visible; don’t hide provenance.

## Accessibility & Inclusion

No product-specific WCAG mandate recorded yet. Prefer readable contrast, keyboard-reachable primary actions, and non-color-only status cues in Operate surfaces.
