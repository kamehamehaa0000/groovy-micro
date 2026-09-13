import { client as pgClient, db } from '../src/db'
import {
  users,
  subscriptionPlans,
  planFeatureDefinitions,
  listeningHistory,
  outboxEvents,
  playlists,
  albums,
  songs,
} from '../src/db/schema'
import { sql } from 'drizzle-orm'
import { redis } from '../src/index'

async function audit() {
  console.log('🔍 Auditing Database & Redis for leftover test entities...\n')

  const testUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(sql`email LIKE '%@groovy.test%'`)

  const allUsers = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)

  const testPlans = await db
    .select({ id: subscriptionPlans.id, name: subscriptionPlans.name })
    .from(subscriptionPlans)
    .where(sql`id LIKE 'hifi_family_%'`)

  const allPlans = await db
    .select({ id: subscriptionPlans.id, name: subscriptionPlans.name })
    .from(subscriptionPlans)

  const testFeatures = await db
    .select({ key: planFeatureDefinitions.key })
    .from(planFeatureDefinitions)
    .where(sql`key LIKE 'early_access_%'`)

  const orphanHistory = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listeningHistory)
    .where(sql`user_id NOT IN (SELECT id FROM users)`)

  const testOutbox = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(outboxEvents)
    .where(
      sql`event_type LIKE '%test%' OR payload::text LIKE '%@groovy.test%'`,
    )

  const orphanPlaylists = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(playlists)
    .where(sql`owner_id NOT IN (SELECT id FROM users)`)

  // Check Redis keys
  const testRedisPresence = await redis.keys('groovy:presence:user:*')
  const testRedisPlayer = await redis.keys('groovy:player:*')

  console.log('--- USERS ---')
  console.log(`Real Users (${allUsers.length}):`, allUsers.map((u) => `${u.email} [${u.role}]`).join(', '))
  console.log(`Test Users Found: ${testUsers.length}`)

  console.log('\n--- SUBSCRIPTION PLANS ---')
  console.log(`All Plans (${allPlans.length}):`, allPlans.map((p) => `${p.id} ("${p.name}")`).join(', '))
  console.log(`Test Plans Found: ${testPlans.length}`)
  console.log(`Test Features Found: ${testFeatures.length}`)

  console.log('\n--- ORPHAN / TEST RECORDS ---')
  console.log(`Orphan Listening History: ${orphanHistory[0]?.count ?? 0}`)
  console.log(`Test Outbox Events: ${testOutbox[0]?.count ?? 0}`)
  console.log(`Orphan Playlists: ${orphanPlaylists[0]?.count ?? 0}`)

  console.log('\n--- REDIS ---')
  console.log(`Presence keys: ${testRedisPresence.length}`)
  console.log(`Player keys: ${testRedisPlayer.length}`)

  const isClean =
    testUsers.length === 0 &&
    testPlans.length === 0 &&
    testFeatures.length === 0 &&
    (orphanHistory[0]?.count ?? 0) === 0 &&
    (testOutbox[0]?.count ?? 0) === 0 &&
    (orphanPlaylists[0]?.count ?? 0) === 0

  console.log('\n----------------------------------------')
  if (isClean) {
    console.log('✅ DATABASE IS 100% CLEAN OF TEST ARTIFACTS!')
  } else {
    console.log('⚠️ DATABASE HAS UNCLEAN TEST ARTIFACTS!')
  }
  console.log('----------------------------------------\n')

  await pgClient.end()
  await redis.quit()
  process.exit(isClean ? 0 : 1)
}

audit().catch((err) => {
  console.error('Audit failed:', err)
  process.exit(1)
})
