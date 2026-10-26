# Design System — WY Music (current)

Operate surfaces for a self-hosted music client. Light chrome with a single NetEase-inspired red accent. Content and tasks first; accent is functional (active, CTA, playing), not decorative fills.

## Color Palette & Roles

| Token | Value | Role |
|-------|-------|------|
| `--wy-brand` | `#ec4141` | Primary actions, active nav, progress, likes |
| `--wy-brand-hover` | `#e03535` | Hover on primary |
| `--wy-brand-soft` | `rgba(236,65,65,.08)` | Soft hover / selected wash |
| `--wy-brand-soft-strong` | `rgba(236,65,65,.14)` | Stronger wash / selection |
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
| `--wy-focus-ring` | `0 0 0 2px #fff, 0 0 0 4px rgba(236,65,65,.45)` | Keyboard focus |
| `--wy-scrollbar` | `#c8c8d0` | Scrollbar thumb |

Admin canvas may use a slightly cooler page bg (`#f3f4f7`) with white surfaces; same brand and text tokens.

Hover/selection washes use `--wy-brand-soft` / `--wy-brand-soft-strong` (nav, rows, tags) — not flat gray.

## Typography

Segoe UI / PingFang SC / Microsoft YaHei / system-ui. Weights 400 / 600 / 700. Compact UI sizes (12–22px). Tabular nums for admin metrics.

## Layout & Radius

- Desktop: topbar 54px, sidebar 210px, player ~68px
- Radius: 6–10px; pills for search / round CTAs when already used
- Soft offset shadows only (`--wy-shadow-sm`)

## Do's and Don'ts

- Do: use CSS variables (`var(--wy-*)`) instead of raw `#ec4141` / `#999`
- Do: keep one brand red; status uses Element semantic colors
- Don't: introduce a second accent (green/purple) on Operate screens
- Don't: nest cards or add decorative gradient text
- Don't: gray secondary text on colored brand surfaces — use `--wy-text-on-brand` or tinted light text
