import { apiFetch } from "./api";
import type {
  Playlist,
  PlaylistDetail,
  PlaylistTrack,
  PlaylistCollaborator,
  CreatePlaylistInput,
  UpdatePlaylistInput,
  SearchPlaylistsQuery,
  SearchPlaylistsResponse,
  CollaborationTokenResponse,
  RegenerateCollaborationTokenResponse,
} from "../types/playlist";

export const playlistsApi = {
  /**
   * Search and browse public playlists with mosaic covers and save states.
   */
  async searchPlaylists(query: SearchPlaylistsQuery = {}): Promise<SearchPlaylistsResponse> {
    const params = new URLSearchParams();
    if (query.search) params.append("search", query.search);
    if (query.page) params.append("page", String(query.page));
    if (query.limit) params.append("limit", String(query.limit));

    const qs = params.toString();
    return apiFetch<SearchPlaylistsResponse>(`/api/v1/playlists${qs ? `?${qs}` : ""}`);
  },

  /**
   * Create a new playlist.
   */
  async createPlaylist(input: CreatePlaylistInput): Promise<Playlist> {
    return apiFetch<Playlist>("/api/v1/playlists", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /**
   * Retrieve all playlists owned by current user.
   */
  async getUserPlaylists(): Promise<{ playlists: Playlist[] }> {
    return apiFetch<{ playlists: Playlist[] }>("/api/v1/playlists/me");
  },

  /**
   * Fast sync endpoint: fetch all saved playlist IDs in < 1ms for in-memory Set.
   */
  async getSavedPlaylistIds(): Promise<{ playlistIds: string[] }> {
    return apiFetch<{ playlistIds: string[] }>("/api/v1/playlists/saved/ids");
  },

  /**
   * Retrieve full list of saved playlists in user's library.
   */
  async getUserSavedPlaylists(): Promise<{ playlists: Playlist[] }> {
    return apiFetch<{ playlists: Playlist[] }>("/api/v1/playlists/saved");
  },

  /**
   * Get playlist by ID with tracks, collaborators, and permissions.
   * Optional shareToken enables viewing UNLISTED playlists.
   * Optional collabToken enables viewing / joining collaborative playlists.
   */
  async getPlaylistById(
    id: string,
    shareToken?: string,
    collabToken?: string
  ): Promise<PlaylistDetail> {
    const params = new URLSearchParams();
    if (shareToken) params.append("shareToken", shareToken);
    if (collabToken) params.append("collabToken", collabToken);
    const qs = params.toString();
    const url = `/api/v1/playlists/${id}${qs ? `?${qs}` : ""}`;
    return apiFetch<PlaylistDetail>(url);
  },

  /**
   * Update playlist metadata and settings (Owner only).
   */
  async updatePlaylist(id: string, input: UpdatePlaylistInput): Promise<Playlist> {
    return apiFetch<Playlist>(`/api/v1/playlists/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  /**
   * Delete a playlist (Owner only).
   */
  async deletePlaylist(id: string): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(`/api/v1/playlists/${id}`, {
      method: "DELETE",
    });
  },

  /**
   * Add tracks to a playlist (Owner or Collaborator).
   */
  async addTracks(
    playlistId: string,
    songIds: string[]
  ): Promise<{ message: string; addedCount: number; tracks: PlaylistTrack[] }> {
    return apiFetch<{ message: string; addedCount: number; tracks: PlaylistTrack[] }>(
      `/api/v1/playlists/${playlistId}/tracks`,
      {
        method: "POST",
        body: JSON.stringify({ songIds }),
      }
    );
  },

  /**
   * Remove a specific track entry by its playlist_songs entry ID.
   */
  async removeTrack(
    playlistId: string,
    entryId: string
  ): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(
      `/api/v1/playlists/${playlistId}/tracks/${entryId}`,
      {
        method: "DELETE",
      }
    );
  },

  /**
   * Reorder tracks via sequential integer position update (Owner or Collaborator).
   */
  async reorderTracks(
    playlistId: string,
    orderedEntryIds: string[]
  ): Promise<{ message: string; tracks: PlaylistTrack[] }> {
    return apiFetch<{ message: string; tracks: PlaylistTrack[] }>(
      `/api/v1/playlists/${playlistId}/tracks/reorder`,
      {
        method: "PATCH",
        body: JSON.stringify({ orderedEntryIds }),
      }
    );
  },

  /**
   * Clone a playlist into current user's library.
   * Public or Unlisted playlists can be cloned. Private only by owner.
   */
  async clonePlaylist(
    playlistId: string,
    shareToken?: string
  ): Promise<{ message: string; playlist: PlaylistDetail }> {
    const url = shareToken
      ? `/api/v1/playlists/${playlistId}/clone?shareToken=${encodeURIComponent(shareToken)}`
      : `/api/v1/playlists/${playlistId}/clone`;
    return apiFetch<{ message: string; playlist: PlaylistDetail }>(url, {
      method: "POST",
    });
  },

  /**
   * Save a playlist to user library.
   */
  async savePlaylist(playlistId: string): Promise<{ saved: boolean; savesCount: number }> {
    return apiFetch<{ saved: boolean; savesCount: number }>(
      `/api/v1/playlists/${playlistId}/save`,
      {
        method: "POST",
      }
    );
  },

  /**
   * Unsave a playlist from user library.
   */
  async unsavePlaylist(playlistId: string): Promise<{ saved: boolean; savesCount: number }> {
    return apiFetch<{ saved: boolean; savesCount: number }>(
      `/api/v1/playlists/${playlistId}/save`,
      {
        method: "DELETE",
      }
    );
  },

  /**
   * Enable collaboration on a playlist and generate invite link (Owner only).
   */
  async enableCollaboration(playlistId: string): Promise<CollaborationTokenResponse> {
    return apiFetch<CollaborationTokenResponse>(
      `/api/v1/playlists/${playlistId}/collaboration/enable`,
      {
        method: "POST",
      }
    );
  },

  /**
   * Regenerate collaboration token, immediately invalidating former invite links (Owner only).
   */
  async regenerateCollaborationToken(
    playlistId: string
  ): Promise<RegenerateCollaborationTokenResponse> {
    return apiFetch<RegenerateCollaborationTokenResponse>(
      `/api/v1/playlists/${playlistId}/collaboration/regenerate`,
      {
        method: "POST",
      }
    );
  },

  /**
   * Disable collaboration and purge non-owner collaborators (Owner only).
   */
  async disableCollaboration(playlistId: string): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(
      `/api/v1/playlists/${playlistId}/collaboration/disable`,
      {
        method: "POST",
      }
    );
  },

  /**
   * Join a playlist as collaborator using invite token.
   */
  async joinCollaboration(
    playlistId: string,
    token: string
  ): Promise<{ success: boolean; message: string; playlistId: string }> {
    return apiFetch<{ success: boolean; message: string; playlistId: string }>(
      `/api/v1/playlists/${playlistId}/collaborate/join`,
      {
        method: "POST",
        body: JSON.stringify({ token }),
      }
    );
  },

  /**
   * List all collaborators of a playlist (Owner or Collaborator).
   */
  async listCollaborators(
    playlistId: string
  ): Promise<{ collaborators: PlaylistCollaborator[] }> {
    return apiFetch<{ collaborators: PlaylistCollaborator[] }>(
      `/api/v1/playlists/${playlistId}/collaborators`
    );
  },

  /**
   * Kick or remove a collaborator (Owner only).
   */
  async removeCollaborator(
    playlistId: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    return apiFetch<{ success: boolean; message: string }>(
      `/api/v1/playlists/${playlistId}/collaborators/${userId}`,
      {
        method: "DELETE",
      }
    );
  },
};
