import { useCallback, useState, useRef } from 'react'
import { artistsApi, slugifyText } from '../../../lib/artists.api'
import type { ArtistProfile } from '../../../types/artist'
import { notify } from '../../../lib/toast'

export function useProfileForm(
  artistProfile: ArtistProfile | null,
  setArtistProfile: React.Dispatch<React.SetStateAction<ArtistProfile | null>>,
) {
  // Banner & Avatar Upload & Crop State
  const [isUploadingBanner, setIsUploadingBanner] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const [bannerCropFile, setBannerCropFile] = useState<File | null>(null)

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarCropFile, setAvatarCropFile] = useState<File | null>(null)

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [editStageName, setEditStageName] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editInstagram, setEditInstagram] = useState('')
  const [editWebsite, setEditWebsite] = useState('')
  const [editSpotify, setEditSpotify] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  // Artist Spotlight & Pick State
  const [spotlightReleaseId, setSpotlightReleaseId] = useState('')
  const [spotlightComment, setSpotlightComment] = useState('')
  const [isSavingSpotlight, setIsSavingSpotlight] = useState(false)
  const [spotlightStatus, setSpotlightStatus] = useState<
    'idle' | 'saved' | 'cleared' | 'error'
  >('idle')
  const [spotlightStatusMessage, setSpotlightStatusMessage] = useState<
    string | null
  >(null)

  // Handle Banner Select -> Launch Cropper
  const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBannerCropFile(file)
    if (bannerInputRef.current) bannerInputRef.current.value = ''
  }

  // Handle Cropped Banner Upload via Cloudflare R2
  const handleBannerCropComplete = async (croppedFile: File) => {
    if (!artistProfile) return
    setIsUploadingBanner(true)
    notify.dismiss()

    try {
      const publicUrl = await artistsApi.uploadBanner(
        artistProfile.id,
        croppedFile,
      )
      setArtistProfile((prev) =>
        prev ? { ...prev, bannerUrl: publicUrl } : null,
      )
      notify.success(
        'Banner image cropped, uploaded to Cloudflare R2, and synced.',
      )
      setBannerCropFile(null)
    } catch (err: any) {
      notify.error(err.message || 'Failed to upload banner')
    } finally {
      setIsUploadingBanner(false)
    }
  }

  // Handle Avatar Select -> Launch Cropper
  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarCropFile(file)
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  // Handle Cropped Avatar Upload via Cloudflare R2
  const handleAvatarCropComplete = async (croppedFile: File) => {
    if (!artistProfile) return
    setIsUploadingAvatar(true)
    notify.dismiss()

    try {
      const publicUrl = await artistsApi.uploadAvatar(
        artistProfile.id,
        croppedFile,
      )
      setArtistProfile((prev) =>
        prev ? { ...prev, avatarUrl: publicUrl } : null,
      )
      notify.success(
        'Artist avatar cropped, uploaded to Cloudflare R2, and synced.',
      )
      setAvatarCropFile(null)
    } catch (err: any) {
      notify.error(err.message || 'Failed to upload avatar')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  // Handle Remove Avatar
  const handleRemoveAvatar = async () => {
    if (!artistProfile) return
    setIsUploadingAvatar(true)
    notify.dismiss()
    try {
      await artistsApi.updateMyProfile({ avatarUrl: null })
      setArtistProfile((prev) => (prev ? { ...prev, avatarUrl: null } : null))
      notify.success('Artist avatar removed.')
    } catch (err: any) {
      notify.error(err.message || 'Failed to remove avatar')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  // Handle Profile Update Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingEdit(true)
    notify.dismiss()

    try {
      const socialLinks: Record<string, string> = {}
      if (editInstagram.trim()) socialLinks.instagram = editInstagram.trim()
      if (editWebsite.trim()) socialLinks.website = editWebsite.trim()
      if (editSpotify.trim()) socialLinks.spotify = editSpotify.trim()

      const res = await artistsApi.updateMyProfile({
        stageName: editStageName.trim() || undefined,
        slug: editSlug.trim() ? slugifyText(editSlug) : undefined,
        bio: editBio.trim() || null,
        socialLinks,
      })

      setArtistProfile(res.profile)
      setIsEditingProfile(false)
      notify.success('Artist profile details updated successfully.')
    } catch (err: any) {
      notify.error(err.message || 'Failed to update profile')
    } finally {
      setIsSavingEdit(false)
    }
  }

  // Handle Save Spotlight / Artist Pick
  const handleSaveSpotlight = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!artistProfile) return
    setIsSavingSpotlight(true)
    notify.dismiss()
    setSpotlightStatus('idle')
    setSpotlightStatusMessage(null)

    try {
      const res = await artistsApi.updateMyProfile({
        pinnedReleaseId: spotlightReleaseId || null,
        pinnedComment: spotlightReleaseId
          ? spotlightComment.trim() || null
          : null,
      })
      setArtistProfile(res.profile)
      setSpotlightReleaseId(res.profile.pinnedReleaseId || '')
      setSpotlightComment(res.profile.pinnedComment || '')
      const msg = spotlightReleaseId
        ? 'Artist Pick spotlight updated successfully.'
        : 'Artist Pick spotlight reset to automatic latest release.'
      notify.success(msg)
      setSpotlightStatus('saved')
      setSpotlightStatusMessage(
        spotlightReleaseId
          ? 'Spotlight saved! Your public profile is now updated.'
          : 'Reset to automatic latest release fallback.',
      )
      setTimeout(() => {
        setSpotlightStatus((prev) => (prev === 'saved' ? 'idle' : prev))
      }, 4000)
    } catch (err: any) {
      const errMsg = err.message || 'Failed to update spotlight'
      notify.error(errMsg)
      setSpotlightStatus('error')
      setSpotlightStatusMessage(errMsg)
    } finally {
      setIsSavingSpotlight(false)
    }
  }

  // Handle Reset Spotlight to Latest Release
  const handleClearSpotlight = async () => {
    if (!artistProfile) return
    setIsSavingSpotlight(true)
    notify.dismiss()
    setSpotlightStatus('idle')
    setSpotlightStatusMessage(null)

    try {
      const res = await artistsApi.updateMyProfile({
        pinnedReleaseId: null,
        pinnedComment: null,
      })
      setArtistProfile(res.profile)
      setSpotlightReleaseId('')
      setSpotlightComment('')
      const msg = 'Artist Pick reset to automatic latest release.'
      notify.success(msg)
      setSpotlightStatus('cleared')
      setSpotlightStatusMessage('Reset to automatic latest release fallback.')
      setTimeout(() => {
        setSpotlightStatus((prev) => (prev === 'cleared' ? 'idle' : prev))
      }, 4000)
    } catch (err: any) {
      const errMsg = err.message || 'Failed to reset spotlight'
      notify.error(errMsg)
      setSpotlightStatus('error')
      setSpotlightStatusMessage(errMsg)
    } finally {
      setIsSavingSpotlight(false)
    }
  }

  // Handle Discard Spotlight Changes
  const handleDiscardSpotlightChanges = () => {
    if (!artistProfile) return
    setSpotlightReleaseId(artistProfile.pinnedReleaseId || '')
    setSpotlightComment(artistProfile.pinnedComment || '')
    setSpotlightStatus('idle')
    setSpotlightStatusMessage(null)
  }

  // Seed the profile form + spotlight fields from a loaded profile
  const hydrate = useCallback((artist: ArtistProfile) => {
    setEditStageName(artist.stageName)
    setEditSlug(artist.slug)
    setEditBio(artist.bio || '')
    setEditInstagram(artist.socialLinks?.instagram || '')
    setEditWebsite(artist.socialLinks?.website || '')
    setEditSpotify(artist.socialLinks?.spotify || '')
    setSpotlightReleaseId(artist.pinnedReleaseId || '')
    setSpotlightComment(artist.pinnedComment || '')
  }, [])

  return {
    isUploadingBanner,
    setIsUploadingBanner,
    bannerInputRef,
    bannerCropFile,
    setBannerCropFile,
    isUploadingAvatar,
    setIsUploadingAvatar,
    avatarInputRef,
    avatarCropFile,
    setAvatarCropFile,
    isEditingProfile,
    setIsEditingProfile,
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
    setIsSavingEdit,
    spotlightReleaseId,
    setSpotlightReleaseId,
    spotlightComment,
    setSpotlightComment,
    isSavingSpotlight,
    setIsSavingSpotlight,
    spotlightStatus,
    setSpotlightStatus,
    spotlightStatusMessage,
    setSpotlightStatusMessage,
    handleBannerSelect,
    handleBannerCropComplete,
    handleAvatarSelect,
    handleAvatarCropComplete,
    handleRemoveAvatar,
    handleSaveProfile,
    handleSaveSpotlight,
    handleClearSpotlight,
    handleDiscardSpotlightChanges,
    hydrate,
  }
}

export type ProfileState = ReturnType<typeof useProfileForm>
