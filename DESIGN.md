# Design System — WY Music (current)

Operate surfaces for a self-hosted music client. Light chrome with a single NetEase-inspired red accent. Content and tasks first; accent is functional (active, CTA, playing), not decorative fills.

## Color Palette & Roles

| Token | Value | Role |
|-------|-------|------|
| `--wy-brand` | `#ec4141` | Primary actions, active nav, progress, likes |
| `--wy-brand-hover` | `#e03535` | Hover on primary |
| `--wy-brand-soft` | `rgba(236,65,65,.08)` | Soft hover / selected wash |
| `--wy-brand-soft-strong` | `rgba(236,65,65,.14)` | Stronger wash / selection |
| `--wy-brand-tint` | `#ff8a80` | Cover / chart placeholder gradient light stop |
| `--wy-cover-gradient` | `135deg tint→brand` | Default cover / playlist placeholder fill |
| `--wy-bg` | `#ffffff` | App canvas / main |
| `--wy-sidebar` | `#f7f7f9` | Desktop sidebar |
| `--wy-surface` | `#ffffff` | Cards, panels, headers |
| `--wy-surface-muted` | `#f5f5f7` | Subtle panels, table header |
| `--wy-border` | `#ebebed` | Dividers |
| `--wy-border-strong` | `#e0e0e4` | Emphasized borders |
| `--wy-text` | `#1a1a1a` | Primary copy |
| `--wy-text-secondary` | `#5c5c66` | Supporting labels |
| `--wy-text-muted` | `#8a8a96` | Hints, meta |
| `--wy-text-on-brand` | `#ffffff` | Text on brand fills |
| `--wy-on-brand-muted` | `rgba(255,255,255,.72)` | Secondary text / icons on red topbar |
| `--wy-on-brand-soft` | `rgba(255,255,255,.88)` | Primary controls on red topbar |
| `--wy-focus-ring` | `0 0 0 2px #fff, 0 0 0 4px rgba(236,65,65,.45)` | Keyboard focus |
| `--wy-scrollbar` | `#c8c8d0` | Scrollbar thumb |
| `--wy-duration-fast` | `150ms` | Control / feedback |
| `--wy-duration` | `220ms` | Routine state change |
| `--wy-duration-slow` | `380ms` | Overlay / now-playing entrance |
| `--wy-ease` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Default easing |
| `--wy-ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Confident arrivals |
| `--wy-ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Faster exits |

Admin canvas may use a slightly cooler page bg (`#f3f4f7`) with white surfaces; same brand and text tokens.

Hover/selection washes use `--wy-brand-soft` / `--wy-brand-soft-strong` (nav, rows, tags) — not flat gray.

Shared utilities: `.wy-page` (page padding), `.wy-page-head` / `.wy-page-title` / `.wy-page-desc` (content page headers), `.wy-chip` / `.wy-chip.is-on` (filter / source pills). Admin: `.admin-page-head` / `.admin-toolbar` (same 16px section rhythm).

## Typography

Segoe UI / PingFang SC / Microsoft YaHei / system-ui. Weights 400 / 600 / 700. Compact UI sizes (12–22px). Tabular nums for admin metrics.

## Layout & Radius

- Desktop: topbar 54px, sidebar 210px, player ~68px
- Radius: `--wy-radius-sm` 6px, `--wy-radius-md` 10px, `--wy-radius-pill` for search / chips
- Soft offset shadows only (`--wy-shadow-sm`)

## Built-in themes

Themes live in `apps/desktop/src/renderer/src/themes/` and swap CSS variables on `:root` (`data-theme`). At a time **one** accent drives brand + topbar (NetEase-skin model).

| Id | Name | Notes |
|----|------|--------|
| `classic-red` | 经典红 | Default; red topbar |
| `dark` | 暗夜黑 | Dark chrome + red accent; toggles `html.dark` for Element Plus |
| `white` | 极简白 | Light topbar, red accents |
| `sky` / `forest` / `violet` / `orange` / `sakura` | 彩皮 | Light surfaces; colored topbar + brand |

Topbar tokens: `--wy-topbar`, `--wy-topbar-fg`, `--wy-topbar-control`, `--wy-topbar-control-hover`. Selection persists as `localStorage.wy-theme-id`.

## Do's and Don'ts

- Do: use CSS variables (`var(--wy-*)`) instead of raw `#ec4141` / `#999`
- Do: keep **one** active accent from the current theme; status uses Element semantic colors
- Don't: mix multiple brand accents on one screen outside theme preview
- Don't: nest cards or add decorative gradient text
- Don't: gray secondary text on colored brand/topbar surfaces — use `--wy-topbar-fg` / `--wy-on-brand-*` / `--wy-text-on-brand`
