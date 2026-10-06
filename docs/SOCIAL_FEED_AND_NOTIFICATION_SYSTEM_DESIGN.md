# Social, Feed & Notification System Architecture & Consolidation Blueprint

## 1. Executive Summary & Current State Analysis

### 1.1 Existing Route Fragmentation
Groovy's social and live community logic is currently divided across two isolated routes:

| Route | File | Responsibility & Data Handled | Limitations |
|---|---|---|---|
| **`/feed`** | `client_test/src/routes/feed.tsx` | Asynchronous timeline of published releases from followed artists, playlists created/saved by friends, and songs liked by followed users. Cursor-based pagination (`cursor`, `limit`, `filter`). | Purely historical; completely lacks real-time listening presence, follow management, or community discovery. |
| **`/activity`** | `client_test/src/routes/activity.tsx` | Live listening presence (polling `/api/v1/player/friends/activity`), incoming follow requests (accept/reject), and user directory search. | Disconnected from the feed; 10s client polling timer; omitted from the mobile bottom navigation bar (`MobileBottomBar.tsx`), making follow requests invisible to mobile users. |

### 1.2 Backend & Data Layer Baseline
- **Database Schema**: `server/src/db/schema/social.ts` defines `user_follows` (with `status: 'PENDING' | 'ACCEPTED'`), `song_likes`, and `album_likes`.
- **Feed Aggregation**: `server/src/modules/social/social.service.ts` queries releases, playlists, saves, and likes, sorts chronologically descending, and caches in Redis for 45 seconds (`cacheKeys.social.feed(...)`).
- **Live Playback Presence**: `server/src/modules/player/player.service.ts` stores active playback states in Redis presence keys (`presence:user:{userId}`).
- **Notifications**: No notification tables, queues, or UI exist in the project today. Follow requests, comment replies, and new releases exist in silence with zero user alerts.

---

## 2. Consolidating Social & Feed into a Single Unified Experience

Rather than forcing users to jump between `/feed` (for past updates) and `/activity` (for live friends and follow requests), we consolidate them into a unified **Community Hub** at `/feed` (with a permanent redirect from `/activity`).

### 2.1 Desktop Layout Architecture (2-Column Editorial View)
```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Top Navigation Header: Catalog | Artists | Playlists | Library | Feed [● 2]  [🔔 (3)] [Profile] │
├───────────────────────────────────────────────────────────────────┬─────────────────────────────┤
│ MAIN COLUMN (~65% width)                                          │ RIGHT STICKY DOCK (~35%)    │
│                                                                   │                             │
│ 1. Header & Quick Filter Pills:                                   │ 1. Pending Follow Requests  │
│    [ALL]  [RELEASES]  [PLAYLISTS]  [FRIENDS]  [LIVE NOW]          │    ┌──────────────────────┐ │
│                                                                   │    │ @alex asked to follow│ │
│ 2. Feed Stream (Chronological & Infinite Scroll):                 │    │ [Accept]   [Decline] │ │
│    ┌────────────────────────────────────────────────────────┐     │    └──────────────────────┘ │
│    │ ✦ Artist Release Card                                  │     │                             │
│    │   Echoes of Sound released new LP "Midnight Bloom"     │     │ 2. Live Friend Activity     │
│    │   [Cover] "Track Title" · 3:42                         │     │    (Listening pulse & wave) │
│    │   [▶ Play] [Queue] [♡ Like] [💬 Discuss]              │     │    ┌──────────────────────┐ │
│    ├────────────────────────────────────────────────────────┤     │    │ @sarah (Listening)   │ │
│    │ ♫ Friend Curation Card                                 │     │    │ "Solaris" · 1:24/4:10│ │
│    │   @marcus created playlist "Downtempo Haven" (24 cuts) │     │    │ [▶ Listen Along]     │ │
│    │   [▶ Stream] [＋ Save to Vault]                         │     │    └──────────────────────┘ │
│    ├────────────────────────────────────────────────────────┤     │                             │
│    │ ♡ Friend Like Card                                     │     │ 3. Discover Listeners       │
│    │   @elena liked "Neon Dreams"                           │     │    Search bar + suggested   │
│    │   [▶ Play] [Comment]                                   │     │    creators with [Follow]   │
│    └────────────────────────────────────────────────────────┘     │                             │
└───────────────────────────────────────────────────────────────────┴─────────────────────────────┘
```

### 2.2 Mobile Responsive Strategy
On mobile devices (`< md`):
1. **Pill-Based Viewport Switcher**: A sticky tab bar below the top header:
   `[ Activity Stream ]` `[ Live Friends (3) ]` `[ Network & Requests (1) ]`
2. **Badge Indicator**: If incoming follow requests or unread mentions exist, the tab receives a subtle indicator dot (`bg-blue ring-2 ring-canvas`).
3. **Bottom Navigation Integration**: Add a dedicated **Feed** item to `MobileBottomBar.tsx` with a real-time request badge.

### 2.3 Styling & Design Language Alignment
- **Pills**: Match the `/artists` pill pattern:
  `font-mono text-[10.5px] rounded-md uppercase tracking-[0.14em] px-3.5 py-1.5 transition-all cursor-pointer` (`bg-ink text-canvas font-semibold shadow-xs` when active, `bg-panel text-ink-soft hover:text-ink border border-line` when inactive).
- **Search Bar**: Match the standard search bar:
  `w-full font-mono text-xs py-2.5 pl-9 pr-9 border border-line bg-panel rounded-xl text-ink placeholder:text-ink-soft/60 focus:outline-none focus:border-ink/70 transition-all shadow-2xs`.
- **Card Aesthetics**: Editorial microservice cards with `bg-panel border border-line rounded-2xl p-4 sm:p-5 hover:border-ink/30 transition-all shadow-2xs`.

---

## 3. High-Performance Notification System Architecture

### 3.1 Where Notifications Are Needed Across Groovy

| Domain | Event Trigger | Recipient | Action Payload / Deep Link | Priority |
|---|---|---|---|---|
| **Social** | User requests to follow private account | Account Owner | Accept / Decline buttons | High |
| **Social** | Follow request accepted | Follower | Profile deep link | Medium |
| **Social** | New follower (public account) | Followed User | Profile deep link | Low |
| **Comments** | Reply to user's comment (`parentId`) | Parent Comment Author | Jump to track/album/playlist + comment thread | High |
| **Comments** | Quote / Mention (`replyToUserId`) | Quoted User | Jump to thread | High |
| **Comments** | New comment on user's public playlist | Playlist Owner | Jump to playlist comment section | Medium |
| **Jam Sessions** | Friend invites user to live Jam room | Invitee | Immediate **"Join Jam"** CTA | Critical (Real-time) |
| **Catalog** | Followed artist publishes new Album/EP/Single | All Artist Followers | Album details route (`/albums/:slug`) | High |
| **Vault** | Media conversion completed / failed | Uploader | Route to `/collection` or display error | Medium |
| **Account** | Subscription tier renewal / change | User | Route to `/profile` | Medium |

---

### 3.2 Database Schema Design

#### `notifications` table (`server/src/db/schema/notifications.ts`):
```typescript
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const notificationTypeEnum = pgEnum("notification_type", [
  "FOLLOW_REQUEST",
  "FOLLOW_ACCEPTED",
  "NEW_FOLLOWER",
  "COMMENT_REPLY",
  "COMMENT_MENTION",
  "PLAYLIST_COMMENT",
  "ARTIST_RELEASE",
  "JAM_INVITE",
  "TRANSCODE_COMPLETE",
  "TRANSCODE_FAILED",
  "SYSTEM_ALERT",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: notificationTypeEnum("type").notNull(),
    entityType: text("entity_type").notNull(), // 'album' | 'song' | 'playlist' | 'comment' | 'user' | 'jam'
    entityId: text("entity_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    metadata: jsonb("metadata").$type<{
      slug?: string;
      avatarUrl?: string;
      coverImageUrl?: string;
      jamCode?: string;
      commentId?: string;
    }>(),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_notifications_recipient_unread").on(
      table.recipientId,
      table.isRead,
      table.createdAt
    ),
    index("idx_notifications_recipient_created").on(
      table.recipientId,
      table.createdAt
    ),
  ]
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    emailReleases: boolean("email_releases").notNull().default(true),
    emailComments: boolean("email_comments").notNull().default(true),
    pushSocial: boolean("push_social").notNull().default(true),
    pushJams: boolean("push_jams").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  }
);
```

---

### 3.3 Performance & High-Efficiency Pipeline

```
  [EVENT PRODUCER]                   [NOTIFICATION SERVICE]                  [FRONTEND]
  (Comments, Social, Jam, Transcode)
         │
         ├─── Direct (1-to-1) ──────────► DB Insert (Single row)
         │                                       │
         │                                       ├──► Redis INCR notifications:unread:{userId}
         │                                       │
         │                                       └──► Redis PUBLISH notifications:stream:{userId}
         │                                                  │
         │                                                  └──► SSE Stream (/api/v1/notifications/stream)
         │                                                             │
         │                                                             ▼
         └─── Fan-out (1-to-Many: e.g. Artist Release)          [In-App Bell Badge & Toast]
                 │
                 ▼
         Postgres Outbox Table
                 │
                 ▼
         Outbox Relay / BullMQ Worker (Batches of 500)
                 │
                 └──► Bulk DB Insert + Redis Pipeline
```

#### Why this architecture guarantees high performance:
1. **$O(1)$ Header Load**: The frontend fetches the unread count via Redis `GET notifications:unread:{userId}` in `< 1ms`. Postgres is never hit just to render the bell badge in the navigation header.
2. **Server-Sent Events (SSE) for Real-Time Delivery**: Rather than heavy WebSockets, notifications are unidirectional. SSE (`/api/v1/notifications/stream`) leverages native browser `EventSource` with auto-reconnection, minimal overhead, and full HTTP/2 multiplexing.
3. **Outbox Batching for Artist Releases**: When an artist with 25,000 followers drops an album, inserting 25,000 notification rows synchronously in the publish API would timeout the HTTP request. Instead:
   - The publish transaction writes **1 event** to `outbox_events`.
   - The worker (`outbox.relay.ts`) processes it in 500-recipient batch chunks in the background without affecting API latency.
4. **Instant Action Capability**:
   - Marking all as read: Single query `UPDATE notifications SET is_read = true WHERE recipient_id = $1 AND is_read = false;` + Redis `DEL notifications:unread:{userId}`.

---

### 3.4 Frontend UI & Notification Experience

1. **Top Header Notification Bell** (`client_test/src/routes/__root.tsx`):
   - Placed beside the user profile avatar on desktop and in the top-right header on mobile.
   - Bell icon with pill badge: `[🔔 (3)]`.
2. **Flyout Drawer / Popover (`NotificationDrawer.tsx`)**:
   - **Header**: "Notifications" + "Mark all as read" button.
   - **Filter Pills**: `[ALL]` `[MENTIONS & REPLIES]` `[SOCIAL]` `[SYSTEM]`.
   - **Card Elements**:
     - Actor avatar + relative timestamp (`formatRelativeTime`).
     - Rich context snippet (e.g. quoted text of the comment or album art).
     - **Inline Action Buttons**:
       - For `FOLLOW_REQUEST`: `[Accept]` and `[Dismiss]` inline without leaving current page.
       - For `JAM_INVITE`: Pulsing green `[Join Live Jam]` button.
       - For `ARTIST_RELEASE`: `[▶ Play Now]`.
3. **Floating In-App Toasts**:
   - High-priority real-time events (incoming Jam invites or accepted follow requests) trigger a non-blocking toast at the top-right or bottom-center.

---

## 4. Phased Implementation Roadmap

- **Phase 1: Database & Backend Notification Core**
  - Database schema (`notifications`, `notification_preferences`, enums, indices).
  - Backend notification service (`create`, `bulkCreate`, `getNotifications`, `markAsRead`, `markAllAsRead`, `getUnreadCount`).
  - Notification routes (`GET /`, `PATCH /:id/read`, `POST /read-all`, `GET /unread-count`, `GET /stream` SSE).
  - Registration in `server/src/index.ts`.

- **Phase 2: Event Dispatches Across Subsystems**
  - Social events (follow requests, acceptances, new followers).
  - Comment events (replies, mentions, playlist comments).
  - Jam events (room invite).
  - Catalog release outbox relay fan-out.
  - Transcoder completion/failure hooks.

- **Phase 3: Social & Feed Route Consolidation**
  - Unified `/feed` page with 2-column desktop layout (feed stream + live listening & follow requests dock).
  - Mobile responsive tab bar and bottom bar integration.
  - `/activity` deprecation with clean redirect to `/feed`.
  - Header navigation unification.

- **Phase 4: Frontend Notification UI**
  - `notifications.api.ts` & `notifications.store.ts` (SSE connection, unread count).
  - `NotificationBell.tsx` in desktop & mobile headers.
  - `NotificationDrawer.tsx` popover with filtering and action buttons.
  - Granular notification preferences in `/profile`.
