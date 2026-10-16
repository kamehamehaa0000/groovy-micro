# Groovy — Design System

The single source of truth for the client's visual language.

**Voice: hybrid editorial.**
Fraunces for page display, Inter for body/UI, IBM Plex Mono for numerals and
code. Small-caps label roles (eyebrows, badges, buttons, field labels) use the
`font-eyebrow` token — Inter by default; flip it in one line to re-voice every
label in the app.

> Rule of thumb: if you are typing a raw size, radius, shadow or palette color
> into a component, you are probably about to create drift. Reach for a token
> or a primitive instead.

---

## 1. Where things live

| Concern | File |
| --- | --- |
| Theme values (light **and** dark) | `src/index.css` → `:root` / `.dark` |
| Token → Tailwind utility mapping | `src/index.css` → `@theme inline` |
| Type / radius / elevation tokens | `src/index.css` → `@theme` |
| Primitives | `src/Components/ui/*` |
| Guard script | `scripts/check-design-tokens.mjs` |

**Re-skinning the app means editing one block.** Colours live only in `:root`
(light) and `.dark` (dark); the `@theme inline` block just publishes them as
Tailwind utilities. Change the values, and every component follows.

The vocabulary is **shadcn/ui's**, so a palette exported for shadcn
(tweakcn.com, the shadcn registry, …) drops straight in. Tokens shadcn does not
define are marked *extension*.

## 2. Type roles

| Role | Token | Size | Family | Use for |
| --- | --- | --- | --- | --- |
| Display | `text-display` | 40px | Fraunces | Page hero headings only |
| Heading | `text-heading` | 20px | Inter | Section titles |
| Title | `text-title` | 16px | Inter | Card / row titles |
| Body | `text-body` | 14px | Inter | Default text |
| Caption | `text-caption` | 12px | Inter | Secondary text, hints |
| Eyebrow | `text-eyebrow` | 11px · +0.05em | `font-eyebrow` | Uppercase labels/eyebrows |

`font-eyebrow` is a **family role**, not a size: it resolves to Inter by default
and is the one place to change the face of every label. `font-mono` stays for
numerals, timestamps and code.

## 3. Color roles

| Token | Role |
| --- | --- |
| `background` / `foreground` | Page base surface + primary text |
| `card` / `card-foreground` | Raised surfaces (cards, rows) |
| `popover` / `popover-foreground` | Floating surfaces (menus, popovers) |
| `primary` / `primary-strong` / `primary-foreground` | Brand accent · pressed/hover · text on it |
| `secondary` / `secondary-foreground` | Neutral fill (chips, avatars, skeletons) |
| `muted` / `muted-foreground` | Recessed surface · secondary text |
| `accent` / `accent-foreground` | Subtle hover / selected surface |
| `destructive` / `destructive-soft` / `destructive-foreground` | Delete, errors |
| `border` · `border-soft` *(extension)* | Default border · faint divider |
| `input` · `ring` | Form border · focus ring |
| `success` / `success-soft` *(extension)* | Likes, saved, positive |
| `warning` / `warning-soft` *(extension)* | Pending, scheduled, caution |
| `scrim` *(extension)* | Modal / sheet backdrop |

Tokens are named for their **role, never their hue** (`primary`, not `blue`) —
a hue name lies the moment the theme changes hue.

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
5. Text on a filled accent surface uses `text-primary-foreground` (or
   `text-destructive-foreground`), never hard-coded `text-white`.
6. **Never** reference a token that is not defined here — an unknown utility
   compiles to nothing and fails silently.
7. New tokens belong in `index.css`; new patterns belong in a primitive.

Run `npm run lint:design` (report) or `npm run lint:design -- --strict` (gate).

## 7. Migration status

- [x] **Phase 1 — Foundation**: tokens + primitives + guard.
- [x] **Phase 1.5 — Vocabulary**: adopted the shadcn/ui token set and
  restructured `index.css` into the two-layer contract (`:root` / `.dark` →
  `@theme inline`). Renamed ~5,300 class tokens; repaired `canvas-soft` /
  `panel-elevated`, which referenced tokens that were never defined (no-ops).
- [ ] **Phase 2 — Call-site migration** (by leverage):
  `studio.tsx` → `vault.manage.tsx` → `profile.tsx` → `playlists.$id.tsx` → `feed.tsx` → …
- [ ] **Phase 3 — Enforcement**: wire `lint:design --strict` into `lint`.
