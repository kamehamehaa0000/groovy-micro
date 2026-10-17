import { Link } from '@tanstack/react-router'
import { UploadCloud, ExternalLink } from 'lucide-react'
import { ProceduralCover } from '../../common/ProceduralCover'
import type { ArtistProfile } from '../../../types/artist'
import type { Album } from '../../../types/catalog'
import type { ProfileState } from '../hooks/useProfileForm'

interface ProfileTabProps {
  artistProfile: ArtistProfile
  albums: Album[]
  isLoadingReleases: boolean
  profile: ProfileState
}

export function ProfileTab({
  artistProfile,
  albums,
  isLoadingReleases,
  profile,
}: ProfileTabProps) {
  const {
    isUploadingAvatar,
    handleRemoveAvatar,
    avatarInputRef,
    handleAvatarSelect,
    isUploadingBanner,
    bannerInputRef,
    handleBannerSelect,
    isEditingProfile,
    setIsEditingProfile,
    handleSaveProfile,
    editStageName,
    setEditStageName,
    editSlug,
    setEditSlug,
    editBio,
    setEditBio,
    editInstagram,
    setEditInstagram,
    editWebsite,
    setEditWebsite,
    editSpotify,
    setEditSpotify,
    isSavingEdit,
    spotlightReleaseId,
    spotlightComment,
    isSavingSpotlight,
    handleClearSpotlight,
    spotlightStatus,
    spotlightStatusMessage,
    handleSaveSpotlight,
    setSpotlightReleaseId,
    setSpotlightStatus,
    setSpotlightComment,
    handleDiscardSpotlightChanges,
  } = profile

  return (
    <div className="space-y-10">
      {/* Avatar Customizer */}
      <div className="p-6 border border-border bg-card shadow-raised">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="font-serif italic text-heading text-foreground">
              Artist Avatar / Profile Picture
            </h2>
            <p className="font-sans text-caption text-muted-foreground mt-0.5">
              Square profile artwork used for artist credits, jam sessions,
              and search results.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {artistProfile.avatarUrl && (
              <button
                type="button"
                disabled={isUploadingAvatar}
                onClick={handleRemoveAvatar}
                className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-3 border border-border bg-background hover:border-destructive hover:text-destructive text-muted-foreground transition-colors cursor-pointer disabled:opacity-50"
              >
                Remove
              </button>
            )}
            <button
              type="button"
              disabled={isUploadingAvatar}
              onClick={() => avatarInputRef.current?.click()}
              className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2 self-start sm:self-auto shrink-0 shadow-xs"
            >
              <UploadCloud className="w-4 h-4 shrink-0" />
              <span>
                {isUploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
              </span>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border border-border bg-muted overflow-hidden relative shrink-0 flex items-center justify-center shadow-inner">
            {artistProfile.avatarUrl ? (
              <img
                src={artistProfile.avatarUrl}
                alt={artistProfile.stageName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="font-serif italic text-3xl sm:text-4xl text-muted-foreground select-none">
                {artistProfile.stageName.charAt(0).toUpperCase()}
              </span>
            )}
            {isUploadingAvatar && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-xs flex items-center justify-center font-mono text-eyebrow text-foreground animate-pulse text-center p-1">
                Uploading...
              </div>
            )}
          </div>

          <div className="font-mono text-caption text-muted-foreground space-y-1">
            <div className="text-foreground font-serif italic text-title">
              {artistProfile.stageName}
            </div>
            <p className="text-eyebrow text-muted-foreground/80">
              Recommended: Minimum 500 × 500px square image. An interactive
              cropper with circular guide is provided before upload.
            </p>
          </div>
        </div>
      </div>

      {/* Banner Customizer */}
      <div className="p-6 border border-border bg-card shadow-raised">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="font-serif italic text-heading text-foreground">
              Artist Profile Banner
            </h2>
            <p className="font-sans text-caption text-muted-foreground mt-0.5">
              Panoramic cover displayed across your public artist page.
              Interactive cropping and framing preview is provided before
              upload.
            </p>
          </div>

          <button
            type="button"
            disabled={isUploadingBanner}
            onClick={() => bannerInputRef.current?.click()}
            className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2 self-start sm:self-auto shrink-0"
          >
            <UploadCloud className="w-4 h-4 shrink-0" />
            <span>
              {isUploadingBanner ? 'Uploading to R2...' : 'Upload Banner'}
            </span>
          </button>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            onChange={handleBannerSelect}
            className="hidden"
          />
        </div>

        <div className="w-full h-44 sm:h-56 bg-muted border border-border overflow-hidden relative">
          {artistProfile.bannerUrl ? (
            <img
              src={artistProfile.bannerUrl}
              alt="Artist banner"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground font-mono text-caption">
              <UploadCloud className="w-8 h-8 opacity-40 mb-2 shrink-0" />
              <span>No banner uploaded yet</span>
            </div>
          )}
          {isUploadingBanner && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-xs flex items-center justify-center font-mono text-caption text-foreground animate-pulse">
              Transferring asset to Cloudflare R2 storage...
            </div>
          )}
        </div>
      </div>

      {/* Identity & Details Editor */}
      <div className="p-6 border border-border bg-card shadow-raised">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-border-soft">
          <div>
            <h2 className="font-serif italic text-heading text-foreground">
              Identity & Presentation
            </h2>
            <p className="font-sans text-caption text-muted-foreground mt-0.5">
              Customize your public stage name, biography, and external
              links.
            </p>
          </div>

          {!isEditingProfile && (
            <button
              type="button"
              onClick={() => setIsEditingProfile(true)}
              className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-border bg-background hover:border-foreground text-foreground transition-colors cursor-pointer"
            >
              Edit Details
            </button>
          )}
        </div>

        {isEditingProfile ? (
          <form
            onSubmit={handleSaveProfile}
            className="flex flex-col gap-5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1.5">
                  Stage Name
                </label>
                <input
                  type="text"
                  required
                  value={editStageName}
                  onChange={(e) => setEditStageName(e.target.value)}
                  className="w-full font-serif italic text-body py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground"
                />
              </div>

              <div>
                <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1.5">
                  Vanity Slug
                </label>
                <input
                  type="text"
                  required
                  value={editSlug}
                  onChange={(e) => setEditSlug(e.target.value)}
                  className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground"
                />
              </div>
            </div>

            <div>
              <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1.5">
                Biography
              </label>
              <textarea
                rows={4}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="w-full font-sans text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground resize-y leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                  Instagram
                </label>
                <input
                  type="url"
                  value={editInstagram}
                  onChange={(e) => setEditInstagram(e.target.value)}
                  placeholder="https://instagram.com/..."
                  className="w-full font-mono text-caption py-1.5 px-2.5 border border-border bg-background text-foreground"
                />
              </div>
              <div>
                <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                  Website
                </label>
                <input
                  type="url"
                  value={editWebsite}
                  onChange={(e) => setEditWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full font-mono text-caption py-1.5 px-2.5 border border-border bg-background text-foreground"
                />
              </div>
              <div>
                <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                  Spotify
                </label>
                <input
                  type="url"
                  value={editSpotify}
                  onChange={(e) => setEditSpotify(e.target.value)}
                  placeholder="https://open.spotify.com/..."
                  className="w-full font-mono text-caption py-1.5 px-2.5 border border-border bg-background text-foreground"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isSavingEdit}
                className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-5 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
              >
                {isSavingEdit ? 'Saving...' : 'Save Profile Changes'}
              </button>
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4 text-caption font-sans text-foreground">
            <div>
              <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                Biography
              </span>
              <p className="leading-relaxed whitespace-pre-line text-muted-foreground">
                {artistProfile.bio || 'No biography set yet.'}
              </p>
            </div>

            {artistProfile.socialLinks &&
              Object.keys(artistProfile.socialLinks).length > 0 && (
                <div>
                  <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-2">
                    Social Channels
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(artistProfile.socialLinks).map(
                      ([k, v]) => (
                        <a
                          key={k}
                          href={v}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-eyebrow py-1 px-2.5 border border-border bg-background hover:border-foreground text-foreground capitalize inline-flex items-center gap-1"
                        >
                          <span>{k}</span>
                          <ExternalLink className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                        </a>
                      ),
                    )}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Artist Spotlight & Pick Customizer */}
      {(() => {
        const currentPinnedRelease = artistProfile.pinnedReleaseId
          ? albums.find((a) => a.id === artistProfile.pinnedReleaseId)
          : null
        const isSpotlightDirty =
          spotlightReleaseId !== (artistProfile.pinnedReleaseId || '') ||
          spotlightComment.trim() !== (artistProfile.pinnedComment || '')

        return (
          <div className="p-6 sm:p-7 border border-border bg-card shadow-raised space-y-6 relative rounded-control">
            {/* Header & Status Indicator */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-soft">
              <div>
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary font-semibold px-2 py-0.5 rounded-control border border-primary/30 bg-primary/10">
                    ✦ Profile Spotlight
                  </span>
                  {artistProfile.pinnedReleaseId ? (
                    <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary bg-primary/10 border border-primary/30 px-2 py-0.5 rounded-control flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                      <span>
                        Active:{' '}
                        {currentPinnedRelease
                          ? `"${currentPinnedRelease.title}"`
                          : 'Custom Pick'}
                      </span>
                    </span>
                  ) : (
                    <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground bg-background border border-border px-2 py-0.5 rounded-control flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      <span>Active: Automatic Latest Drop</span>
                    </span>
                  )}
                  {isSpotlightDirty && (
                    <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-warning bg-warning-soft border border-warning/30 px-2 py-0.5 rounded-control flex items-center gap-1 font-semibold animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                      <span>Unsaved Changes</span>
                    </span>
                  )}
                </div>
                <h2 className="font-serif italic text-heading text-foreground">
                  Artist Pick &amp; Spotlight
                </h2>
                <p className="font-sans text-caption text-muted-foreground mt-0.5 max-w-xl">
                  Feature a chosen release and personal note at the top of
                  your public artist profile. When none is selected, your
                  newest release is showcased automatically.
                </p>
              </div>

              {artistProfile.pinnedReleaseId && (
                <button
                  type="button"
                  disabled={isSavingSpotlight}
                  onClick={handleClearSpotlight}
                  className="font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-border bg-background hover:border-destructive hover:text-destructive text-muted-foreground transition-colors cursor-pointer self-start sm:self-auto rounded-control shrink-0"
                >
                  Reset to Latest Release
                </button>
              )}
            </div>

            {/* Inline Confirmation Alert Strip */}
            {spotlightStatus === 'saved' && (
              <div className="flex items-center justify-between gap-3 p-3.5 bg-success-soft border border-success/40 rounded-control text-success font-mono text-caption shadow-raised animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-success text-success-foreground flex items-center justify-center shrink-0 font-bold text-caption">
                    ✓
                  </span>
                  <div className="min-w-0">
                    <span className="font-semibold block truncate">
                      Spotlight Saved &amp; Synced!
                    </span>
                    <span className="font-sans text-eyebrow opacity-80 block truncate">
                      {spotlightStatusMessage ||
                        'Your public artist profile has been updated.'}
                    </span>
                  </div>
                </div>
                {artistProfile.slug && (
                  <Link
                    to="/artists/$idOrSlug"
                    params={{ idOrSlug: artistProfile.slug }}
                    target="_blank"
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-1 px-2.5 border border-success bg-background/50 hover:bg-success/20 rounded-control transition-colors shrink-0 flex items-center gap-1"
                  >
                    <span>View Live</span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </Link>
                )}
              </div>
            )}

            {spotlightStatus === 'cleared' && (
              <div className="flex items-center gap-2.5 p-3.5 bg-primary/10 border border-primary/30 rounded-control text-primary font-mono text-caption shadow-raised animate-in fade-in slide-in-from-top-1 duration-200">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 font-bold text-caption">
                  ✓
                </span>
                <div>
                  <span className="font-semibold block">
                    Spotlight Reset to Dynamic Mode
                  </span>
                  <span className="font-sans text-eyebrow opacity-80 block">
                    Your public profile will now dynamically showcase your
                    newest catalog release.
                  </span>
                </div>
              </div>
            )}

            {spotlightStatus === 'error' && (
              <div className="flex items-center gap-2.5 p-3.5 bg-destructive-soft border border-destructive/40 rounded-control text-destructive font-mono text-caption shadow-raised animate-in fade-in slide-in-from-top-1 duration-200">
                <span className="w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shrink-0 font-bold text-caption">
                  ✕
                </span>
                <div>
                  <span className="font-semibold block">
                    Failed to Update Spotlight
                  </span>
                  <span className="font-sans text-eyebrow opacity-80 block">
                    {spotlightStatusMessage ||
                      'An unexpected error occurred while saving.'}
                  </span>
                </div>
              </div>
            )}

            <form
              onSubmit={handleSaveSpotlight}
              className="flex flex-col gap-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Release Selector */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-medium">
                      Spotlighted Release
                    </label>
                    {isLoadingReleases && (
                      <span className="font-mono text-eyebrow text-muted-foreground animate-pulse">
                        Loading catalog...
                      </span>
                    )}
                  </div>
                  <select
                    value={spotlightReleaseId}
                    onChange={(e) => {
                      setSpotlightReleaseId(e.target.value)
                      setSpotlightStatus('idle')
                    }}
                    className="w-full font-serif italic text-body py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground rounded-control transition-colors"
                  >
                    <option value="">
                      -- Automatic Default: Always show latest release --
                    </option>
                    {albums.map((alb) => (
                      <option key={alb.id} value={alb.id}>
                        {alb.title} ({alb.albumType || 'Release'} &bull;{' '}
                        {alb.releaseDate
                          ? new Date(alb.releaseDate).getFullYear()
                          : 'Upcoming'}
                        )
                      </option>
                    ))}
                  </select>
                  <p className="font-sans text-eyebrow text-muted-foreground mt-1.5">
                    {spotlightReleaseId
                      ? 'Pinned release stays locked at the top of your right column until changed or deleted.'
                      : 'Dynamic mode: Groovy automatically presents your newest published drop.'}
                  </p>
                  {albums.length === 0 && !isLoadingReleases && (
                    <p className="font-mono text-eyebrow text-warning mt-1">
                      No published releases found yet. Upload a single or
                      album in the Releases tab to feature it here.
                    </p>
                  )}
                </div>

                {/* Optional Comment / Note */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground font-medium">
                      Artist Note / Quote (Optional)
                    </label>
                    {spotlightReleaseId && (
                      <span
                        className={`font-mono text-eyebrow ${
                              spotlightComment.length > 250
                                ? 'text-warning font-semibold'
                                : 'text-muted-foreground'
                            }`}
                      >
                        {spotlightComment.length}/280
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={280}
                      value={spotlightComment}
                      disabled={!spotlightReleaseId}
                      onChange={(e) => {
                        setSpotlightComment(e.target.value)
                        setSpotlightStatus('idle')
                      }}
                      placeholder={
                        spotlightReleaseId
                          ? 'e.g. Turn the volume up! Celebrating our new drop with you all.'
                          : 'Select a specific release first to add a custom quote'
                      }
                      className="w-full font-sans text-caption py-2 pl-3 pr-8 border border-border bg-background text-foreground focus:outline-none focus:border-foreground disabled:opacity-50 disabled:bg-muted rounded-control transition-colors"
                    />
                    {spotlightReleaseId && spotlightComment && (
                      <button
                        type="button"
                        onClick={() => {
                          setSpotlightComment('')
                          setSpotlightStatus('idle')
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-caption font-mono cursor-pointer"
                        title="Clear note"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <p className="font-sans text-eyebrow text-muted-foreground mt-1.5">
                    {spotlightReleaseId
                      ? 'Appears in italic quotation marks directly above the release card.'
                      : 'Notes are exclusive to manually pinned releases.'}
                  </p>
                </div>
              </div>

              {/* Live Preview of the Spotlight Card */}
              {(() => {
                const previewRelease = spotlightReleaseId
                  ? albums.find((a) => a.id === spotlightReleaseId)
                  : albums[0]

                if (!previewRelease) {
                  return (
                    <div className="pt-2">
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-2">
                        Public Profile Live Preview
                      </span>
                      <div className="max-w-md border border-dashed border-border rounded-control bg-background/40 p-5 text-center text-muted-foreground font-mono text-caption">
                        Upload a release to preview the spotlight card here.
                      </div>
                    </div>
                  )
                }

                return (
                  <div className="pt-2">
                    <div className="flex items-center justify-between gap-2 max-w-md mb-2">
                      <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block">
                        Public Profile Live Preview &bull; Right Column Top
                      </span>
                      {artistProfile.slug && (
                        <Link
                          to="/artists/$idOrSlug"
                          params={{ idOrSlug: artistProfile.slug }}
                          target="_blank"
                          className="font-eyebrow text-eyebrow uppercase tracking-wider text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <span>View Live Profile</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </Link>
                      )}
                    </div>

                    <div className="max-w-md border border-border rounded-control bg-background p-4 sm:p-5 shadow-raised space-y-3">
                      <div className="flex items-center justify-between gap-2 border-b border-border-soft pb-2.5">
                        <div className="flex items-center gap-2">
                          {artistProfile.avatarUrl && (
                            <div className="w-5 h-5 rounded-full overflow-hidden border border-border bg-background shrink-0">
                              <img
                                src={artistProfile.avatarUrl}
                                alt={artistProfile.stageName}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary font-semibold flex items-center gap-1.5">
                            <span>
                              {spotlightReleaseId
                                ? '✦ Artist Pick'
                                : '✦ Latest Drop'}
                            </span>
                          </span>
                        </div>
                        {previewRelease.albumType && (
                          <span className="font-eyebrow text-eyebrow uppercase tracking-wider px-1.5 py-0.5 rounded-control border border-border bg-background text-muted-foreground">
                            {previewRelease.albumType}
                          </span>
                        )}
                      </div>

                      {spotlightReleaseId && spotlightComment.trim() && (
                        <p className="font-serif italic text-caption text-foreground/90 leading-relaxed bg-card p-2.5 rounded-control border border-border-soft">
                          "{spotlightComment.trim()}"
                        </p>
                      )}

                      <div className="flex items-center gap-3.5 group">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-control bg-muted border border-border shrink-0 overflow-hidden relative shadow-xs">
                          {previewRelease.coverImageUrl ? (
                            <img
                              src={previewRelease.coverImageUrl}
                              alt={previewRelease.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <ProceduralCover
                              size="sm"
                              title={previewRelease.title}
                              artistName={artistProfile.stageName}
                              className="w-full h-full rounded-none"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-sans font-semibold text-body sm:text-title text-foreground truncate">
                            {previewRelease.title}
                          </h4>
                          <p className="font-mono text-eyebrow text-muted-foreground truncate mt-0.5">
                            {previewRelease.releaseDate
                              ? new Date(
                                  previewRelease.releaseDate,
                                ).getFullYear()
                              : 'Recent'}{' '}
                            &bull; {previewRelease.totalTracks}{' '}
                            {previewRelease.totalTracks === 1
                              ? 'cut'
                              : 'cuts'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Actions Bar */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingSpotlight}
                  className={`font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-5 transition-all cursor-pointer rounded-control flex items-center gap-2 ${
                        spotlightStatus === 'saved'
                          ? 'bg-success text-success-foreground border border-success shadow-sm'
                          : isSpotlightDirty
                            ? 'bg-foreground text-background hover:bg-primary hover:text-primary-foreground shadow-sm'
                            : 'bg-foreground text-background hover:opacity-90'
                      } disabled:opacity-50`}
                >
                  {isSavingSpotlight ? (
                    <>
                      <span className="w-3 h-3 border-2 border-background border-t-transparent rounded-full animate-spin inline-block" />
                      <span>Saving Changes...</span>
                    </>
                  ) : spotlightStatus === 'saved' ? (
                    <>
                      <span>✓ Saved to Profile!</span>
                    </>
                  ) : isSpotlightDirty ? (
                    <>
                      <span>Save Artist Pick</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                    </>
                  ) : (
                    <span>Save Artist Pick</span>
                  )}
                </button>

                {isSpotlightDirty && (
                  <button
                    type="button"
                    onClick={handleDiscardSpotlightChanges}
                    disabled={isSavingSpotlight}
                    className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border bg-background hover:bg-card text-muted-foreground transition-colors cursor-pointer rounded-control"
                  >
                    Revert Changes
                  </button>
                )}
              </div>
            </form>
          </div>
        )
      })()}
    </div>
  )
}
