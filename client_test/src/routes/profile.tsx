import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useAuthStore } from "../stores/auth.store";
import { api } from "../lib/api";

export const Route = createFileRoute("/profile")({
  component: ProfileComponent,
});

function ProfileComponent() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, refreshProfile, logout, revokeAll } =
    useAuthStore();

  const [displayName, setDisplayName] = useState("");
  const [profileMsg, setProfileMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Avatar Upload State
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);
  const [passwordMsg, setPasswordMsg] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName);
    }
  }, [user]);

  if (isLoading || !user) {
    return (
      <div className="py-20 text-center text-sm text-neutral-500">
        Loading profile...
      </div>
    );
  }

  // --- Profile Update (Display Name) ---
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setIsUpdatingProfile(true);

    try {
      await api.patch("/api/v1/users/profile", { displayName });
      await refreshProfile();
      setProfileMsg({
        text: "Display name updated successfully!",
        type: "success",
      });
    } catch (err: any) {
      setProfileMsg({ text: err.message, type: "error" });
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  // --- Avatar Pre-Signed URL Direct Upload ---
  const handleAvatarFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProfileMsg(null);
    setIsUploadingAvatar(true);

    try {
      const ext = file.name.split(".").pop() || "webp";

      // 1. Request Pre-Signed URL from Backend
      const presignedRes = await api.post<{
        uploadUrl: string;
        storageKey: string;
        publicUrl: string;
      }>("/api/v1/storage/presigned-url", {
        category: "USER_AVATAR",
        resourceId: user.id,
        mimeType: file.type || "image/webp",
        fileExtension: ext,
        fileSizeBytes: file.size,
      });

      // 2. Direct binary PUT upload to Cloudflare R2
      const uploadRes = await fetch(presignedRes.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "image/webp",
        },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error(
          `Direct R2 upload failed with status ${uploadRes.status}`
        );
      }

      // 3. Commit avatar URL to PostgreSQL profile
      await api.patch("/api/v1/users/profile", {
        avatarUrl: presignedRes.publicUrl,
      });

      await refreshProfile();
      setProfileMsg({
        text: "Avatar uploaded directly to R2 and updated successfully!",
        type: "success",
      });
    } catch (err: any) {
      setProfileMsg({
        text: `Avatar upload failed: ${err.message}`,
        type: "error",
      });
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // --- Password Update ---
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    setIsUpdatingPassword(true);

    try {
      const res = await api.patch<{ message: string; accessToken?: string }>(
        "/api/v1/users/password",
        {
          currentPassword,
          newPassword,
          revokeOtherSessions: revokeOthers,
        }
      );

      // If other sessions were revoked, backend returned fresh access token
      if (res.accessToken) {
        useAuthStore.getState().setAccessToken(res.accessToken);
      }

      setPasswordMsg({ text: res.message, type: "success" });
      setCurrentPassword("");
      setNewPassword("");
    } catch (err: any) {
      setPasswordMsg({ text: err.message, type: "error" });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Account & Profile</h1>
        <p className="text-sm text-neutral-400 mt-1">
          Manage your identity, security credentials, and storage uploads
        </p>
      </div>

      {/* User Card */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6">
        <div className="relative group">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.displayName}
              className="w-24 h-24 rounded-full object-cover border-2 border-emerald-500/40"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-emerald-950 border-2 border-emerald-500/40 text-emerald-400 text-3xl font-bold flex items-center justify-center">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleAvatarFileChange}
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingAvatar}
            className="mt-2 block mx-auto text-[11px] px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors border border-neutral-700"
          >
            {isUploadingAvatar ? "Uploading..." : "Upload to R2"}
          </button>
        </div>

        <div className="flex-1 text-center sm:text-left space-y-1">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <h2 className="text-xl font-bold text-white">{user.displayName}</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
              {user.role}
            </span>
          </div>
          <p className="text-sm text-neutral-400">{user.email}</p>
          <p className="text-xs text-neutral-500">
            Subscription:{" "}
            <span className="text-teal-400 font-semibold uppercase">
              {user.plan?.name || "Free"}
            </span>
          </p>
        </div>
      </div>

      {/* Profile Form */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
        <h3 className="text-base font-semibold text-white mb-4">
          Profile Settings
        </h3>

        {profileMsg && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              profileMsg.type === "success"
                ? "bg-emerald-950/60 border border-emerald-800 text-emerald-300"
                : "bg-red-950/60 border border-red-800 text-red-300"
            }`}
          >
            {profileMsg.text}
          </div>
        )}

        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={isUpdatingProfile}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {isUpdatingProfile ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>

      {/* Password Update Form */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
        <h3 className="text-base font-semibold text-white mb-4">
          Security & Password (Argon2id)
        </h3>

        {passwordMsg && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              passwordMsg.type === "success"
                ? "bg-emerald-950/60 border border-emerald-800 text-emerald-300"
                : "bg-red-950/60 border border-red-800 text-red-300"
            }`}
          >
            {passwordMsg.text}
          </div>
        )}

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1.5">
              New Password
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-100 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={revokeOthers}
              onChange={(e) => setRevokeOthers(e.target.checked)}
              className="rounded bg-neutral-950 border-neutral-800 text-emerald-600 focus:ring-0"
            />
            <span className="text-xs text-neutral-300">
              Revoke other sessions (log out all other devices immediately)
            </span>
          </label>

          <button
            type="submit"
            disabled={isUpdatingPassword}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-100 text-sm font-medium transition-colors border border-neutral-700"
          >
            {isUpdatingPassword ? "Updating Password..." : "Update Password"}
          </button>
        </form>
      </div>

      {/* Session Management */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
        <h3 className="text-base font-semibold text-white mb-2">
          Session & Device Controls
        </h3>
        <p className="text-xs text-neutral-400 mb-4">
          Test instant session revocation and token rotation features.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => logout()}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm font-medium transition-colors border border-neutral-700"
          >
            Log Out This Device
          </button>
          <button
            type="button"
            onClick={() => revokeAll()}
            className="px-4 py-2 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-300 text-sm font-medium transition-colors border border-red-800"
          >
            Revoke All Sessions Everywhere
          </button>
        </div>
      </div>
    </div>
  );
}
