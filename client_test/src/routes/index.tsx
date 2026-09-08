import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { useSectionStore, type MaisonSection } from '../stores/section.store'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

interface TrackItem {
  id: string
  title: string
  artist: string
  collection: string
  duration: string
  tag: string
  format: string
}

const SAMPLE_TRACKS: TrackItem[] = [
  {
    id: '1',
    title: 'Atelier Session No. 1',
    artist: 'Maison Ensemble',
    collection: 'Late Summer MMXXVI',
    duration: '4:18',
    tag: 'Master Tape',
    format: '48kHz / 24-Bit FLAC',
  },
  {
    id: '2',
    title: 'Nocturne in Rue de Sèvres',
    artist: 'Hélène Vane',
    collection: 'Rue de Sèvres Session',
    duration: '5:42',
    tag: 'Binaural',
    format: '96kHz High-Res',
  },
  {
    id: '3',
    title: 'Acoustics & Ambient Waves',
    artist: 'Karel Berg',
    collection: 'Analog Hiss & Reverie',
    duration: '3:55',
    tag: 'Tape Saturation',
    format: 'Lossless Master',
  },
  {
    id: '4',
    title: 'Clair de Lune (Re-mastered)',
    artist: 'Debussy / Atelier Soloist',
    collection: 'Classical Vaults',
    duration: '5:04',
    tag: 'Grand Piano',
    format: 'DSD 2.8MHz',
  },
  {
    id: '5',
    title: 'Rain on Copper Roofs',
    artist: 'Soren & Camille',
    collection: 'Minimalist Field Works',
    duration: '6:12',
    tag: 'Field Recording',
    format: 'Lossless 48kHz',
  },
  {
    id: '6',
    title: 'Autumn in Saint-Germain',
    artist: 'The Left Bank Quartet',
    collection: 'Parisian Jazz Archive',
    duration: '4:39',
    tag: 'Direct-to-Disk',
    format: 'Vinyl Pressing',
  },
]

const SAMPLE_PLAYLISTS = [
  {
    id: 'pl-1',
    title: 'Crate I: Rue de Sèvres Sessions',
    tracksCount: 8,
    curator: 'Maison Atelier',
    specs: 'Reel-to-Reel 15 IPS',
    desc: 'Uncompressed room takes captured on vintage Studer tape machines.',
  },
  {
    id: 'pl-2',
    title: 'Crate II: Late Night Parisian Jazz',
    tracksCount: 12,
    curator: 'Hélène Vane',
    specs: 'Direct-to-Disk Vinyl',
    desc: 'Intimate quartet performances with natural room reverb and warmth.',
  },
  {
    id: 'pl-3',
    title: 'Crate III: Solitude & Grand Pianos',
    tracksCount: 14,
    curator: 'Karel Berg',
    specs: '96kHz / 24-Bit FLAC',
    desc: 'Solo acoustic piano recordings captured in resonant stone chapels.',
  },
  {
    id: 'pl-4',
    title: 'Crate IV: Minimalist Field & Ambient',
    tracksCount: 9,
    curator: 'Soren & Camille',
    specs: 'Binaural Lossless',
    desc: 'Gentle rainfall, woodcraft reverberations, and tape saturation.',
  },
]

const SAMPLE_ALBUMS = [
  {
    catId: 'GROOVY-001',
    title: 'Atelier Session No. 1',
    artist: 'Maison Ensemble',
    date: 'August 2026',
    format: '24-Bit / 48kHz FLAC',
    status: 'Master Vault Verified',
  },
  {
    catId: 'GROOVY-002',
    title: 'Rue de Sèvres Nocturnes',
    artist: 'Hélène Vane',
    date: 'July 2026',
    format: '96kHz Binaural',
    status: 'Direct R2 Storage',
  },
  {
    catId: 'GROOVY-003',
    title: 'Analog Hiss & Reverie',
    artist: 'Karel Berg',
    date: 'June 2026',
    format: 'Tape Saturation Master',
    status: 'Argon2id Signed',
  },
  {
    catId: 'GROOVY-004',
    title: 'The Left Bank Transcriptions',
    artist: 'The Left Bank Quartet',
    date: 'May 2026',
    format: 'Direct-to-Disk Vinyl',
    status: 'Master Vault Verified',
  },
]

const SAMPLE_ARTISTS = [
  {
    name: 'Maison Ensemble',
    role: 'Resident Chamber Collective',
    origin: 'Paris, France',
    bio: 'Pioneering acoustic chamber recordings with minimal microphone setups and uncompressed dynamic range.',
  },
  {
    name: 'Hélène Vane',
    role: 'Pianist & Arranger',
    origin: 'Lyon, France',
    bio: 'Specialist in French Impressionism, capturing the delicate acoustics of historic Parisian venues.',
  },
  {
    name: 'Karel Berg',
    role: 'Sound Architect',
    origin: 'Brussels, Belgium',
    bio: 'Sculptor of ambient modular synthesizer tones integrated with organic tape loops and analog warmth.',
  },
]

function HomeComponent() {
  const { user, isAuthenticated, isLoading } = useAuthStore()
  const { activeSection, setSection } = useSectionStore()

  // Search section states
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string>('All')

  const filterTags = ['All', 'Master Tape', 'Binaural', 'Tape Saturation', 'Grand Piano', 'Field Recording', 'Direct-to-Disk']

  // When not logged in, always show the discover foyer view
  const currentSection = isAuthenticated ? activeSection : 'discover'

  const filteredTracks = useMemo(() => {
    return SAMPLE_TRACKS.filter((t) => {
      const matchesQuery =
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.collection.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesTag = selectedTag === 'All' || t.tag === selectedTag
      return matchesQuery && matchesTag
    })
  }, [searchQuery, selectedTag])

  return (
    <div className="space-y-10">
      {/* Editorial Chapter Navigation Selector Bar (Visible only when authenticated) */}
      {isAuthenticated && (
        <div className="flex items-center gap-1 sm:gap-2 border-b border-line pb-3 overflow-x-auto select-none">
          {(
            [
              { id: 'discover', num: 'I', label: 'Discover' },
              { id: 'search', num: 'II', label: 'Search' },
              { id: 'playlists', num: 'III', label: 'Playlists' },
              { id: 'albums', num: 'IV', label: 'Albums' },
              { id: 'artists', num: 'V', label: 'Artists' },
            ] as { id: MaisonSection; num: string; label: string }[]
          ).map((tab) => {
            const isActive = currentSection === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-panel border border-line text-ink font-semibold shadow-2xs'
                    : 'text-ink-soft hover:text-ink hover:bg-panel/40 border border-transparent'
                }`}
              >
                <span className={isActive ? 'text-blue' : 'opacity-60'}>{tab.num}</span>
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ==================== CHAPTER I: DISCOVER (FOYER) ==================== */}
      {currentSection === 'discover' && (
        <div className="space-y-10">
          {/* Editorial Hero Section */}
          <section className="border border-line bg-panel p-8 sm:p-12 shadow-xs relative overflow-hidden">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-deep mb-3">
              Maison Édition — Private Catalog & Sound Atelier
            </div>
            <h1 className="font-serif italic font-normal text-3xl sm:text-5xl text-ink leading-[1.08] mb-4 max-w-2xl">
              A private catalog of unhurried sound.
            </h1>
            <p className="font-sans text-xs sm:text-sm text-ink-soft max-w-xl leading-relaxed mb-8">
              Crafted for curated listening. Powered by a high-throughput Fastify
              microservices architecture with Argon2id password security, silent
              Refresh Token Rotation (RTR), theft reuse detection, and direct
              Cloudflare R2 pre-signed uploads.
            </p>

            <div className="flex flex-wrap items-center gap-4 relative z-10">
              {!isAuthenticated && !isLoading ? (
                <>
                  <Link
                    to="/login"
                    className="bg-ink text-canvas border border-ink py-3 px-6 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink shadow-2xs"
                  >
                    Enter the Maison
                  </Link>
                  <Link
                    to="/register"
                    className="border border-line bg-panel hover:bg-canvas-deep text-ink py-3 px-6 font-mono text-[11px] uppercase tracking-[0.12em] transition-all shadow-2xs"
                  >
                    Join the Collective
                  </Link>
                </>
              ) : (
                <Link
                  to="/profile"
                  className="bg-ink text-canvas border border-ink py-3 px-6 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink shadow-2xs"
                >
                  Curator Profile & Vault &rarr;
                </Link>
              )}
            </div>

            {/* Vinyl Rings Watermark Background */}
            <div className="pointer-events-none absolute -right-12 -bottom-12 w-64 h-64 opacity-25">
              <svg viewBox="0 0 100 100" width="100%" height="100%" fill="none">
                <g stroke="currentColor" className="text-stone dark:text-stone/40" strokeWidth="0.5">
                  {[8, 16, 24, 32, 40, 48].map((r) => (
                    <circle key={r} cx="50" cy="50" r={r} />
                  ))}
                </g>
              </svg>
            </div>
          </section>

          {/* Featured Atelier Catalog Audio Records Row */}
          <section className="space-y-4">
            <div className="flex justify-between items-baseline border-b border-line pb-3">
              <div className="flex items-center gap-3">
                <h2 className="font-serif italic font-medium text-xl text-ink">
                  Curated Master Tapes
                </h2>
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] px-2 py-0.5 border border-line bg-canvas-deep text-ink-soft">
                  Lossless 48kHz / 24-Bit
                </span>
              </div>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
                Archive MMXXVI
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {SAMPLE_TRACKS.slice(0, 3).map((track, i) => (
                <div
                  key={track.id}
                  className="border border-line bg-panel p-5 shadow-xs hover:border-ink transition-colors group cursor-pointer"
                >
                  <div className="aspect-square bg-canvas-deep border border-line mb-4 relative flex items-center justify-center overflow-hidden">
                    <svg viewBox="0 0 100 100" className="w-24 h-24 text-stone dark:text-stone/30" fill="none" stroke="currentColor" strokeWidth="0.5">
                      {[10 + i * 2, 20 + i * 2, 30 + i * 2, 40 + i * 2].map((r) => (
                        <circle key={r} cx="50" cy="50" r={r} />
                      ))}
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-canvas/60">
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2.5 py-1 bg-ink text-canvas">
                        Inspect Master
                      </span>
                    </div>
                  </div>
                  <div className="font-serif font-medium text-sm text-ink mb-0.5">
                    {track.title}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
                    {track.format} &bull; {track.tag}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Master Tapes Correspondence Slip */}
          <section className="space-y-4">
            <div className="flex justify-between items-baseline border-b border-line pb-3">
              <h2 className="font-serif italic font-medium text-xl text-ink">
                Correspondence Slip &bull; Master Recordings
              </h2>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
                6 Master Works
              </span>
            </div>

            <div className="border border-line bg-panel divide-y divide-line/60">
              {SAMPLE_TRACKS.map((t, idx) => (
                <div
                  key={t.id}
                  className="px-5 py-3.5 flex items-center justify-between hover:bg-canvas-deep transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="font-mono text-[10px] text-ink-soft/70 w-5">
                      0{idx + 1}
                    </span>
                    <div className="truncate">
                      <div className="font-serif font-medium text-sm text-ink group-hover:text-blue transition-colors truncate">
                        {t.title}
                      </div>
                      <div className="font-mono text-[10px] text-ink-soft truncate">
                        {t.artist} &bull; {t.collection}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-5 shrink-0 pl-3">
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 border border-line bg-canvas text-ink-soft hidden sm:inline-block">
                      {t.tag}
                    </span>
                    <span className="font-mono text-[10.5px] text-ink-soft">
                      {t.duration}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Session State & Entitlements Split */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Session State Card */}
            <div className="border border-line bg-panel p-8 shadow-xs">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-blue-deep mb-1">
                Telemetry · Authentication
              </div>
              <h2 className="font-serif italic font-normal text-2xl text-ink mb-6">
                Session Diagnostics
              </h2>

              {isLoading ? (
                <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-soft animate-pulse">
                  Validating cryptographic token...
                </p>
              ) : isAuthenticated && user ? (
                <div className="divide-y divide-line text-xs font-sans">
                  <div className="flex justify-between py-2.5">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-soft">
                      Identifier:
                    </span>
                    <span className="font-mono text-[11px] text-ink truncate max-w-[200px]">
                      {user.id}
                    </span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-soft">
                      Email:
                    </span>
                    <span className="text-ink">{user.email}</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-soft">
                      Curator Name:
                    </span>
                    <span className="font-medium text-ink">{user.displayName}</span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-soft">
                      Access Role:
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-blue font-medium">
                      {user.role}
                    </span>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-soft">
                      Email Status:
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em]">
                      {user.isEmailVerified ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          Verified ✓
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">
                          Unverified
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="font-sans text-xs text-ink-soft mb-4">
                    No active session token detected in local atelier memory.
                  </p>
                  <Link
                    to="/login"
                    className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-blue hover:underline"
                  >
                    Sign in to establish connection &rarr;
                  </Link>
                </div>
              )}
            </div>

            {/* Subscription Features Card */}
            <div className="border border-line bg-panel p-8 shadow-xs">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-blue-deep mb-1">
                Entitlements · Vault
              </div>
              <h2 className="font-serif italic font-normal text-2xl text-ink mb-6">
                Membership Privileges
              </h2>

              {isAuthenticated && user?.plan ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-line">
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-soft">
                      Current Tier:
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] px-2.5 py-1 border border-blue text-blue font-medium bg-blue/5">
                      {user.plan.name}
                    </span>
                  </div>

                  <div className="bg-canvas p-4 border border-line">
                    <p className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft mb-2">
                      Cryptographic Entitlement Schema:
                    </p>
                    <pre className="font-mono text-[11px] text-ink-soft overflow-x-auto">
                      {JSON.stringify(user.plan.features, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center">
                  <p className="font-sans text-xs text-ink-soft mb-4">
                    Sign in to query database subscription entitlements and vault limits.
                  </p>
                  <Link
                    to="/register"
                    className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-blue hover:underline"
                  >
                    Join membership collective &rarr;
                  </Link>
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ==================== CHAPTER II: SEARCH ==================== */}
      {currentSection === 'search' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          <div className="border-b border-line pb-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-deep mb-3">
              Chapter II &bull; Atelier Search
            </div>
            <h1 className="font-serif italic font-normal text-3xl sm:text-4xl text-ink mb-6">
              Search the Master Vault
            </h1>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search a title, an artist, a tape crate..."
                className="w-full bg-transparent border-b-2 border-line focus:border-ink outline-none py-3 font-serif italic text-2xl sm:text-3xl text-ink placeholder:text-stone transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft hover:text-ink cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Tag Filter Chips */}
            <div className="flex flex-wrap gap-2 mt-6">
              {filterTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(tag)}
                  className={`px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] border cursor-pointer transition-all ${
                    selectedTag === tag
                      ? 'bg-ink text-canvas border-ink font-medium shadow-2xs'
                      : 'bg-panel border-line text-ink-soft hover:text-ink hover:border-ink'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Results Slip */}
          <div className="space-y-4">
            <div className="flex justify-between items-baseline font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
              <span>Results &bull; {filteredTracks.length} recordings found</span>
              {searchQuery && <span>Filter: &ldquo;{searchQuery}&rdquo;</span>}
            </div>

            {filteredTracks.length === 0 ? (
              <div className="border border-line bg-panel p-12 text-center">
                <p className="font-serif italic text-lg text-ink mb-2">No recordings found</p>
                <p className="font-mono text-xs uppercase tracking-[0.1em] text-ink-soft">
                  Try adjusting your search criteria or tag filters.
                </p>
              </div>
            ) : (
              <div className="border border-line bg-panel divide-y divide-line/60">
                {filteredTracks.map((t, idx) => (
                  <div
                    key={t.id}
                    className="px-5 py-4 flex items-center justify-between hover:bg-canvas-deep transition-colors group cursor-pointer"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="font-mono text-[10px] text-ink-soft/70 w-5">
                        0{idx + 1}
                      </span>
                      <div className="truncate">
                        <div className="font-serif font-medium text-sm text-ink group-hover:text-blue transition-colors truncate">
                          {t.title}
                        </div>
                        <div className="font-mono text-[10px] text-ink-soft truncate">
                          {t.artist} &bull; {t.collection}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 shrink-0 pl-3">
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 border border-line bg-canvas text-ink-soft hidden sm:inline-block">
                        {t.format}
                      </span>
                      <span className="font-mono text-[10.5px] text-ink-soft">
                        {t.duration}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== CHAPTER III: PLAYLISTS (TAPE CRATES) ==================== */}
      {currentSection === 'playlists' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          <div className="border-b border-line pb-4 flex justify-between items-baseline">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-deep mb-2">
                Chapter III &bull; Collections
              </div>
              <h1 className="font-serif italic font-normal text-3xl sm:text-4xl text-ink">
                Tape Crates & Curations
              </h1>
            </div>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
              {SAMPLE_PLAYLISTS.length} Crates Archived
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {SAMPLE_PLAYLISTS.map((pl, i) => (
              <div
                key={pl.id}
                className="border border-line bg-panel p-6 shadow-xs hover:border-ink transition-colors group cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 bg-canvas-deep border border-line flex items-center justify-center font-serif italic text-lg text-ink font-semibold">
                      0{i + 1}
                    </div>
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] px-2 py-0.5 border border-line bg-canvas text-blue-deep font-medium">
                      {pl.specs}
                    </span>
                  </div>
                  <h3 className="font-serif font-medium text-lg text-ink group-hover:text-blue transition-colors mb-2">
                    {pl.title}
                  </h3>
                  <p className="font-sans text-xs text-ink-soft leading-relaxed mb-6">
                    {pl.desc}
                  </p>
                </div>

                <div className="pt-4 border-t border-line flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                  <span>Curator: {pl.curator}</span>
                  <span>{pl.tracksCount} Works &rarr;</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================== CHAPTER IV: ALBUMS (MASTER RELEASES) ==================== */}
      {currentSection === 'albums' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          <div className="border-b border-line pb-4 flex justify-between items-baseline">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-deep mb-2">
                Chapter IV &bull; Pressings
              </div>
              <h1 className="font-serif italic font-normal text-3xl sm:text-4xl text-ink">
                Master Releases & Vinyl Pressings
              </h1>
            </div>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
              Lossless Ledger
            </span>
          </div>

          <div className="border border-line bg-panel shadow-xs overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-soft bg-canvas-deep">
                  <th className="py-3 px-5">Cat. ID</th>
                  <th className="py-3 px-5">Title</th>
                  <th className="py-3 px-5">Artist</th>
                  <th className="py-3 px-5">Date</th>
                  <th className="py-3 px-5">Format</th>
                  <th className="py-3 px-5">Archive Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 font-sans text-xs">
                {SAMPLE_ALBUMS.map((alb) => (
                  <tr key={alb.catId} className="hover:bg-canvas-deep/50 transition-colors">
                    <td className="py-3.5 px-5 font-mono text-[10.5px] text-blue-deep font-medium">
                      {alb.catId}
                    </td>
                    <td className="py-3.5 px-5 font-serif font-medium text-sm text-ink">
                      {alb.title}
                    </td>
                    <td className="py-3.5 px-5 text-ink-soft">{alb.artist}</td>
                    <td className="py-3.5 px-5 font-mono text-[10.5px] text-ink-soft">{alb.date}</td>
                    <td className="py-3.5 px-5 font-mono text-[10px] uppercase text-ink-soft">
                      {alb.format}
                    </td>
                    <td className="py-3.5 px-5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-emerald-600 dark:text-emerald-400">
                      {alb.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== CHAPTER V: ARTISTS ==================== */}
      {currentSection === 'artists' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          <div className="border-b border-line pb-4 flex justify-between items-baseline">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-deep mb-2">
                Chapter V &bull; Atelier Residencies
              </div>
              <h1 className="font-serif italic font-normal text-3xl sm:text-4xl text-ink">
                Curators & Resident Artists
              </h1>
            </div>
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-soft">
              Sound Atelier Guild
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {SAMPLE_ARTISTS.map((artist) => (
              <div
                key={artist.name}
                className="border border-line bg-panel p-6 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 rounded-full border border-line bg-canvas-deep flex items-center justify-center font-serif italic text-lg text-ink font-semibold mb-4">
                    {artist.name.charAt(0)}
                  </div>
                  <h3 className="font-serif font-medium text-base text-ink mb-1">
                    {artist.name}
                  </h3>
                  <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-blue mb-1">
                    {artist.role}
                  </div>
                  <div className="font-mono text-[9px] uppercase text-ink-soft mb-4">
                    {artist.origin}
                  </div>
                  <p className="font-sans text-xs text-ink-soft leading-relaxed">
                    {artist.bio}
                  </p>
                </div>

                <div className="pt-4 border-t border-line mt-6">
                  <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink hover:text-blue cursor-pointer transition-colors">
                    Explore Recordings &rarr;
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
