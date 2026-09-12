#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface TestSuite {
  id: string
  name: string
  file: string
}

const ALL_SUITES: TestSuite[] = [
  {
    id: 'cache',
    name: 'Cache & Hybrid Social State',
    file: 'src/lib/cache/cache.test.ts',
  },
  {
    id: 'auth',
    name: 'Auth, RBAC & Token Security',
    file: 'src/modules/auth/auth.test.ts',
  },
  {
    id: 'artists',
    name: 'Artists & Verification Desk',
    file: 'src/modules/artists/artists.test.ts',
  },
  {
    id: 'catalog',
    name: 'Catalog & Scheduled Drops',
    file: 'src/modules/catalog/catalog.test.ts',
  },
  {
    id: 'playlists',
    name: 'Playlists & Social Collaboration',
    file: 'src/modules/playlists/playlists.test.ts',
  },
  {
    id: 'subscriptions',
    name: 'Subscriptions & Entitlements',
    file: 'src/modules/subscriptions/subscriptions.test.ts',
  },
  {
    id: 'users',
    name: 'Users & Cloud Storage',
    file: 'src/modules/users/users.test.ts',
  },
  {
    id: 'comments',
    name: 'Nested Comments & Two-Way Voting',
    file: 'src/modules/comments/comments.test.ts',
  },
]

// ANSI Escape Codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bgGreen: '\x1b[42m\x1b[30m',
  bgRed: '\x1b[41m\x1b[37m',
}

// Filter suites if user passed arguments (e.g. `bun run test auth`)
const args = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
const filter = args[0]?.toLowerCase()

const suitesToRun = filter
  ? ALL_SUITES.filter(
      (s) =>
        s.id.includes(filter) ||
        s.name.toLowerCase().includes(filter) ||
        s.file.toLowerCase().includes(filter),
    )
  : ALL_SUITES

if (suitesToRun.length === 0) {
  console.error(
    `\n${c.red}❌ No test suites matched filter: "${filter}"${c.reset}`,
  )
  console.log(`Available suites: ${ALL_SUITES.map((s) => s.id).join(', ')}\n`)
  process.exit(1)
}

console.log(
  `\n${c.bold}${c.cyan}================================================================${c.reset}`,
)
console.log(
  `${c.bold}${c.cyan}       🎵 GROOVY UNIFIED INTEGRATION TEST RUNNER 🎵${c.reset}`,
)
console.log(
  `${c.bold}${c.cyan}================================================================${c.reset}`,
)
console.log(
  `${c.dim}Running ${suitesToRun.length} test suite(s) sequentially in isolated processes...${c.reset}\n`,
)

interface Result {
  suite: TestSuite
  passed: boolean
  durationSec: number
}

const results: Result[] = []
const overallStartTime = performance.now()

for (let i = 0; i < suitesToRun.length; i++) {
  const suite = suitesToRun[i]
  const stepNumber = `[${i + 1}/${suitesToRun.length}]`

  console.log(
    `\n${c.bold}${c.yellow}▶ ${stepNumber} RUNNING: ${suite.name}${c.reset} ${c.dim}(${suite.file})${c.reset}`,
  )
  console.log(`${c.dim}${'─'.repeat(64)}${c.reset}`)

  const suiteStartTime = performance.now()

  const child = spawnSync('bun', ['run', suite.file], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test' },
    shell: process.platform === 'win32',
  })

  const durationSec = Number(
    ((performance.now() - suiteStartTime) / 1000).toFixed(2),
  )
  const passed = child.status === 0

  results.push({ suite, passed, durationSec })

  if (passed) {
    console.log(
      `\n${c.green}✔ ${stepNumber} PASSED: ${suite.name}${c.reset} ${c.dim}(${durationSec}s)${c.reset}\n`,
    )
  } else {
    console.log(
      `\n${c.red}✖ ${stepNumber} FAILED: ${suite.name}${c.reset} ${c.dim}(exit code: ${child.status}, ${durationSec}s)${c.reset}\n`,
    )
  }
}

const totalTime = ((performance.now() - overallStartTime) / 1000).toFixed(2)
const totalPassed = results.filter((r) => r.passed).length
const totalFailed = results.filter((r) => !r.passed).length

console.log(
  `\n${c.bold}${c.cyan}================================================================${c.reset}`,
)
console.log(`${c.bold}${c.cyan}📋 TEST EXECUTION SUMMARY${c.reset}`)
console.log(
  `${c.bold}${c.cyan}================================================================${c.reset}`,
)
console.log(`${c.bold}  Result     Duration  Suite Name${c.reset}`)
console.log(
  `${c.dim}  ──────────────────────────────────────────────────────────────${c.reset}`,
)

for (const res of results) {
  const badge = res.passed
    ? `${c.green}✅ PASS${c.reset}`
    : `${c.red}❌ FAIL${c.reset}`
  const duration = `${res.durationSec.toFixed(2)}s`.padStart(7, ' ')
  console.log(`  ${badge}    ${c.dim}${duration}${c.reset}   ${res.suite.name}`)
}

console.log(
  `${c.dim}  ──────────────────────────────────────────────────────────────${c.reset}`,
)
if (totalFailed === 0) {
  console.log(
    `  ${c.bgGreen} ALL SUITES PASSED ${c.reset}  Total: ${results.length} | Passed: ${totalPassed} | Time: ${totalTime}s\n`,
  )
  process.exit(0)
} else {
  console.log(
    `  ${c.bgRed} SOME SUITES FAILED ${c.reset} Total: ${results.length} | Passed: ${totalPassed} | Failed: ${totalFailed} | Time: ${totalTime}s\n`,
  )
  process.exit(1)
}
