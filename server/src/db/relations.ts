import { relations } from "drizzle-orm";
import {
  users,
  artistProfiles,
  artistFollowers,
  subscriptionPlans,
  userSubscriptions,
  albums,
  songs,
  playlists,
  playlistSongs,
  userLibraryAlbums,
  userLibraryPlaylists,
  songLikes,
  comments,
  listeningHistory,
} from "./schema";

export const usersRelations = relations(users, ({ one, many }) => ({
  artistProfile: one(artistProfiles, {
    fields: [users.id],
    references: [artistProfiles.userId],
  }),
  subscription: one(userSubscriptions, {
    fields: [users.id],
    references: [userSubscriptions.userId],
  }),
  playlists: many(playlists),
  savedAlbums: many(userLibraryAlbums),
  savedPlaylists: many(userLibraryPlaylists),
  songLikes: many(songLikes),
  comments: many(comments),
  history: many(listeningHistory),
  followingArtists: many(artistFollowers),
}));

export const artistProfilesRelations = relations(
  artistProfiles,
  ({ one, many }) => ({
    user: one(users, {
      fields: [artistProfiles.userId],
      references: [users.id],
    }),
    albums: many(albums),
    songs: many(songs),
    followers: many(artistFollowers),
  })
);

export const artistFollowersRelations = relations(
  artistFollowers,
  ({ one }) => ({
    user: one(users, {
      fields: [artistFollowers.userId],
      references: [users.id],
    }),
    artist: one(artistProfiles, {
      fields: [artistFollowers.artistId],
      references: [artistProfiles.id],
    }),
  })
);

export const subscriptionPlansRelations = relations(
  subscriptionPlans,
  ({ many }) => ({
    subscriptions: many(userSubscriptions),
  })
);

export const userSubscriptionsRelations = relations(
  userSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [userSubscriptions.userId],
      references: [users.id],
    }),
    plan: one(subscriptionPlans, {
      fields: [userSubscriptions.planId],
      references: [subscriptionPlans.id],
    }),
  })
);

export const albumsRelations = relations(albums, ({ one, many }) => ({
  artist: one(artistProfiles, {
    fields: [albums.artistId],
    references: [artistProfiles.id],
  }),
  songs: many(songs),
  savedByUsers: many(userLibraryAlbums),
}));

export const songsRelations = relations(songs, ({ one, many }) => ({
  artist: one(artistProfiles, {
    fields: [songs.artistId],
    references: [artistProfiles.id],
  }),
  album: one(albums, {
    fields: [songs.albumId],
    references: [albums.id],
  }),
  playlistEntries: many(playlistSongs),
  likes: many(songLikes),
  comments: many(comments),
}));

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
  owner: one(users, {
    fields: [playlists.ownerId],
    references: [users.id],
  }),
  songs: many(playlistSongs),
  savedByUsers: many(userLibraryPlaylists),
}));

export const playlistSongsRelations = relations(playlistSongs, ({ one }) => ({
  playlist: one(playlists, {
    fields: [playlistSongs.playlistId],
    references: [playlists.id],
  }),
  song: one(songs, {
    fields: [playlistSongs.songId],
    references: [songs.id],
  }),
  addedByUser: one(users, {
    fields: [playlistSongs.addedByUserId],
    references: [users.id],
  }),
}));

export const userLibraryAlbumsRelations = relations(
  userLibraryAlbums,
  ({ one }) => ({
    user: one(users, {
      fields: [userLibraryAlbums.userId],
      references: [users.id],
    }),
    album: one(albums, {
      fields: [userLibraryAlbums.albumId],
      references: [albums.id],
    }),
  })
);

export const userLibraryPlaylistsRelations = relations(
  userLibraryPlaylists,
  ({ one }) => ({
    user: one(users, {
      fields: [userLibraryPlaylists.userId],
      references: [users.id],
    }),
    playlist: one(playlists, {
      fields: [userLibraryPlaylists.playlistId],
      references: [playlists.id],
    }),
  })
);

export const songLikesRelations = relations(songLikes, ({ one }) => ({
  user: one(users, {
    fields: [songLikes.userId],
    references: [users.id],
  }),
  song: one(songs, {
    fields: [songLikes.songId],
    references: [songs.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
  song: one(songs, {
    fields: [comments.songId],
    references: [songs.id],
  }),
  parentComment: one(comments, {
    fields: [comments.parentCommentId],
    references: [comments.id],
    relationName: "commentReplies",
  }),
  replies: many(comments, {
    relationName: "commentReplies",
  }),
}));

export const listeningHistoryRelations = relations(
  listeningHistory,
  ({ one }) => ({
    user: one(users, {
      fields: [listeningHistory.userId],
      references: [users.id],
    }),
    song: one(songs, {
      fields: [listeningHistory.songId],
      references: [songs.id],
    }),
  })
);
