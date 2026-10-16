# Groovy — Design System

The single source of truth for the client's visual language.

**Voice: hybrid editorial.**
Fraunces for page display, Inter for body/UI, IBM Plex Mono **only** for
eyebrow labels and numerals.

> Rule of thumb: if you are typing a raw size, radius, shadow or palette color
> into a component, you are probably about to create drift. Reach for a token
> or a primitive instead.

---

## 1. Where things live

| Concern | File |
| --- | --- |
| Tokens (color, type, radius, elevation) | `src/index.css` → `@theme` |
| Primitives | `src/Components/ui/*` |
| Guard script | `scripts/check-design-tokens.mjs` |

## 2. Type roles

| Role | Token | Size | Family | Use for |
| --- | --- | --- | --- | --- |
| Display | `text-display` | 40px | Fraunces | Page hero headings only |
| Heading | `text-heading` | 20px | Inter | Section titles |
| Title | `text-title` | 16px | Inter | Card / row titles |
| Body | `text-body` | 14px | Inter | Default text |
| Caption | `text-caption` | 12px | Inter | Secondary text, hints |
| Eyebrow | `text-eyebrow` | 11px · +0.05em | IBM Plex Mono | Uppercase labels/eyebrows |

## 3. Color roles

Surfaces/ink: `canvas`, `canvas-deep`, `panel`, `ink`, `ink-soft`, `stone`,
`blue`, `blue-deep`, `line`, `line-soft`.

Semantic state — use these instead of raw Tailwind palette colors:

| Token | Meaning |
| --- | --- |
| `success` / `success-soft` | Likes, saved, positive |
| `danger` / `danger-soft` | Delete, destructive, errors |
| `warning` / `warning-soft` | Pending, scheduled, caution |
| `scrim` | Modal/sheet backdrop |

## 4. Radius & elevation roles

Radii: `rounded-control` (buttons/inputs) · `rounded-inset` (nested) ·
`rounded-surface` (cards/sheets) · `rounded-full` (pills/avatars).

Elevation: `shadow-raised` (hover/popover) · `shadow-floating` (overlays).
Everything else is flat + bordered.

## 5. Primitives

`Button` · `IconButton` · `Card` · `Eyebrow` · `Badge` · `Field`/`Input`/
`Textarea`/`Select` · `Sheet` · `SectionHeader` — imported from
`src/Components/ui`.

## 6. Contribution rules

1. **Never** write `text-[10px|11px|13px]` — use a type role.
2. **Never** write bare `rounded` / `rounded-xs` / `rounded-sm` — use a radius role.
3. **Never** write `shadow-2xs` — use an elevation role.
4. **Never** write raw `red-*`/`green-*`/`emerald-*`/`amber-*` — use a semantic token.
5. New tokens belong in `index.css`; new patterns belong in a primitive.

Run `npm run lint:design` (report) or `npm run lint:design -- --strict` (gate).

## 7. Migration status

- [x] **Phase 1 — Foundation**: tokens + primitives + guard. No call sites changed.
- [ ] **Phase 2 — Call-site migration** (by leverage):
  `studio.tsx` → `vault.manage.tsx` → `profile.tsx` → `playlists.$id.tsx` → `feed.tsx` → …
- [ ] **Phase 3 — Enforcement**: wire `lint:design --strict` into `lint`.
