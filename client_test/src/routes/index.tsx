import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuthStore } from '../stores/auth.store'
import { SpiralCoverArtBig, SvgArtworkSpiral } from '../Components/icons'

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

function HomeComponent() {
  const { user, isAuthenticated, isLoading } = useAuthStore()

  return (
    <div className="space-y-10">
      {/* Editorial Hero Section */}
      <section className="border border-line bg-panel p-8 sm:p-12 shadow-xs relative overflow-hidden">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-deep mb-3">
          Introduction · Meaning of groove
        </div>
        <h1 className="font-serif italic font-normal text-3xl sm:text-5xl text-ink leading-[1.08] mb-4 max-w-2xl">
          A collection of sounds, Straight to your ears.
        </h1>
        <p className="font-sans text-xs sm:text-sm text-ink-soft max-w-xl leading-relaxed mb-8">
          Crafted for uninterrupted listening. Powered by the community of
          listeners, curators and creators. Explore and experience the sound
          with never-before-felt experience.
        </p>

        <div className="flex flex-wrap items-center gap-4 relative z-10">
          {!isAuthenticated && !isLoading ? (
            <>
              <Link
                to="/login"
                className="bg-ink text-canvas border border-ink py-3 px-6 font-mono text-[11px] uppercase tracking-[0.12em] font-medium transition-all hover:bg-canvas hover:text-ink shadow-2xs"
              >
                Enter the collective &rarr;
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
        <SvgArtworkSpiral />
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
                <SpiralCoverArtBig i={i} />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-canvas/60">
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] px-2.5 py-1 bg-ink text-canvas">
                    Inspect Master
                  </span>
                </div>
              </div>
              <div className="font-serif font-medium text-sm text-ink mb-0.5">
                {track.title}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-soft">
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
                <span className="font-mono text-[10.5px] uppercase tracking-widest text-ink-soft">
                  Identifier:
                </span>
                <span className="font-mono text-[11px] text-ink truncate max-w-50">
                  {user.id}
                </span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="font-mono text-[10.5px] uppercase tracking-widest text-ink-soft">
                  Email:
                </span>
                <span className="text-ink">{user.email}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="font-mono text-[10.5px] uppercase tracking-widest text-ink-soft">
                  Curator Name:
                </span>
                <span className="font-medium text-ink">{user.displayName}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="font-mono text-[10.5px] uppercase tracking-widest text-ink-soft">
                  Access Role:
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-blue font-medium">
                  {user.role}
                </span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="font-mono text-[10.5px] uppercase tracking-widest text-ink-soft">
                  Email Status:
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest">
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
                className="font-mono text-[10.5px] uppercase tracking-widest text-blue hover:underline"
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
                <span className="font-mono text-[10.5px] uppercase tracking-widest text-ink-soft">
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
                Sign in to query database subscription entitlements and vault
                limits.
              </p>
              <Link
                to="/register"
                className="font-mono text-[10.5px] uppercase tracking-widest text-blue hover:underline"
              >
                Join membership collective &rarr;
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
