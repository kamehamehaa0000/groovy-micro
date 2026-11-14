import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  usersApi,
  type PublicUserProfile,
} from '../lib/users.api'
import { socialApi, type RelationshipStatus } from '../lib/social.api'
import { ApiError } from '../lib/api'
import { useAuthStore } from '../stores/auth.store'
import { usePlayerStore } from '../stores/player.store'
import { useAuthModalStore } from '../stores/auth-modal.store'
import { toPlayerTrack } from '../lib/player-track'
import { notify } from '../lib/toast'
import { LockIconSVG } from '../Components/Icons'
import { SongRow } from '../Components/common/SongRow'
import { MediaTile } from '../Components/common/MediaTile'
import { PlaylistCover } from '../Components/PlaylistCover'
import { MediaGrid } from '../Components/media/MediaGrid'
import { Avatar } from '../Components/ui/Avatar'
import { Badge } from '../Components/ui/Badge'
import { ButtonLink } from '../Components/ui/ButtonLink'
import {
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonGrid,
} from '../Components/ui/EmptyState'
import { SectionTitle } from '../Components/ui/SectionTitle'
import { H1 } from '../Components/ui/typography'
import { Tabs } from '../Components/ui/Tabs'
import { FollowButton } from '../Components/social/FollowButton'
import { PeopleListModal } from '../Components/social/PeopleListModal'

type LibraryTab = 'playlists' | 'albums' | 'liked'

export const Route = createFileRoute('/users/$id')({
  // The tab is part of the address, so a section can be linked to and the
  // back button works.
  validateSearch: (search: Record<string, unknown>): { tab?: LibraryTab } => {
    const tab = search.tab
    return {
      tab:
        tab === 'playlists' || tab === 'albums' || tab === 'liked'
          ? tab
          : undefined,
    }
  },
  component: UserProfileComponent,
})

function formatDate(dateStr?: string | Date) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  })
}

function UserProfileComponent() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const currentUser = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const openAuthModal = useAuthModalStore((s) => s.openAuthModal)
  // Selected slices only: a whole-store subscription re-rendered this page on
  // every playback tick.
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const playTrack = usePlayerStore((s) => s.playTrack)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  const [isActing, setIsActing] = useState(false)
  const [peopleList, setPeopleList] = useState<
    'followers' | 'following' | null
  >(null)

  const search = Route.useSearch()
  const activeTab: LibraryTab = search.tab ?? 'playlists'

  // The tab lives in the address, so a section can be linked to and the back
  // button works.
  const setTab = (tab: LibraryTab) => {
    navigate({
      to: '/users/$id',
      params: { id },
      search: { tab },
    })
  }

  const profileQuery = useQuery({
    queryKey: ['users', id],
    queryFn: () => usersApi.getUserProfile(id),
    staleTime: 60_000,
  })

  const libraryQuery = useQuery({
    queryKey: ['users', id, 'library'],
    queryFn: () => usersApi.getUserLibrary(id),
    // A private library is an answer, not a transient failure.
    retry: false,
    staleTime: 60_000,
  })

  const profile = profileQuery.data?.user ?? null
  const relationship = profileQuery.data?.relationship ?? 'NONE'

  // The server answers a private library with a 403 and the privacy level
  // that blocked it. The fetch wrapper keeps both.
  const libraryPrivacy = useMemo(() => {
    const error = libraryQuery.error
    if (!(error instanceof ApiError) || error.statusCode !== 403) return null
    const privacy = error.libraryPrivacy
    return privacy === 'FOLLOWERS_ONLY' || privacy === 'PUBLIC'
      ? privacy
      : 'PRIVATE'
  }, [libraryQuery.error])

  const isOwnProfile = currentUser?.id === id || relationship === 'SELF'

  // The relationship and the follower count live in the query cache, so the
  // header never disagrees with what the server just said.
  const setRelationship = (
    next: RelationshipStatus,
    followerDelta: number,
  ) => {
    queryClient.setQueryData<{
      user: PublicUserProfile
      relationship: RelationshipStatus
    }>(['users', id], (prev) =>
      prev
        ? {
            user: {
              ...prev.user,
              followersCount: Math.max(
                0,
                prev.user.followersCount + followerDelta,
              ),
            },
            relationship: next,
          }
        : prev,
    )
  }

  const refreshLibrary = () => {
    void queryClient.invalidateQueries({ queryKey: ['users', id, 'library'] })
  }

  // Social Action Handlers
  const handleFollowAction = async () => {
    if (!isAuthenticated) {
      openAuthModal()
      return
    }
    setIsActing(true)
    try {
      if (
        relationship === 'FOLLOWING' ||
        relationship === 'FRIENDS' ||
        relationship === 'PENDING_SENT'
      ) {
        // Unfollow or Cancel Request
        await socialApi.unfollowUser(id)
        setRelationship('NONE', -1)
        // The library may have been unlocked by the follow, or locked again.
        refreshLibrary()
      } else {
        // Follow target
        const res = await socialApi.followUser(id)
        if (res.status === 'PENDING') {
          setRelationship('PENDING_SENT', 0)
        } else {
          setRelationship(res.isMutualFriend ? 'FRIENDS' : 'FOLLOWING', 1)
          refreshLibrary()
        }
      }
    } catch (err: unknown) {
      notify.error(
        err instanceof Error ? err.message : 'Could not update that follow.',
      )
    } finally {
      setIsActing(false)
    }
  }

  const handleAcceptRequest = async () => {
    setIsActing(true)
    try {
      const res = await socialApi.acceptRequest(id)
      setRelationship(res.isMutualFriend ? 'FRIENDS' : 'FOLLOWING', 1)
      refreshLibrary()
    } catch (err: unknown) {
      notify.error(
        err instanceof Error ? err.message : 'Could not accept that request.',
      )
    } finally {
      setIsActing(false)
    }
  }

  const handleRejectRequest = async () => {
    setIsActing(true)
    try {
      await socialApi.rejectRequest(id)
      setRelationship('NONE', 0)
    } catch (err: unknown) {
      notify.error(
        err instanceof Error ? err.message : 'Could not decline that request.',
      )
    } finally {
      setIsActing(false)
    }
  }

  // The liked songs become player tracks once, not on every render.
  const likedTracks = useMemo(
    () =>
      (libraryQuery.data?.likedSongs.items ?? []).map((song) =>
        toPlayerTrack({
          id: song.id,
          title: song.title,
          artistId: song.artistId,
          artistName: song.artistName,
          artistSlug: song.artistSlug,
          coverImageUrl: song.coverImageUrl,
          durationSeconds: song.durationSeconds,
          audioUrl: song.audioUrl,
          isExplicit: song.isExplicit,
        }),
      ),
    [libraryQuery.data?.likedSongs.items],
  )

  const handlePlayLikedSong = (index: number) => {
    const track = likedTracks[index]
    if (!track) return
    if (currentTrack?.id === track.id) {
      togglePlay()
      return
    }
    playTrack(
      track,
      likedTracks,
      index,
      `user-library-liked:${id}`,
      `${profile?.displayName}'s Liked Tracks`,
    )
  }

  if (profileQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-6 border-b border-border pb-8">
          <Skeleton className="h-24 w-24 rounded-full sm:h-32 sm:w-32" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-10 w-72" />
        <SkeletonGrid count={8} itemClassName="aspect-square" />
      </div>
    )
  }

  if (!profile) {
    const isNotFound =
      profileQuery.error instanceof ApiError &&
      profileQuery.error.statusCode === 404

    return (
      <ErrorState
        title={isNotFound ? 'User not found' : 'Something went wrong'}
        description={
          isNotFound
            ? 'This listener or artist profile does not exist, or has been deactivated.'
            : profileQuery.error instanceof Error
              ? profileQuery.error.message
              : 'The profile could not be loaded.'
        }
        // Retrying a missing profile only ever fails again.
        onRetry={
          isNotFound ? undefined : () => void profileQuery.refetch()
        }
        className="mx-auto max-w-xl"
      />
    )
  }

  const library = libraryQuery.data
  const createdCount = library?.createdPlaylists.length ?? 0
  const savedPlaylistsCount = library?.savedPlaylists.length ?? 0
  const totalPlaylistsCount = createdCount + savedPlaylistsCount
  const savedAlbumsCount =
    (library?.savedAlbums.length ?? 0) +
    (library?.presavedReleases.length ?? 0)
  const likedSongsCount = library?.likedSongs.totalCount ?? 0

  return (
    <div>
      {/* User Hero Header */}
      <div className="p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 sm:gap-8">
          {/* Avatar */}
          <Avatar
            src={profile.avatarUrl}
            name={profile.displayName}
            size="hero"
            className="border-2 sm:h-32 sm:w-32"
          />

          {/* User Bio & Actions */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
              {profile.isPrivateAccount && (
                <Badge tone="neutral">
                  <LockIconSVG className="w-2.5 h-2.5" />
                  Private Account
                </Badge>
              )}
              {relationship === 'FRIENDS' && (
                <Badge tone="success">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  Mutual Friends
                </Badge>
              )}
            </div>

            <H1>{profile.displayName}</H1>

            <p className="font-mono text-eyebrow text-muted-foreground mb-6">
              Member since {formatDate(profile.createdAt)}
            </p>

            {/* Metrics Strip */}
            <div className="flex items-center justify-center sm:justify-start gap-6 sm:gap-8">
              <button
                type="button"
                onClick={() => setPeopleList('followers')}
                className="group cursor-pointer rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="font-mono text-title sm:text-lg font-bold text-foreground block transition-colors group-hover:text-primary">
                  {profile.followersCount}
                </span>
                <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
                  Followers
                </span>
              </button>

              <button
                type="button"
                onClick={() => setPeopleList('following')}
                className="group cursor-pointer rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="font-mono text-title sm:text-lg font-bold text-foreground block transition-colors group-hover:text-primary">
                  {profile.followingCount}
                </span>
                <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
                  Following
                </span>
              </button>

              <button
                type="button"
                onClick={() => setTab('playlists')}
                className="group cursor-pointer rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <span className="font-mono text-title sm:text-lg font-bold text-foreground block transition-colors group-hover:text-primary">
                  {profile.publicPlaylistsCount}
                </span>
                <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
                  Playlists
                </span>
              </button>
            </div>
          </div>

          {/* Social Relationship Action Button */}
          <div className="w-full shrink-0 flex items-center gap-3 sm:w-auto">
            {isOwnProfile ? (
              <ButtonLink
                to="/profile"
                variant="outline"
                size="md"
                block
                className="sm:w-auto"
              >
                Edit Profile
              </ButtonLink>
            ) : (
              <FollowButton
                relationship={relationship}
                isPrivateAccount={profile.isPrivateAccount}
                isActing={isActing}
                onFollow={handleFollowAction}
                onAccept={handleAcceptRequest}
                onDecline={handleRejectRequest}
                block
                className="sm:w-auto"
              />
            )}
          </div>
        </div>
      </div>

      {/* Shared Library Section */}
      <div>
        {libraryPrivacy ? (
          <div className="border border-border bg-card p-8 sm:p-12 text-center shadow-raised">
            <div className="w-12 h-12 rounded-full bg-secondary/20 border border-border flex items-center justify-center mx-auto mb-4 text-muted-foreground">
              <LockIconSVG className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-2xl text-foreground mb-2">
              {libraryPrivacy === 'FOLLOWERS_ONLY'
                ? 'Followers-Only Library'
                : 'Private Library'}
            </h3>
            <p className="font-sans text-caption text-muted-foreground max-w-md mx-auto mb-6 leading-relaxed">
              {libraryPrivacy === 'FOLLOWERS_ONLY'
                ? `Follow ${profile.displayName} to unlock access to their shared playlists, saved albums, and liked tracks.`
                : `${profile.displayName} has chosen to keep their music library private.`}
            </p>

            {libraryPrivacy === 'FOLLOWERS_ONLY' && (
              <FollowButton
                relationship={relationship}
                isPrivateAccount={profile.isPrivateAccount}
                isActing={isActing}
                onFollow={handleFollowAction}
                followLabel="Follow to Unlock"
              />
            )}
          </div>
        ) : libraryQuery.isLoading ? (
          <SkeletonGrid count={8} itemClassName="aspect-square" />
        ) : libraryQuery.isError ? (
          <ErrorState
            title="The library could not be loaded"
            description={
              libraryQuery.error instanceof Error
                ? libraryQuery.error.message
                : 'The request could not be completed.'
            }
            onRetry={() => void libraryQuery.refetch()}
          />
        ) : library ? (
          <div>
            {/* Library Navigation Tabs */}
            <Tabs
              variant="underline"
              ariaLabel="Library sections"
              value={activeTab}
              onChange={(next) => setTab(next as LibraryTab)}
              className="mb-6"
              items={[
                {
                  id: 'playlists',
                  label: 'Playlists',
                  count: totalPlaylistsCount,
                },
                {
                  id: 'albums',
                  label: 'Albums & Releases',
                  count: savedAlbumsCount,
                },
                { id: 'liked', label: 'Liked Songs', count: likedSongsCount },
              ]}
            />

            {/* TAB 1: PLAYLISTS */}
            {activeTab === 'playlists' && (
              <div className="space-y-10">
                {/* Created Playlists */}
                <div>
                  <SectionTitle
                    title={`Created by ${profile.displayName}`}
                    subtitle={`${createdCount} public ${createdCount === 1 ? 'playlist' : 'playlists'}`}
                  />

                  {createdCount === 0 ? (
                    <EmptyState
                      title="No public playlists yet"
                      description={`${profile.displayName} has not published a playlist.`}
                    />
                  ) : (
                    <MediaGrid maxColumns={6}>
                      {library.createdPlaylists.map((pl) => (
                        <MediaTile
                          key={pl.id}
                          to="/playlists/$id"
                          params={{ id: pl.id }}
                          title={pl.title}
                          subtitle={`${pl.tracksCount} tracks · ${pl.savesCount} saves`}
                          customCover={
                            <PlaylistCover
                              coverImageUrl={pl.coverImageUrl}
                              title={pl.title}
                              className="w-full h-full"
                            />
                          }
                          fallbackInitials="♫"
                        />
                      ))}
                    </MediaGrid>
                  )}
                </div>

                {/* Saved Playlists */}
                {savedPlaylistsCount > 0 && (
                  <div>
                    <SectionTitle
                      title="Saved Playlists"
                      subtitle={`${savedPlaylistsCount} ${savedPlaylistsCount === 1 ? 'playlist' : 'playlists'} ${profile.displayName} kept`}
                    />
                    <MediaGrid maxColumns={6}>
                      {library.savedPlaylists.map((pl) => (
                        <MediaTile
                          key={pl.id}
                          to="/playlists/$id"
                          params={{ id: pl.id }}
                          title={pl.title}
                          subtitle={`By ${pl.ownerName || 'Curator'} · ${pl.tracksCount} tracks`}
                          customCover={
                            <PlaylistCover
                              coverImageUrl={pl.coverImageUrl}
                              title={pl.title}
                              className="w-full h-full"
                            />
                          }
                          fallbackInitials="♫"
                        />
                      ))}
                    </MediaGrid>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: ALBUMS & RELEASES */}
            {activeTab === 'albums' && (
              <div className="space-y-10">
                {/* Upcoming Pre-saved Releases */}
                {library.presavedReleases.length > 0 && (
                  <div>
                    <SectionTitle
                      title="Pre-Saved Drops"
                      subtitle={`${library.presavedReleases.length} upcoming ${library.presavedReleases.length === 1 ? 'release' : 'releases'}`}
                    />
                    <MediaGrid maxColumns={6}>
                      {library.presavedReleases.map((album) => (
                        <MediaTile
                          key={album.id}
                          to="/albums/$idOrSlug"
                          params={{ idOrSlug: album.slug || album.id }}
                          title={album.title}
                          subtitle={`${album.artistName} · Dropping ${formatDate(album.releaseDate)}`}
                          imageUrl={album.coverImageUrl}
                          artistName={album.artistName}
                          badge={
                            <span className="bg-card/90 backdrop-blur-md text-primary text-eyebrow font-eyebrow uppercase tracking-wider px-1.5 py-0.5 rounded-control shadow-sm border border-border/40 font-semibold">
                              Pre-Saved
                            </span>
                          }
                        />
                      ))}
                    </MediaGrid>
                  </div>
                )}

                {/* Saved Albums */}
                <div>
                  <SectionTitle
                    title="Saved Albums"
                    subtitle={`${library.savedAlbums.length} ${library.savedAlbums.length === 1 ? 'album' : 'albums'} in the library`}
                  />

                  {library.savedAlbums.length === 0 ? (
                    <EmptyState
                      title="No saved albums"
                      description="Nothing has been saved to this library yet."
                    />
                  ) : (
                    <MediaGrid maxColumns={6}>
                      {library.savedAlbums.map((album) => (
                        <MediaTile
                          key={album.id}
                          to="/albums/$idOrSlug"
                          params={{ idOrSlug: album.slug || album.id }}
                          title={album.title}
                          subtitle={album.artistName}
                          imageUrl={album.coverImageUrl}
                          artistName={album.artistName}
                        />
                      ))}
                    </MediaGrid>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: LIKED SONGS */}
            {activeTab === 'liked' && (
              <div>
                <SectionTitle
                  title="Recent Liked Songs"
                  subtitle={`${likedTracks.length} ${likedTracks.length === 1 ? 'track' : 'tracks'} in the library`}
                />

                {likedTracks.length === 0 ? (
                  <EmptyState
                    title="No public liked songs"
                    description={`${profile.displayName} has not made any likes public.`}
                  />
                ) : (
                  <div className="overflow-hidden rounded-surface">
                    {likedTracks.map((track, index) => (
                      <SongRow
                        key={track.id}
                        track={track}
                        index={index}
                        variant="standard"
                        surface="transparent"
                        onPlay={() => handlePlayLikedSong(index)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <PeopleListModal
        open={peopleList !== null}
        onClose={() => setPeopleList(null)}
        userId={id}
        displayName={profile.displayName}
        kind={peopleList ?? 'followers'}
      />
    </div>
  )
}
