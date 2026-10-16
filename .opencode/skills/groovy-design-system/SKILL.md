---
name: Groovy Design System
description: Use when working on the Groovy client's visual design — Tailwind tokens and the utility vocabulary, the ui/ primitives, client_test/src/index.css, or reviewing design at /dev/design. Covers the two-layer theme contract, the shadcn token set, the font-eyebrow label switch, the drift guard, and how to verify on Windows.
---

# Groovy client — design system

The client's visual language is **two-tier**: design tokens in one CSS file, then
a small set of primitives. Everything else is a call site that must consume
tokens, never raw values.

**All paths below are relative to the repository root.** The client app lives in
`client_test/`; the repo root also holds `server/`, `jam-service/`,
`media-convertion-worker/` and `docs/`.

Source of truth for the token tables: **`client_test/docs/design-system.md`**.
This skill is the working guide — how to change things, how to review, and the
traps.

---

## 1. Where things live

| Concern | File |
| --- | --- |
| Theme values (light **and** dark) | `client_test/src/index.css` → `:root` / `.dark` |
| Token → Tailwind utility mapping | `client_test/src/index.css` → `@theme inline` |
| Type / radius / elevation roles | `client_test/src/index.css` → `@theme` |
| Primitives | `client_test/src/Components/ui/*` |
| Drift guard | `client_test/scripts/check-design-tokens.mjs` |
| Review playground | `client_test/src/routes/dev.design.tsx` (route `/dev/design`) |
| Written contract | `client_test/docs/design-system.md` |

The old `theme.css` and `styles/design-variants.css` **no longer exist** — do not
reintroduce them.

## 2. The two-layer theme contract

`client_test/src/index.css` has exactly two layers:

1. **`@theme inline`** (layer 2) maps raw variables onto utilities —
   `--color-background: var(--background)` yields `bg-background`, etc.
   `inline` means each utility references the raw variable **directly**, so the
   `.dark` overrides take effect without re-declaring anything here, and **no
   `--color-*` variables are emitted at all**.
2. **`:root` / `.dark`** (layer 1) hold the actual values. This is the **only**
   place to edit when re-skinning the app.

Consequences worth remembering:

- Utilities compile to `background-color: var(--card)` — the raw var, not a
  `--color-card` var.
- `html, body` in `index.css` therefore uses `var(--background)` /
  `var(--foreground)` directly, not the `--color-*` form.
- Type/radius/elevation roles live in a plain `@theme` block (they do not change
  per theme); only colour values are theme-dependent.

## 3. Rules that actually bite

1. **Tokens are named for their role, never their hue** — `primary`, not `blue`.
   A hue name lies the moment the theme changes hue.
2. **Never reference an undefined token.** An unknown utility compiles to
   nothing and fails silently — surfaces go transparent, borders fall back to
   `currentColor`. This is the single most common cause of "the theme is
   broken".
3. Text on a filled accent surface uses `<surface>-foreground`
   (`text-primary-foreground`, `text-destructive-foreground`) — never
   `text-white`.
4. Never write `text-[10px|11px|13px]`, bare `rounded`/`rounded-xs`/`rounded-sm`,
   `shadow-2xs`, or raw `red-*`/`green-*`/`emerald-*`/`amber-*` palette classes.
   The guard flags all four.
5. New tokens belong in `index.css`; new patterns belong in a primitive.
6. `Components/ui/*` is the **only** place allowed to reach for raw values — the
   guard exempts it.

`cn()` lives in `client_test/src/Components/ui/cn.ts` and is deliberately
dependency-free (no `clsx`, no `tailwind-merge`).

## 4. Type voice and the `font-eyebrow` switch

| Role | Token | Size | Family |
| --- | --- | --- | --- |
| Display | `text-display` | 40px | Fraunces |
| Heading | `text-heading` | 20px | Inter |
| Title | `text-title` | 16px | Inter |
| Body | `text-body` | 14px | Inter |
| Caption | `text-caption` | 12px | Inter |
| Eyebrow | `text-eyebrow` | 11px · +0.05em | `font-eyebrow` |

Small-caps **label roles** (eyebrows, badges, buttons, field labels,
`SectionHeader` eyebrows) use the **`font-eyebrow`** family token, which resolves
to Inter:

```css
--font-eyebrow: var(--font-sans);  /* Inter — the default */
```

This is the **one line** that re-voices every label in the app. Point it at
`var(--font-mono)` to put all labels back on IBM Plex Mono.

`font-mono` stays for **numerals, timestamps and code** only. Note that
`font-mono` on a line that also carries `uppercase` is the legacy hand-rolled
label signature — that pairing has already been migrated to `font-eyebrow`
(~860 sites), so new code should not recreate it.

## 5. Primitives

`Button` · `IconButton` · `Card` · `Eyebrow` · `Badge` ·
`Field`/`Input`/`Textarea`/`Select` · `Sheet` · `SectionHeader` — all imported
from `client_test/src/Components/ui`.

Reach for a primitive before hand-rolling a pattern; if a pattern repeats, it
belongs in a primitive.

## 6. The playground — the review surface

`client_test/src/routes/dev.design.tsx` renders every token and primitive on one
screen, styled by the system itself. It is gated by `import.meta.env.DEV` (a
production build renders a "dev only" notice).

Sections: Type roles · Surfaces & ink · Semantic state · Dark-mode accent
candidates · Buttons · Icon buttons · Badges · Cards · Song rows (variants,
states) · Media tiles (shelf, grid, variants) · A composed section · Fields ·
Section header · Radius & elevation · Sheets (bottom sheet + centered dialog).

Two header toggles:

- **Light/Dark mode** — drives the theme store, so you can check both surfaces.
- **Eyebrow: Inter / Plex Mono** — sets `--font-eyebrow` inline on the page root
  so the label face can be A/B-ed with no rebuild.

When reviewing or debugging a design change, **use the playground rather than
hunting call sites.** It is self-contained: it needs no API data.

Dev server: `npm run dev` in `client_test` (port **5173**, `/api` proxied to
`localhost:4000`). Data-driven screens need the backend up; the playground does
not.

## 7. The drift guard

`client_test/scripts/check-design-tokens.mjs` flags off-system class usage at
call sites. **Run it with the working directory set to `client_test`** — it globs
`./src` and will throw if run from the repo root.

- `npm run lint:design` → **report mode, always exits 0.**
- `npm run lint:design -- --strict` → exits 1 on any violation.
- It exempts `src/Components/ui`.

Baseline at the time of writing — treat the number as a **trend, not a constant**,
and run the guard for the live figure (a count going **up** is the signal):

| Rule | Count | Points at |
| --- | --- | --- |
| `legacy-type-size` | 967 | `text-eyebrow` / `text-caption` / `text-body` |
| `legacy-radius` | 229 | `rounded-control` / `-inset` / `-surface` / `-full` |
| `legacy-shadow` | 142 | `shadow-raised` / `shadow-floating` |
| `raw-palette-color` | 806 | `success` / `destructive` / `warning` |
| **TOTAL** | **2144** | |

Top offenders are all routes: `studio.tsx` 376 · `vault.manage.tsx` 161 ·
`profile.tsx` 159 · `playlists.$id.tsx` 94. Phase 2 is underway — the whole
non-ui component layer is ~516 hits across ~26 files, and `common/SongRow.tsx`
is already clean.

## 8. Verify before claiming done

On Windows the `.ps1` shims are blocked, so call the binaries directly and set
the working directory to `client_test`:

```powershell
.\node_modules\.bin\tsc.exe -b      # types
.\node_modules\.bin\vite.exe build  # build (also regenerates routeTree.gen.ts)
.\node_modules\.bin\oxlint.exe      # lint
node scripts/check-design-tokens.mjs
```

(`npm run build` is `tsc -b && vite build`.) `oxlint` reports only pre-existing
`react/only-export-components` warnings.

## 9. Traps — learned the hard way

1. **Unknown utilities fail silently.** "White borders with transparent
   backgrounds everywhere" was classes and stylesheet disagreeing after a rename:
   `background-color` resolved to nothing (transparent) and `border-color` fell
   back to `currentColor` (light in dark mode → looks like a white border). When
   surfaces and borders both go see-through, suspect a token that does not exist
   and check the **built** CSS, not the source.
2. **Tailwind v4 merges selectors with identical declarations** in the minified
   build (`.bg-card,.bg-card\/30{…}`). Grepping for `.bg-card{` gives a false
   MISSING — match `\.<name>\s*[,{]` instead.
3. **`@theme inline` emits no `--color-*`.** Verify with `--background:` (raw),
   not `--color-background:`.
4. **After a mass rename or a CSS restructure, restart the dev server.** HMR can
   update the stylesheet while the JS module graph still renders the old class
   names (or the reverse), which looks exactly like a broken theme. Restarting
   Vite forces a coherent full reload — a browser refresh alone may not be
   enough.
5. **`routeTree.gen.ts` is generated** — regenerate with `vite build`; never
   hand-edit.
6. **Import casing is ~50/50** (`'../components/'` vs `'../Components/'`). Both
   work on Windows and would break case-sensitive CI.
7. **Arbitrary values can't be verified by grep.** `text-[11px]` and friends must
   be confirmed in the built CSS.
8. **After bulk file writes, verify content — not just exit codes.** A partial
   write once left a same-length corrupted line (`>` became `div              >`)
   that only `tsc` caught. Compare hashes or re-read after bulk copies.

## 10. How the system got here

Branch `feature/design-foundation` (stacked on `feature/vault-rename-mobile-ux`,
stacked on `rebuilt/groovy`). Newest first:

| Commit | What |
| --- | --- |
| `7e74a55` | **`font-eyebrow` token**; labels moved to Inter (860 sites); playground A/B toggle |
| `905d903` | **Reverted** the review variants + canonical icon set |
| `2179ea9` `f85a16b` `136d7f7` | Review variants: `data-*` hooks on primitives + `design-variants.css` |
| `65f8611` | `Sheet`: real snap bottom sheet + actually-centered dialog |
| `bdba5d9` | **Adopted the full shadcn/ui vocabulary** (~5,300 class tokens, 70 files); indigo dark accent; repaired dead tokens `bg-canvas-soft` → `muted`, `bg-panel-elevated` → `card` |
| `71e469e` | Role-based accent (`blue` → `primary`), `primary-foreground` / `destructive-foreground`, two-layer `index.css` |
| `fea4f90` | `SongRow` + `MediaTile` showcases |
| `a57d44e` | Dev-only playground at `/dev/design` |
| `1f92538` | Foundation: tokens, 8 primitives, `cn()`, drift guard (replaced `theme.css`) |

**The vocabulary is shadcn/ui's** so a palette exported for shadcn
(tweakcn.com, the shadcn registry) drops straight in. Tokens shadcn does not
define are marked *extension*: `primary-strong`, `border-soft`,
`destructive-soft`, `success`/`-soft`/`-foreground`, `warning`/`-soft`,
`scrim`, `font-eyebrow`.

Any **filled** semantic surface needs an explicit `<surface>-foreground`. A
missing foreground is a **gap to fill, not a licence to type `text-white`** —
filled success had no text colour at all until `--success-foreground` was added.
`scrim` (media dimming) still has none, so overlays sitting on a
`bg-foreground/*` veil are unresolved.

Old → current token mapping, for reading pre-rename code and old diffs:

`canvas` → `background` · `canvas-deep` → `muted` · `panel` → `card` ·
`ink` → `foreground` · `ink-soft` → `muted-foreground` · `stone` → `secondary` ·
`line` → `border` · `line-soft` → `border-soft` · `danger*` → `destructive*`

Accent values: light `#1b5fa6`; dark **indigo** `#818cf8` (`primary-strong`
`#6d78f0`). The dark lime accent was removed — too hot as a button background and
it collided with the success/warning semantics. Destructive was calmed to
`#dc2626` (light) / `#f87171` (dark).

## 11. What is still open

- **Phase 2 — call-site migration**, by leverage: `studio.tsx` →
  `vault.manage.tsx` → `profile.tsx` → `playlists.$id.tsx` → `feed.tsx` → …
- **Phase 3 — enforcement**: wire `lint:design --strict` into `lint` once the
  count reaches 0.
- The 810 `raw-palette-color` hits are a separate deferred bucket (gradients in
  `liked.tsx` / `search.tsx` / `LibraryItemCard.tsx`, `dark:text-blue-400` in
  `vault.manage.tsx`, …).
- Resolve the `components` vs `Components` import casing before any
  case-sensitive CI runs.
