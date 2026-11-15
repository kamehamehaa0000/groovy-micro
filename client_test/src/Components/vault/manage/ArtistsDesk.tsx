/**
 * The artists in your personal vault.
 *
 * The shared state lives in VaultManageContext.
 */
import { useVaultManage } from './VaultManageContext'
import { H2, H4 } from '../../ui/typography'
import { Button, Input } from '../../ui'
import { ArrowRight, SearchIcon, X } from 'lucide-react'

export function ArtistsDesk() {
  const {
    personalArtists,
    isLoadingArtists,
    artistsSearch,
    setArtistsSearch,
    isCreatingArtist,
    setIsCreatingArtist,
    newArtistName,
    setNewArtistName,
    newArtistBio,
    setNewArtistBio,
    isSubmittingArtist,
    setSelectedArtistFilter,
    handleCreateArtist,
    filteredArtists,
    handleTabChange,
  } = useVaultManage()

  return (
    <div className="space-y-6">
      {/* Action & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Input
            type="text"
            placeholder="Search personal artists..."
            value={artistsSearch}
            onChange={(e) => setArtistsSearch(e.target.value)}
            className="w-full font-mono text-caption py-2.5 pl-9 pr-9 bg-card rounded-full text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground/70 transition-all shadow-raised"
          />
          <SearchIcon className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />

          {artistsSearch && (
            <button
              onClick={() => setArtistsSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-caption p-1"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Artists Cards Grid */}
      {isLoadingArtists ? (
        <div className="py-24 text-center font-eyebrow text-caption uppercase tracking-widest text-muted-foreground animate-pulse">
          Loading personal artists...
        </div>
      ) : personalArtists.length === 0 ? (
        <div className="p-12 border border-dashed border-border bg-muted/20 text-center space-y-3 rounded-2xl">
          <H2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            No Personal Artists Yet
          </H2>
          <p className="font-sans text-caption text-muted-foreground max-w-md mx-auto">
            When you import audio files, artists are automatically identified
            and cataloged in your private roster with collaborator links.
          </p>
        </div>
      ) : filteredArtists.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground text-caption font-mono bg-card">
          No personal artists match "{artistsSearch}".
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredArtists.map((artist) => (
            <div
              key={artist.id}
              className="bg-card p-5 space-y-4 hover:border-foreground transition-colors shadow-xs flex flex-col justify-between rounded-2xl"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 bg-background shrink-0 overflow-hidden flex items-center justify-center font-serif text-lg text-foreground font-bold shadow-raised">
                  {artist.stageName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <H4 className="text-body font-semibold text-foreground truncate">
                      {artist.stageName}
                    </H4>
                    <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary bg-primary/10 rounded px-1 py-0.2 shrink-0 font-semibold">
                      P
                    </span>
                  </div>
                  {artist.bio ? (
                    <p className="font-sans text-caption text-muted-foreground line-clamp-2 mt-1">
                      {artist.bio}
                    </p>
                  ) : (
                    <p className="font-mono text-eyebrow text-muted-foreground/60 mt-1">
                      Personal Vault Artist
                    </p>
                  )}
                </div>
              </div>

              <div className=" flex items-center justify-between">
                <div className="font-mono text-eyebrow text-muted-foreground flex items-center gap-2">
                  <span>
                    <strong>{artist.releaseCount}</strong>{' '}
                    {artist.releaseCount === 1 ? 'Release' : 'Releases'}
                  </span>
                  <span>&bull;</span>
                  <span>
                    <strong>{artist.trackCount}</strong>{' '}
                    {artist.trackCount === 1 ? 'Track' : 'Tracks'}
                  </span>
                </div>

                <Button
                  variant="pixel"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setSelectedArtistFilter(artist.stageName)
                    handleTabChange('collection')
                  }}
                  className="font-eyebrow text-eyebrow uppercase tracking-wider px-2.5 py-1 bg-background hover:border-primary hover:text-primary transition-colors cursor-pointer font-semibold"
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
