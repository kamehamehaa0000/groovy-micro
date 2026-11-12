/**
 * The artists in your personal vault.
 *
 * The shared state lives in VaultManageContext.
 */
import { useVaultManage } from './VaultManageContext'

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
                <input
                  type="text"
                  placeholder="Search personal artists..."
                  value={artistsSearch}
                  onChange={(e) => setArtistsSearch(e.target.value)}
                  className="w-full pl-8 pr-8 py-2 border border-border bg-card text-caption text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-foreground transition-colors font-sans shadow-raised"
                />
                <span className="absolute left-2.5 top-2.5 text-muted-foreground text-caption">
                  🔍
                </span>
                {artistsSearch && (
                  <button
                    onClick={() => setArtistsSearch('')}
                    className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground text-caption cursor-pointer font-mono"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Inline Artist Creator Form */}
            {isCreatingArtist && (
              <form
                onSubmit={handleCreateArtist}
                className="p-5 border border-border bg-card space-y-4 shadow-xs"
              >
                <div className="flex items-center justify-between border-b border-border pb-2 font-eyebrow text-caption uppercase tracking-wider text-foreground font-bold">
                  <span>Create Sandboxed Personal Artist</span>
                  <button
                    type="button"
                    onClick={() => setIsCreatingArtist(false)}
                    className="text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                      Stage / Artist Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Miles Davis"
                      value={newArtistName}
                      onChange={(e) => setNewArtistName(e.target.value)}
                      className="w-full px-3 py-2 border border-border bg-background text-caption text-foreground focus:outline-none focus:border-foreground font-sans"
                    />
                  </div>
                  <div>
                    <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                      Bio / Notes (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Private vault live recordings"
                      value={newArtistBio}
                      onChange={(e) => setNewArtistBio(e.target.value)}
                      className="w-full px-3 py-2 border border-border bg-background text-caption text-foreground focus:outline-none focus:border-foreground font-sans"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsCreatingArtist(false)}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-3 border border-border text-muted-foreground hover:text-foreground bg-background cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingArtist || !newArtistName.trim()}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 bg-foreground text-background font-semibold hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmittingArtist ? 'Creating...' : 'Save Artist'}
                  </button>
                </div>
              </form>
            )}

            {/* Artists Cards Grid */}
            {isLoadingArtists ? (
              <div className="py-24 text-center font-eyebrow text-caption uppercase tracking-widest text-muted-foreground animate-pulse">
                Loading personal artists...
              </div>
            ) : personalArtists.length === 0 ? (
              <div className="p-12 border border-dashed border-border bg-muted/20 text-center space-y-3">
                <h3 className="font-serif italic text-2xl text-foreground font-normal">
                  No Personal Artists Yet
                </h3>
                <p className="font-sans text-caption text-muted-foreground max-w-md mx-auto">
                  When you import audio files, artists are automatically
                  identified and cataloged in your private roster with
                  collaborator links.
                </p>
                <button
                  type="button"
                  onClick={() => setIsCreatingArtist(true)}
                  className="mt-2 font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 bg-foreground text-background font-semibold cursor-pointer"
                >
                  + Create Artist Manually
                </button>
              </div>
            ) : filteredArtists.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-caption font-mono border border-border bg-card">
                No personal artists match "{artistsSearch}".
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredArtists.map((artist) => (
                  <div
                    key={artist.id}
                    className="border border-border bg-card p-5 space-y-4 hover:border-foreground transition-colors shadow-xs flex flex-col justify-between"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 border border-border bg-background shrink-0 overflow-hidden flex items-center justify-center font-serif text-lg text-foreground font-bold shadow-raised">
                        {artist.stageName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-serif italic text-lg text-foreground font-medium truncate">
                            {artist.stageName}
                          </h4>
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-1 py-0.2 shrink-0 font-semibold">
                            Personal
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

                    <div className="pt-3 border-t border-border flex items-center justify-between">
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

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedArtistFilter(artist.stageName)
                          handleTabChange('collection')
                        }}
                        className="font-eyebrow text-eyebrow uppercase tracking-wider px-2.5 py-1 border border-border bg-background hover:border-primary hover:text-primary transition-colors cursor-pointer font-semibold"
                      >
                        View Music
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
      
  )
}
