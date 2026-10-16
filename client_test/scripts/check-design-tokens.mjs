#!/usr/bin/env node
/**
 * Design-token guard.
 *
 * Flags off-system class usage at call sites so the design language cannot
 * drift again. The primitives in `src/Components/ui/` are exempt — they are the
 * only place allowed to reach for raw values.
 *
 * Default: REPORT mode (always exits 0), so it can run before the call-site
 * migration is finished. Pass `--strict` to fail on violations, then wire that
 * into the `lint` script once Phase 2 (call-site migration) is complete.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SRC = join(process.cwd(), 'src')
const EXEMPT = join('Components', 'ui')
const STRICT = process.argv.includes('--strict')

const RULES = [
  {
    id: 'legacy-type-size',
    re: /text-\[(?:10|11|13)px\]/g,
    hint: 'text-eyebrow / text-caption / text-body',
  },
  {
    id: 'legacy-radius',
    re: /(?<![\w-])rounded(?:-(?:xs|sm))?(?![\w-])/g,
    hint: 'rounded-control / rounded-inset / rounded-surface / rounded-full',
  },
  {
    id: 'legacy-shadow',
    re: /(?<![\w-])shadow-2xs(?![\w-])/g,
    hint: 'shadow-raised / shadow-floating',
  },
  {
    id: 'raw-palette-color',
    re: /(?<![\w-])(?:text|bg|border|ring|fill|stroke|from|via|to)-(?:red|green|emerald|amber|yellow|zinc|slate|gray|neutral)-\d{2,3}(?:\/\d+)?/g,
    hint: 'success / destructive / warning semantic tokens',
  },
]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (full.includes(EXEMPT)) continue
      walk(full, out)
    } else if (/\.(tsx|ts)$/.test(entry) && !entry.endsWith('.d.ts')) {
      out.push(full)
    }
  }
  return out
}

const files = walk(SRC)
const perRule = new Map(RULES.map((r) => [r.id, 0]))
const perFile = new Map()
let total = 0

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  let fileCount = 0
  for (const rule of RULES) {
    const matches = text.match(rule.re)
    if (matches) {
      perRule.set(rule.id, perRule.get(rule.id) + matches.length)
      fileCount += matches.length
    }
  }
  if (fileCount > 0) perFile.set(relative(process.cwd(), file), fileCount)
  total += fileCount
}

const sorted = [...perFile.entries()].sort((a, b) => b[1] - a[1])

console.log('— design-token guard ——————————————————————')
for (const rule of RULES) {
  console.log(
    `  ${rule.id.padEnd(18)} ${String(perRule.get(rule.id)).padStart(5)}   (${rule.hint})`,
  )
}
console.log(`  ${'TOTAL'.padEnd(18)} ${String(total).padStart(5)}`)
if (sorted.length) {
  console.log('\n  top offenders:')
  for (const [file, count] of sorted.slice(0, 10)) {
    console.log(`    ${String(count).padStart(5)}  ${file.split(sep).join('/')}`)
  }
}
console.log(
  STRICT
    ? `\n${total === 0 ? '✓ clean' : `✗ ${total} off-system class(es)`}\n`
    : '\n(report mode — run with --strict to fail)\n',
)

process.exit(STRICT && total > 0 ? 1 : 0)
