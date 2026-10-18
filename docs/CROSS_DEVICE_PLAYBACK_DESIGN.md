# Groovy Streaming — Cross-Device Playback (Groovy Connect) Design

This document defines the complete cross-device playback model for the **Groovy Streaming Platform**: the transfer, remote-control and independent-playback rules, the data shapes, the real-time protocol, and the migration path from the current single-active-device implementation.

It supersedes the "Cross-Device Redis Snapshot Synchronization" and "Option A soft pause / takeover" notes in `AUDIO_PLAYER_QUEUE_AND_SOCIAL_ROADMAP.md`.

---

## 1. The Model In One Sentence

> **One account = one Listen Session. A session has one Speaker (makes sound) and any number of Remotes (can steer it).**

- **Speaker** — the single device (tab) whose speakers are actually producing audio.
- **Remote** — a signed-in device that can send transport commands to the session but makes no sound itself.
- **Scenario A — Transfer playback** = move the Speaker.
- **Scenario B — Remote control** = be a Remote.
- **Scenario C — Independent playback** = deliberately break the one-session rule (opt-in, not built in v1).

To the user these are one feature: a **Devices** panel in the player.

---

## 2. Product Decisions (Locked)

| Decision | Choice |
| :--- | :--- |
| Default concurrency | **One stream per account** (Spotify model). A second play moves the session or is refused — never silently doubles. |
| Realtime transport | **SSE on the main server**, reusing the `notifications` Redis Pub/Sub → `text/event-stream` → `EventSource` pattern. `jam-service` stays dedicated to Live Jam. |
| Gating | **Free tier gets the whole experience**: 1 stream, transfer, remote control, device list. Independent mode, if ever built, is paid. |
| Transfer direction | Both **"Play here"** (pull) and **"Play on {device}"** (push) from the Devices panel. |
| Two tabs, one browser | **One row per browser.** Identity = `deviceId` (browser, `localStorage`) + `instanceId` (tab, in memory). The Speaker role is per-tab. |
| Second device opens | It **loads the actual track** as a Remote (artwork + live progress bar), with play/pause driving the Speaker. |
| Push transfer + autoplay | **Confirm-then-move.** The old Speaker goes silent, the target shows "Tap to play here" if its audio is not yet unlocked, and the role moves only once the target confirms playback. |

---

## 3. Core Engineering Principles

1. **The server stamps the position, never the client.** Cross-device clock skew is unbounded, so the Speaker reports `positionMs` and the **server** attaches `positionUpdatedAt` from its own clock (the same anchor idea Live Jam already uses). Remotes interpolate from that stamp.
2. **Split public presence from private device liveness.** `groovy:presence:user:{id}` remains the privacy-gated *friends activity* key that dies on pause. A new, private `groovy:player:online:{userId}` tracks *my own* reachable devices and does not die on pause. Conflating them today is why a paused device disappears.
3. **The Speaker owns the queue; the server owns "who and where."** Shuffle/repeat/queue ordering already lives in `client_test/src/stores/player.store.ts`. The server must not re-implement it: it stores who the Speaker is and where the needle is, and *relays* queue-mutating commands to the Speaker.
4. **A transfer is a handshake, not fire-and-forget**, because browsers block autoplay without a user gesture.
5. **Every state change bumps a `revision`.** Commands and transfers carry `expectedRevision`; a mismatch is a friendly `409 STALE_STATE`, never a corruption.
6. **The server is the source of truth for who the Speaker is.** A client's own ping can never promote it.

---

## 4. Redis Key Topology

```text
groovy:player:session:{userId}     JSON   (small, hot — rewritten on every change)
groovy:player:queue:{userId}       JSON   (big, cold — rewritten only when the queue changes)
groovy:player:online:{userId}      ZSET   member "deviceId|instanceId", score lastSeenAtMs
groovy:player:devices:{userId}     HASH   deviceId -> { name, customName?, platform, firstSeenAt, lastSeenAt }
groovy:player:transfer:{userId}    JSON   in-flight transfer, TTL 30s
groovy:player:events:{userId}      PUBSUB fan-out for SSE
groovy:presence:user:{userId}      JSON   UNCHANGED — friends activity only, TTL 45s
groovy:player:state:{userId}       JSON   LEGACY — read-only fallback for hydration
```

### 4.1 Session (hot)

```ts
interface PlayerSession {
  userId: string;
  revision: number;
  speaker: {
    deviceId: string;
    instanceId: string;
    deviceName: string;
    confirmed: boolean;       // did the target actually start?
    lastSeenAt: number;       // ms epoch (server clock)
  } | null;
  playback: {
    track: PlayerTrack | null;
    positionMs: number;
    positionUpdatedAt: number; // ms epoch, SERVER clock
    isPlaying: boolean;
    durationMs: number;
  };
  context: {
    uri: string | null;
    title: string | null;
    index: number;
    shuffle: boolean;
    repeat: "off" | "all" | "one";
  };
  updatedAt: number;
}
```

Why the queue is **not** in here: a 10-second position tick must be a tiny write. Bundling a 500-track context queue with a position tick is waste. The queue is written only on user actions and gets its own `revision`.

### 4.2 Online set (liveness)

`groovy:player:online:{userId}` is a **sorted set**: member `"deviceId|instanceId"`, score = `lastSeenAtMs`.

- Online = `score > now − 90s`.
- Prune = one `ZREMRANGEBYSCORE key -inf (now − 30d)`.
- **Background-tab fix:** while a browser's SSE connection is open, the **server** refreshes that member's score every 30s on its own. Chrome throttles a background tab's `setInterval`, but not an open SSE connection — so a backgrounded Speaker is never wrongly evicted. This is principle 6 made concrete.

### 4.3 Device registry

`groovy:player:devices:{userId}` is a hash (no TTL) so device names survive restarts and reboots. Entries older than 30 days are pruned on read. It is the source for the Devices panel and for "Forget this device".

---

## 5. Rules

### 5.1 Scenario A — Transfer playback

| # | Rule |
| :--- | :--- |
| A1 | Every signed-in device can open the **Devices** panel. A device is **online** if seen within 90s or holding an open SSE connection; otherwise it is greyed out. |
| A2 | **Only an explicit user action moves the Speaker**: **"Play here"** or **"Play on {device}"**. Routine pings never move it. Tapping a song row is not a move: on a Remote it plays that song on the **existing** Speaker (rule B7). |
| A3 | A transfer resumes at the **live position** = `positionMs + (serverNow − positionUpdatedAt)` when playing. Never a stale snapshot position. |
| A4 | The old Speaker **stops within ~1s** via an SSE `SPEAKER_LOST` event, shows "**Playback moved to {device}**", and becomes a Remote. It does not wait for its next ping. |
| A5 | The **queue, context, position, shuffle and repeat travel** with the session. **Volume and mute never travel** — they are device-local. |
| A6 | Transferring to an **offline** device is refused: "{device} isn't available right now." A future enhancement may store a 2-minute "transfer intent" for reconnect. |
| A7 | If the session is **paused**, "Play here" only moves the Speaker pointer; nothing plays until play is pressed. |
| A8 | Transfers are idempotent (keyed by `transferId`); a double tap moves the Speaker once. |
| A9 | A **push** transfer does **not** move the Speaker until the target confirms it started. Until then the old Speaker stays silent and the target shows "Tap to play here". |
| A10 | Each tab remembers whether audio has been **unlocked** (a previous successful `play()` in that tab). An unlocked target plays a push immediately with no prompt. |

### 5.2 Scenario B — Remote control

| # | Rule |
| :--- | :--- |
| B1 | While this device is **not** the Speaker, every transport action (play, pause, next, previous, seek, volume, add to queue, repeat/shuffle, play album) is sent as a **command to the session**, not executed locally. |
| B2 | A Remote **plays no audio**. It shows "**Controlling playback on {device}**" and its progress bar ticks locally from the server anchor — no polling. |
| B3 | Commands target **< 300 ms**. Push first, HTTP fallback, then a quiet "Can't reach {device}". |
| B4 | **Many Remotes, one Speaker.** All Remotes converge within ~1s. |
| B5 | A Remote may set the **Speaker's volume**, but volume is never *copied* between devices. |
| B6 | If the **Speaker goes offline**, the session freezes at its last position and every Remote offers "{device} is offline — **Play here instead**?". |
| B7 | **The rule that makes it feel like Spotify:** on a Remote the **play/pause button drives the session**, and **tapping a song plays it on the session's Speaker** — the Remote sends the tapped track *and the context it was tapped inside*, so the Speaker adopts both and NEXT/PREVIOUS follow the new context. The one exception is a Speaker that cannot be reached: the tap then falls back to a pull transfer so it still ends in sound rather than a dead button. |
| B8 | Telemetry (**play counts, listening history**) is reported by the **Speaker only**, because only it produces audio. |
| B9 | While in a **Live Jam**, Connect is suspended **on the device that is in the jam**: it may not "Play here", may not push playback away and may not accept a push. A jam is a room, not an account mode — it has its own service and channel, and Connect deliberately does not model it (§9.6). Leaving the jam restores the solo session where it left off. |
| B10 | A Remote may **pre-warm** its audio element on first interaction so a later "Play here" is instant. |

### 5.3 Scenario C — Independent simultaneous playback

| # | Rule |
| :--- | :--- |
| C1 | Two devices, two songs, both press play → **the second explicit play wins**. The first fades out and receives "**Playback moved to {device}**" with a "**Keep playing here instead**" action. Never an error dialog, never double audio. |
| C2 | Same song on two devices → same as C1: one Speaker, the other becomes a Remote showing that track (no sample-accurate sync outside a jam). |
| C3 | Independent mode is **not built in v1**. If it ships later it is a labelled paid toggle ("Play on this device too") with its own per-device snapshot key, its own queue, no position sync, and Jam tears it down. |
| C4 | Until built, the system degrades exactly per **C1** — never fails loudly, never doubles playback. |

### 5.4 Always-on rules

| # | Rule |
| :--- | :--- |
| R1 | **One place to look:** the **Devices** panel — desktop player bar and mobile full player. This is the fix for "Play here doesn't show on phone". |
| R2 | **Volume and mute are device-local, always.** Removed from the synced session; never copied on transfer. |
| R3 | **Device presence has its own heartbeat (every 30s)**, whether playing or paused, so paused devices stay listed. |
| R4 | The Speaker announces state on every user action **and every 10s while playing**, so Remotes stay accurate. |
| R5 | **Never silently double-play.** A second play either moves the session or is refused with a clear message. |
| R6 | **Resume stays paused, but never lies.** If another device is playing, a freshly opened device says "**Playing on {device}**" and loads the track as a Remote instead of looking idle. |
| R7 | **Closing a tab gives up the Speaker role immediately** (`navigator.sendBeacon`), not after a TTL. |
| R8 | **The server is the source of truth for the Speaker**, not the client's own ping. |
| R9 | **Anti-abuse:** cap registered devices per account (10) and keep free tier at 1 concurrent stream. |
| R10 | **One row per browser** in the panel; the Speaker role is per-tab. A second tab of the same browser is a Remote of "this browser" and can never play audio simultaneously. |

### 5.5 User-facing copy

| Moment | Copy |
| :--- | :--- |
| Panel title / entry | **Devices** |
| This device, playing | **Playing here** |
| Another device playing | **Playing on {device}** |
| Remote mode | **Controlling playback on {device}** |
| Suggested action | **Play here** |
| Push target awaiting gesture | **Tap to play here** |
| After a transfer | **Playback moved to {device}** |
| Speaker lost | **{device} is offline** → **Play here instead** |
| Conflict loser | **Playback moved to {device}** → **Keep playing here instead** |

---

## 6. Real-Time Protocol

### 6.1 Transport split

- **Server → client: SSE.** `GET /api/v1/player/session/events`. One stream per tab. Auth via `?token=` (identical to `notifications/stream`). Auto-reconnects.
- **Client → server: HTTP.** Every action is a POST. Auth, `expectedRevision` checks and auditability all live on the request, and a dead SSE connection degrades to "commands still work, just slower" rather than "remote control is broken".

### 6.2 Events (server → client)

All events travel as unnamed `data:` frames carrying a `{ type, ... }` object — the same shape the notifications stream uses. A ❌ marks an event that belongs to a later step.

| Event | Target | Payload | Status |
| :--- | :--- | :--- | :--- |
| `hello` | on connect | `{ session, devices, yourInstanceId, serverTime }` — viewer-scoped, so it can carry `youAreSpeaker`. **Is** the resync: a reconnect replaces state rather than repairing gaps | ✅ |
| `SESSION_STATE` | all | Canonical session + `{ livePositionMs, speakerOnline, serverTime }`, viewer-independent. Published only on a **logical** change, never on routine liveness | ✅ |
| `POSITION` | Remotes + the Speaker's other tabs | `{ positionMs, positionUpdatedAt, isPlaying, revision }` — small, because it is the high-frequency event | ✅ |
| `SPEAKER_LOST` | old Speaker | `{ deviceId, instanceId, newSpeaker }` — the ids name the **losing** device, since one channel serves the whole account | ✅ |
| `DEVICES_CHANGED` | all | `{ devices }` — published when the online set flips, not on every ping | ✅ |
| `COMMAND` | Speaker only | `{ deviceId, instanceId, commandId, command, payload }` — the ids name the **target**, since one channel serves the whole account; every other client ignores it | ✅ |
| `SPEAKER_GRANTED` | new Speaker | `{ deviceId, instanceId, track, positionMs, positionUpdatedAt, isPlaying }` — the ids name the **granted** device; an *action*, not a state to reconcile, because that device was faded out a moment ago | ✅ |
| `TRANSFER_OFFER` | transfer target | `{ deviceId, instanceId, transferId, track, positionMs, positionUpdatedAt, isPlaying, expiresAt, needsGesture, fromDeviceName }` — the ids name the **target** | ✅ |
| `TRANSFER_RESULT` | requester | `{ deviceId, instanceId, transferId, ok, reason?, speaker, target }` — the ids name the **requester** | ✅ |
| `QUEUE_CHANGED` | all | `{ revision }` — client refetches the queue | ❌ deferred (queue edits ride `SESSION_STATE` today) |
| ~~`PLAYBACK_MOVED`~~ | ~~conflict loser~~ | **Retired.** A conflict loser stands down through the same single path as a deliberate push (`SPEAKER_LOST` → the one stand-down funnel), and the "Keep playing here instead" affordance rides that. A second event type would have carried identical payload and identical copy | ❌ retired in step 5 |
| `: ping` | all | SSE comment every 25s | ✅ |

The shipped set already removes the polling delay for transfers and device changes. Where §9.3 says "one channel, viewer-independent", this is why: one publish serves every device and each client decides whether the Speaker is *it* — so there is no per-device fan-out to get wrong.

### 6.3 Endpoints

```text
GET    /api/v1/player/state              legacy snapshot read (kept during migration)
PUT    /api/v1/player/state              full snapshot write (NO volume/mute)
GET    /api/v1/player/session            current session + live position + device list (session may be null)
POST   /api/v1/player/devices/register   on app open -> { session, devices }
POST   /api/v1/player/presence           every 30s -> refresh private liveness
GET    /api/v1/player/devices            device list + which is Speaker + online state
DELETE /api/v1/player/devices/:deviceId  forget a device
POST   /api/v1/player/heartbeat          playback liveness (existing, slimmed)
POST   /api/v1/player/session/position   the 10s position tick; when rejected it returns the new Speaker
POST   /api/v1/player/session/transfer   { deviceId, instanceId, transferId, targetDeviceId, expectedRevision? } — push only, see below
POST   /api/v1/player/session/transfer/confirm  { deviceId, instanceId, transferId, ok, positionMs?, isPlaying? }
POST   /api/v1/player/session/command    { deviceId, instanceId, commandId, type, payload }
POST   /api/v1/player/session/speaker/leave     sendBeacon on unload
GET    /api/v1/player/session/events     SSE stream
```

**Shipped:** `/state`, `/session`, `/devices/register`, `/presence`, `/devices`, `DELETE /devices/:deviceId`, `/heartbeat`, `/session/position`, `/session/speaker/leave` (steps 1–2), `/session/events` (step 3), `/session/command` (step 4) and both `transfer*` endpoints (step 5).

**`/session/transfer` is push-only.** The original sketch carried `mode: PULL|PUSH`, but a pull has no handshake to perform: the tab that taps *is* the target, so the tap is simultaneously the gesture and the consent, and `POST /heartbeat { takeover: true }` already claims the role in one hop. Routing a pull through a ticket + offer + confirm round trip would add two round trips and a second code path to do the same nothing. So `mode` was dropped rather than shipped as dead weight (rule A2 / B7).

The target is named by **`targetDeviceId` only**. The panel lists one row per browser (rule R10) while the Speaker role is per tab, so the server resolves the tab that should actually play: the Speaker's own tab if it is on that browser, otherwise the most recently seen one. `expectedRevision` is optional; when present and stale the push is refused rather than applied to a state the user never saw.

**`/session/command` and `/session/transfer` answer with `200 { ok, reason? }`** for every expected refusal — `NO_SESSION`, `NO_SPEAKER`, `IS_SPEAKER`, `SPEAKER_OFFLINE`, `NO_TRACK`, `TARGET_OFFLINE`, `NO_DEVICE`, `NOT_TARGET` — so the client has one code path and turns it into copy rather than an exception. Only a malformed body is a `400`. `STALE_STATE` is a `409` because that is a genuinely conflicting state, as is `STALE_TRANSFER` when a target answers a ticket that has already expired or been superseded.

### 6.4 Command classes

| Class | Types | Behaviour |
| :--- | :--- | :--- |
| **Server-applied** | `PLAY`, `PAUSE`, `SEEK`, `STOP`, `PLAY_TRACK` | Server updates `playback` (+ `context` for `PLAY_TRACK`) and `positionUpdatedAt`, bumps revision, pushes `SESSION_STATE`, **and** relays `COMMAND` to the Speaker so its audio moves. Remotes converge on the broadcast; the Speaker never has to answer first. |
| **Relayed to the Speaker** | `NEXT`, `PREVIOUS`, `SET_VOLUME`, `SET_MUTE`, `SET_SHUFFLE`, `SET_REPEAT`, `ADD_TO_QUEUE`, `PLAY_NEXT`, `REMOVE_FROM_QUEUE`, `REORDER_QUEUE`, `CLEAR_QUEUE` | Server pushes `COMMAND` to the Speaker only, and changes no session state itself. The Speaker runs its existing store action and reports back through its normal paths. |

Because the Speaker is the single writer of queue/playback, a remote `NEXT` is byte-for-byte identical to a local `NEXT` — no drift. `commandId` makes retries idempotent, and the dedupe key is released again when the Speaker turns out to be unreachable, so a genuine failure stays retryable.

`PLAY_TRACK` is the one command that carries content: the tapped track plus the context it was tapped inside (bounded by the same queue limits as the synced snapshot, `200` user / `500` context entries). It is **both** applied by the server and relayed. The server owns "what is playing", so it moves the track and the context immediately and every Remote converges from one broadcast; the Speaker's own `playTrack` is what actually swaps its audio and adopts the new context and queue. That is what makes a Remote's tap feel instant on every device rather than only where the audio moved.

`SET_VOLUME` / `SET_MUTE` are the one place a device-local value travels — inside a single command, never inside the session (rule R2/R5). The Remote's own slider still shows its own volume.

**Client seam.** `player.store` cannot import `connect.store` (which imports it), so every transport action asks `lib/connect-bridge.ts` whether this tab is a Remote. If it is, the action is sent as a command and the local action is skipped; the seam fails **open**, so a signed-out or offline device behaves exactly as it did before Groovy Connect existed. `isRemote` means *there is a session with a Speaker and it isn't this tab*.

### 6.5 Transfer handshake (confirm-then-move)

```text
POST /session/transfer { targetDeviceId, expectedRevision? }
        │
        ▼
  server: ticket { id, from, to, expiresAt, needsGesture } + bump revision
         speaker = { target, confirmed: false }     ← promised, not owned
         needle frozen; old Speaker paused immediately   ← never two rooms of sound
        │
        ├─ SSE  SPEAKER_LOST   → old device: 300ms fade, keep track on screen, become a Remote
        └─ SSE  TRANSFER_OFFER → { transferId, track, positionMs, isPlaying, expiresAt, needsGesture }
                                        │
   target (needsGesture=false) ────────┴── adopts the track and plays at the live position
   target (needsGesture=true)  ─────────── shows "Tap to play here"
                                        │
POST /session/transfer/confirm { transferId, ok, positionMs, isPlaying }
        │
        ▼
  server: confirmed = true, needle anchored on where the target *actually* started,
          revision++  →  SSE SESSION_STATE   everyone converges
                    →  SSE TRANSFER_RESULT requester learns how it ended
```

Failure paths:

- `ok:false` → Speaker reverts to the previous device, which receives `SPEAKER_GRANTED` and resumes at the live position.
- 30s timeout (no answer) → same revert. Enforced twice: an in-process timer fires it promptly, and any read of the session finishes an orphaned handshake (a restart loses the timer).
- Target's SSE drops mid-flight → `detachSpeakerOnDisconnect` sees an *unconfirmed* Speaker, finds the ticket, and reverts.
- Requester pushes somewhere else while one is in flight → the older ticket is superseded and reverted without resuming, so the old Speaker is not rung back up just to be muted again.
- Two conflicting transfers → `expectedRevision` mismatch → `409 STALE_STATE`; client refetches and retries.
- Any answer to a ticket that has expired or been superseded → `409 STALE_TRANSFER`; the answering client stands back down instead of trusting its own optimistic start.

Because the role only *really* moves on confirm, `youAreSpeaker` is computed from `confirmed`. An unconfirmed target is still a Remote on its own view, which is exactly what keeps the audio engine from starting on its own; it claims the role locally at the moment it answers. While a handshake is in flight the session has no usable Speaker, so commands are refused `NO_SPEAKER` and a routine heartbeat cannot steal the role.

### 6.6 Client state machine (per tab)

```text
role:     "speaker" | "remote" | "idle"
unlocked: boolean   // has audio ever started in THIS tab?
```

- `unlocked` lives in **`sessionStorage`** — per tab, survives reload, not shared between tabs. It is reported on register/presence and is what makes `needsGesture` honest: a tab that has never produced audio must ask for a tap before a push may start sound in it (rule A10). Shipping it *is* the pre-warm — there is no separate pre-warm step to hang off the transfer.
- `deviceId` stays in **`localStorage`** — shared per browser (rule R10).
- **Become Speaker** (`SPEAKER_GRANTED` or local play): load at live position → `play()` → set `unlocked = true` → start the 10s position tick + heartbeat.
- **`SPEAKER_LOST`**: 300ms fade → `pause()` → `role = "remote"` → **keep the track and artwork visible**; progress continues from `POSITION`.
- **Remote transport** → `POST /session/command`; progress bar interpolates locally.
- **Tap a song row while Remote** → claim the role directly (`POST /heartbeat { takeover: true }`) with the tapped song, then play locally (rule B7). A pull is its own consent, so it takes no ticket.
- **Pushed to (`TRANSFER_OFFER`)** → claim the role **locally first** (the engine refuses to load a stream while it believes it is a Remote), adopt the track and the account's queue, then `POST /session/transfer/confirm { ok: true, positionMs, isPlaying }`. If the confirm comes back `STALE_TRANSFER`, stand back down rather than play onto a session that now belongs to someone else. When `needsGesture` is true this waits for the "Tap to play here" strip; otherwise it starts straight away.
- **Receive `SPEAKER_GRANTED`** → the push failed and the needle came back: clear the yield signal, set the track/needle, resume. This is an instruction, not a state to reconcile — the tab was faded out and its stream released a moment earlier.
- **Reload while Speaker** → the SSE drop is inside the 10s grace, so no detach; `hello` reports you are the Speaker and you resume at the server-timed live position.

---

## 7. Failure Modes

| Situation | Behaviour |
| :--- | :--- |
| Speaker tab closed (beacon) | `isPlaying = false`, Speaker detached; Remotes show "Desktop is offline • Play here instead" |
| Speaker tab crashed (no beacon) | SSE drop detected; after a **10s grace**, detach |
| Speaker tab backgrounded & throttled | SSE stays open; server refreshes liveness; **not** evicted |
| Two Remotes hit NEXT at once | Serialised by arrival + `commandId`; duplicates ignored |
| Two devices' first-ever play (C1) | Second wins by revision; first stands down via `SPEAKER_LOST` and is offered "Keep playing here instead" |
| Remote sends NEXT but Speaker is offline | Command fails fast → "Can't reach Desktop" |
| Push target never answers (30s) | Ticket expires → previous Speaker receives `SPEAKER_GRANTED` and resumes at the frozen needle |
| Push target goes offline mid-flight | SSE drop of an *unconfirmed* Speaker → same revert as a refusal |
| Push target's tab was never unlocked | Offer carries `needsGesture: true`; the target shows "Tap to play here" and only confirms on the tap (rule A10) |
| Push target declines | `ok:false` → revert in milliseconds, not 30s |
| Jam joined | Connect suspends itself **on that device**: "Play here", push and accept all answer "You're in a Live Jam…". Nothing changes server-side — a jam is not modelled in the session at all (§9.6) |
| Position interpolates past track end | Remotes clamp to `durationMs`; the Speaker's track change corrects it |
| Device cap reached | Oldest `lastSeenAt` pruned from the devices hash |

---

## 8. Migration

`groovy:player:state:{userId}` is split into `session` + `queue`.

On read, if `groovy:player:session:{userId}` is absent but the legacy `state` key exists, the server hydrates a session from it, **dropping `volume`/`isMuted`**. This keeps any 7-day-old snapshot working and retires the "mute synced across devices" bug as soon as clients stop sending volume.

Client-side, `volume` / `isMuted` become purely local state; `initializeSync` no longer imports them from the server.

---

## 9. Build Order & Status

| # | Step | Status |
| :--- | :--- | :--- |
| 1 | **Foundation (no UX change):** per-tab `instanceId`, private presence heartbeat, session record with server-stamped live position, device list endpoint, volume/mute removed from the synced snapshot. | ✅ Shipped |
| 2 | **Devices panel + "Play here"** (Scenario A pull) — where the phone bug dies. | ✅ Shipped |
| 3 | **SSE channel + `SPEAKER_LOST` within ~1s** — transfer becomes clean instead of "eventually pauses". | ✅ Shipped |
| 4 | **Remote control** (Scenario B): command endpoint, Remote-mode UI, local progress ticking. | ✅ Shipped |
| 5 | **Push transfer** ("Play on {device}") with the autoplay confirm handshake (A9/A10). | ✅ Shipped |
| 6 | **Fixes after the first real-world reports:** one authority for "who is playing" (the both-devices-go-silent bug), a Remote's song tap playing **on the Speaker** (rule B7), and a Jam boundary that is actually enforced (§9.6). | ✅ Shipped |

Steps 1–2 already make the feature feel finished; steps 3–5 make it feel like Spotify.

### 9.1 What shipped in step 2

- **One panel, two hosts.** `DevicePanel.tsx` exports `DevicesContent`, rendered by the desktop right sidebar (`desktopRightSidebarView === "devices"`) and, unchanged, inside a mobile bottom sheet (`DeviceSheet`, built on the shared `ui/Sheet` primitive). Reaching the panel from the phone is the actual fix for "Play here doesn't appear on phone" (rule R1).
- **`playHere()`** (`stores/connect.store.ts`) is the single transfer path: read the session + snapshot, adopt the track/queue/context, resume at the **live** position (A3), then claim the Speaker with an *authorised* takeover heartbeat — the tap is the explicit user action rule A2 requires.
- **The strip no longer depends on a `superseded` event.** `PlayerBar` shows "Playing on {device}" whenever the Listen Session has a different Speaker, so a device that has never played still offers "Play here". Dismissal is per device and returns if a *different* device takes over.
- **Honest Remotes.** The mobile mini player and the full mobile player show a speaker indicator with the live device name, both opening the panel.
- **State is single-owner.** `connect.store` owns session/device state; `player.store` owns what this device is doing. Device lifecycle (register, presence, needle tick, unload beacon) lives in `GlobalAudioEngine`, gated on auth so it works whether auth resolves before or after mount.

### 9.2 Transitional supersession (the step-2 stopgap, now retired)

Before step 3 a transfer could not reach the losing device instantly, so step 2 closed the window as far as it could without SSE:

- The losing device's **needle tick** (10s) was rejected and returned the new Speaker, so it faded out and became a Remote within one tick instead of waiting up to 15s for the next heartbeat.

Step 3 (below) makes this path the *fallback* rather than the mechanism: `SPEAKER_LOST` now arrives in about a second, and the needle tick and 15s heartbeat remain as safety nets for a dropped stream.

### 9.3 What shipped in step 3

**One realtime channel per account.** `GET /api/v1/player/session/events` is a Server-Sent Events stream, built exactly like the notifications stream: the handler sets `text/event-stream`, duplicates the Redis client, subscribes to `groovy:player:events:{userId}`, and forwards each published message as a `data:` frame. The stream is **server → client only** — every client action stays a plain HTTP POST — so a dropped stream degrades to "slower", never "broken", and `EventSource` reconnection needs no custom protocol.

**The events** (`player.events.ts` defines them; the payloads mirror `client_test/src/lib/player.api.ts`):

| Event | Published when | Carries |
| :--- | :--- | :--- |
| `hello` | A stream opens | The full session view + device list, viewer-scoped (`youAreSpeaker`) |
| `SESSION_STATE` | A *logical* change: track, context, Speaker, play/pause, a seek > 1.5s | Session, live needle, `speakerOnline` — viewer-independent |
| `POSITION` | The Speaker's needle tick | The anchor only — deliberately small, because it is the high-frequency event |
| `SPEAKER_LOST` | A different device takes the Speaker role, or the Speaker stands down | The **losing** device's ids and the new Speaker |
| `DEVICES_CHANGED` | A device joins, returns from offline, or is forgotten | The device list |

**Two deliberate omissions keep the fan-out cheap.** `SESSION_STATE` is published only on a *logical* change, which is why the 15s heartbeat does not broadcast every 15s; and `DEVICES_CHANGED` is published only when the online set actually flips, so a routine 30s presence ping stays a single Redis write. Neither carries viewer-specific fields, so one publish serves every device — each client decides for itself whether the Speaker is *it*.

**`hello` is the whole resync story.** Because the first frame restates the entire session view, a reconnecting client never has to detect or repair gaps: it simply replaces what it knows. There is no sequence-number protocol to get wrong.

**One stand-down path on the client.** `player.store.speakerYieldedBy` is the single signal, and `GlobalAudioEngine` owns the only fade-and-pause implementation. All three ways a device can learn it lost the role — `SPEAKER_LOST` over SSE, a `superseded` heartbeat, a rejected needle tick — funnel into `yieldSpeakerTo()`, so the three can never drift apart.

**Liveness from the stream, not the timer.** While a stream is open the server refreshes that tab's liveness itself every 30s, because a browser throttles a background tab's `setInterval` but not an open stream. This is principle 6 made concrete: a Speaker that is playing with the tab hidden is never mistaken for a gone one.

**The 10s stand-down grace.** A reload also drops the stream, so closing the last stream for a tab starts a 10s timer instead of standing down immediately; reconnecting cancels it. Only when the grace expires does the server freeze the needle and detach the Speaker — so a page refresh is seamless, while closing the tab lapses the session and any Remote can offer "Play here". The identity check in `detachSpeakerOnDisconnect` makes it a no-op if another device already took over.

**Client reconnect.** A flat 5s backoff, matching the notifications stream — deliberately shorter than the server's 10s grace, so a network blip cannot cost a device the Speaker role.

**What is still polled.** The needle *between* `POSITION` events is not yet interpolated locally, so a Remote's progress number refreshes on each tick rather than smoothly ticking. Remote control (step 4) adds the command endpoint and the local ticking.

### 9.4 What shipped in step 4

**A Remote is a real remote.** Every transport action now goes through one seam (`lib/connect-bridge.ts`). `player.store` asks "is another device the Speaker?" before it acts; if so, the action is sent to `POST /api/v1/player/session/command` and the local action is skipped. Because the check sits in the *store*, it covers every entry point at once — the player bar, the mobile players, the keyboard shortcuts, the queue drawer, the song rows — with no per-button work and no chance of one being missed.

**The seam fails open.** `connect-bridge` holds no state of its own: `connect.store` installs the implementation once, and until it is installed every action behaves exactly as it did before Groovy Connect existed. That is what keeps a signed-out, offline or jam-only session working unchanged.

**Play/pause/seek/stop are applied by the server; everything else is relayed.** The server moves the needle itself for the pure-state commands, so every Remote agrees immediately from the `SESSION_STATE` broadcast instead of waiting for the Speaker to catch up; the Speaker *also* receives the `COMMAND` frame, which is what moves its audio. `NEXT`, `PREVIOUS`, the volume/mute pair, shuffle/repeat and every queue edit are relayed untouched, because they need the Speaker's queue — the Speaker runs its ordinary store action and reports back through the normal paths, so a remote `NEXT` is byte-for-byte identical to a local one.

**Refusals are answers, not exceptions.** `200 { ok: false, reason }` for `NO_SESSION`, `NO_SPEAKER`, `IS_SPEAKER` and `SPEAKER_OFFLINE`; only a malformed body is a `400`. A command aimed at an unreachable Speaker fails fast and names it, which is what produces the quiet "Can't reach {device}" instead of a button that appears broken (rule B3). `commandId` deduplicates, and the dedupe key is released again on failure so a genuine miss stays retryable.

**Tapping a song on a Remote plays it on the Speaker.** `playTrack`, `playUserQueueTrack` and `jumpToContextTrack` send `PLAY_TRACK` with the tapped song *and the context it came from* when this tab is a Remote, and only skip the local path once that command is on its way. The server moves the session's track and context itself so every device converges from one broadcast, and the Speaker adopts both from the relayed command, which is what keeps NEXT/PREVIOUS meaningful after a tap. A Speaker that cannot be reached is the one exception: the tap falls back to `playHere({ track, … })`, the pre-Connect behaviour, so a tap always ends in sound.

**A Remote produces no audio — and no longer has to look idle.** When another device is the Speaker, the session is mirrored into `player.store` (track, duration, playing state, shuffle, repeat), so the existing player UI works unchanged on a device that has never played anything (rules B2/R6). The audio engine stands down on all six paths that could have produced sound or written state: source resolution, play/pause, seek, the 15s heartbeat, the 10s needle tick, and telemetry. That last set matters as much as the first: without it a Remote would have fought the real Speaker for the role and double-counted plays (rule B8).

**The needle glides.** A Remote has no audio element to ask for the time, so `connect.store` interpolates the session's needle from the server-stamped anchor on a 1s local ticker, and exposes it as `livePositionMs`. Only *elapsed* time comes from the browser, corrected by an offset learned from a server-stamped frame, so a wrong local clock cannot shift the position (principle 1). It is written to `player.store.currentTime` for the scrubber but deliberately never saved back.

**Speaker-offline is a first-class state.** When the session's Speaker stops reporting in, the session is already frozen at its last position by the server; the panel and the player-bar strip switch to "**{device} is offline**" with "**Play here instead**", which is the one useful thing left to do (rule B6).

**Still deferred.** `QUEUE_CHANGED` (queue edits ride `SESSION_STATE` today, which is enough for correctness and cheaper than a refetch), and the pre-warm of a Remote's audio element on first interaction (rule B10 — a performance nicety, and it belongs with the push handshake in step 5).

### 9.5 What shipped in step 5

**A push is a handshake, and that is the whole design.** "Play on {device}" is the one direction a device cannot do alone: the target has to agree before it starts making sound, because browsers block autoplay and because two rooms of sound is the single thing this feature must never do. So `POST /session/transfer` does not move the Speaker — it takes a **ticket**, mutes the old Speaker immediately, freezes the needle where it stood, and points the session at the target with `confirmed: false`. The role only really moves when the target answers (rule A9).

**The role is only *promised* until it is confirmed.** `youAreSpeaker` is computed from `speaker.confirmed`, so an unconfirmed target is still a Remote on its own view — which is exactly what stops the audio engine from starting by itself. The target claims the role locally in the same tick that it answers, then confirms. That single rule also gives the mid-flight session a defined behaviour everywhere else: a command is refused `NO_SPEAKER` (there is no Speaker to steer yet), and a routine heartbeat cannot steal the role, while an authorised takeover still can and cancels the ticket.

**Targeting resolves the browser→tab gap.** The panel has one row per browser (rule R10) but the role is per tab, so the client sends only `targetDeviceId` and the server picks the tab that should play: the Speaker's own tab if it is on that browser, otherwise the most recently seen instance. That is what keeps the endpoint signature honest to the UI rather than to the data model.

**Every failure path lands back where the user left off.** A decline, a 30s timeout, the target's stream dropping mid-handshake, or a superseding second push all end in `revertTransfer`: the needle returns to the frozen position, the previous Speaker is restored and resumes, and it receives `SPEAKER_GRANTED` — an **action**, not a state to reconcile, because that device was faded out and its stream released a moment earlier, so a broadcast alone would leave it silent. The timeout is enforced twice: an `unref`ed in-process timer for promptness, and a check on any read of the session so a process restart can never leave a phantom Speaker alive.

**`needsGesture` is decided by the tab, not by the browser.** A tab reports `unlocked` on register/presence, and shipping that flag *is* rule B10's pre-warm: a tab that has produced audio before may start a push straight away, while a tab that has never been unlocked gets "**Tap to play here**" — the gesture the browser requires. No separate pre-warm step, and no way for the flag to disagree with the browser.

The browser still gets the last word on the first case. `unlocked` lives in `sessionStorage` and so survives a reload, but user activation is per **document**, so a tab that played an hour ago and was then reloaded will *not* be allowed to start audio without a tap. The target therefore checks `navigator.userActivation.hasBeenActive` before auto-starting and falls back to the prompt when it is false, which is what makes A10's promise literally true instead of usually true. Where the API is missing the server's flag is used unchanged.

**Three events, three audiences.** `TRANSFER_OFFER` names the **target**, `TRANSFER_RESULT` names the **requester**, and `SPEAKER_GRANTED` names the **granted** device — the same account-wide channel, with each client filtering by `deviceId` + `instanceId`. `PLAYBACK_MOVED` was retired rather than shipped: a conflict loser stands down through the identical single path as a deliberate push (`SPEAKER_LOST` → the one stand-down funnel), and its "Keep playing here instead" affordance rides that, so a second event type would have carried identical payload and identical copy.

**Copy, not exceptions.** `TARGET_OFFLINE`, `NO_DEVICE`, `NO_TRACK`, `NO_SESSION` and `NOT_TARGET` are `200 { ok: false, reason }` answers the UI turns into a sentence ("{device} isn't available right now."); `STALE_STATE` is a `409` because it is a genuinely conflicting state. A `STALE_TRANSFER` — an answer to a ticket that already expired or was superseded — is also a `409`, and the target stands back down instead of playing onto a session that now belongs to someone else.

**Still deferred.** The offline "transfer intent" of rule A6 (the rule already calls it a future enhancement; the panel refuses offline targets with copy instead), `QUEUE_CHANGED`, and independent simultaneous playback (Scenario C, not in v1).

### 9.6 Three fixes after step 5

**One authority for "who is playing".** There were *two* answers: the Listen Session, and an older `active_device` lease that predates it. A transfer moved the session but never the lease, so the device that had just been handed playback still looked like an intruder to the lease — `recordHeartbeat` answered `superseded`, the client stood down, and because the old Speaker had already stood down, **both devices went silent while the session still claimed to be playing**. Worse, it could not recover: a device that believes it is a Remote never heartbeats again, so both screens sat on "Play here" with a moving scrubber and no sound until someone tapped one.

The session is now the only authority. `recordHeartbeat` refuses a device only when the session's Speaker (or an unconfirmed handshake target) reported in within the last **35s**; the lease is consulted only when the session has *no* Speaker at all, which is what keeps single-device playback enforced for accounts that predate Groovy Connect. The client is belt-and-braces on top of that: a `superseded` answer no longer stands a tab down if the session still names it as the confirmed Speaker — it refreshes instead, because the one thing worse than standing down late is standing down wrongly.

That also fixed a second, cosmetic bug: the "another device is playing" strip took its name from whoever the session's Speaker was, so a device in that state showed **"Playing on {its own name}"** with a "Play here" button. The strip now excludes this tab's own `deviceId`/`instanceId`.

**A Remote's song tap plays on the Speaker (rule B7, Spotify semantics).** The first implementation made a tap *pull* playback to the tapping device, which contradicted the stated goal — it needed a new command, and the original spec deliberately declined to add one. `PLAY_TRACK` carries the tapped track and its context, the server applies it (session moves, every Remote converges from one broadcast) **and** relays it (the Speaker swaps its audio and adopts the context). The pull path stays, demoted to the fallback for a Speaker that cannot be reached, so a tap still always ends in sound.

**The Jam boundary is enforced where the jam lives.** The server had `IN_JAM` guards on `/session/command` and `/session/transfer`, but nothing ever set `session.type`, so they could never fire — a guard that only looked like protection. `type` and `IN_JAM` are gone; a Listen Session no longer pretends to know about jams. In their place, the client asks one helper, `isInJam()`, on the three paths that would fight a jam: "Play here", pushing playback away, and **accepting** a push onto a device that is in a jam (which the server-side guard never covered, and which would have made a jam member start the solo stream mid-jam). A jam is a room, not an account mode, so the suspension is per-device: another device on the same account may still use Connect normally.

---

## 10. Test Plan (`server/src/modules/player/player.test.ts`)

1. Two devices register → both appear in the device list; `online` reflects presence.
2. Device A plays → `speaker = A`; B sees `SESSION_STATE` + `POSITION` and the position matches the server stamp.
3. B sends `PAUSE` / `SEEK` → A receives the change; both converge on one revision.
4. B sends `NEXT` → relayed to A; A reports the new track; B converges.
5. Transfer **pull** ("Play here") → A receives `SPEAKER_LOST`; B claims the role directly at the live position.
6. Push to an unlocked-false target → `TRANSFER_OFFER` carries `needsGesture: true`; old Speaker stays paused; timeout reverts to the old Speaker.
7. Conflicting second play → first device stands down via `SPEAKER_LOST` and is offered "Keep playing here instead".
8. Volume is absent from the session payload and never crosses devices.
9. Two tabs of one browser → exactly one Speaker.
10. `speaker/leave` beacon → detached; a Remote can take over.

**What the suite asserts today** (`server/src/modules/player/player.test.ts`, 45 checks, all green):

- Shipped from the plan above: 1, 2 (the server-stamped needle), 5 (`SPEAKER_LOST` naming the losing device), 8, 9, 10.
- Shipped in step 3 — the realtime channel, driven against the live endpoint on an ephemeral port:
  - A Speaker claim broadcasts `SESSION_STATE` naming the new Speaker, with a numeric live needle and no device-local fields.
  - A transfer broadcasts `SPEAKER_LOST` naming the **losing** device and carrying the new Speaker.
  - The needle tick broadcasts a small `POSITION` payload that does not embed the session.
  - A device joining broadcasts `DEVICES_CHANGED`.
  - `detachSpeakerOnDisconnect` ignores a non-Speaker, and for the real Speaker freezes the needle, detaches the role and broadcasts `SPEAKER_LOST`.
  - A reconnect inside the grace window cancels the stand-down; leaving for good fires it exactly once and clears the registry.
  - `GET /session/events` answers with `text/event-stream` and opens with a `hello` frame that resyncs the client (`youAreSpeaker` true for the Speaker's own stream, plus the device list).
- Shipped in step 4 — remote control, driven through the real endpoint:
  - A command from the Speaker itself is refused with `IS_SPEAKER` (a Speaker acts locally, rule B1).
  - A Remote's `PAUSE` pauses the session, broadcasts `SESSION_STATE`, and the returned view says the caller is not the Speaker while the Speaker still reads online (B4).
  - Repeating a `commandId` is applied once and answered with `duplicate: true` (A8).
  - `PLAY` resumes from the frozen position and bumps the revision.
  - `SEEK` re-anchors the needle near the requested point.
  - `NEXT` is relayed as a `COMMAND` frame naming exactly the Speaker, and **changes no server-side session state** — proving the relay/server-applied split (design doc §6.4).
  - A Remote's `PLAY_TRACK` moves the session's track, context and needle to the tapped song, bumps the revision, **and** relays the same command (with the track) to the Speaker (rule B7, §9.6).
  - An unknown command type is a `400`.
  - A command aimed at an unreachable Speaker fails fast with `SPEAKER_OFFLINE` and names the device (B3).
- Shipped in step 5 — the push handshake, driven through both real endpoints:
  - A push to an offline device is refused `TARGET_OFFLINE` instead of being queued (A6).
  - A push to a never-unlocked device carries `needsGesture: true`, points the session at the target as **unconfirmed**, freezes the old Speaker's needle to `isPlaying: false`, sends `SPEAKER_LOST` naming the **loser** and a `TRANSFER_OFFER` naming the **target** with the live needle (A9/A10).
  - An unconfirmed target is **not** the Speaker on its own session view, and a command mid-handshake is refused `NO_SPEAKER` rather than waking it.
  - Confirming moves the role, anchors the needle on the position the target reported, marks `youAreSpeaker: true`, restores playback and bumps the revision; `TRANSFER_RESULT` routes back to the requester (A8).
  - The **new Speaker keeps the room**: a routine heartbeat from the confirmed Speaker is accepted even though the legacy device lease still points at the previous device, and a routine heartbeat from the previous device is refused `superseded` naming the new one (§9.6).
  - A replayed confirmation is a `409 STALE_TRANSFER` — a ticket moves the playback once.
  - Declining reverts to the previous Speaker and resumes it, which receives `SPEAKER_GRANTED`; the requester gets `TRANSFER_RESULT { ok: false, reason: "DECLINED" }`.
  - An unanswered push **times out** and reverts on its own, granting the role back without any client involvement.
  - Only the offered device may answer; a `NOT_TARGET` answer is refused and the real target can still answer.
  - A push carrying a stale `expectedRevision` is a `409 STALE_STATE`.
