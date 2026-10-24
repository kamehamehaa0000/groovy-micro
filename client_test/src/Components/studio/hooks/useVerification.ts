import { useCallback, useState } from 'react'
import { artistsApi } from '../../../lib/artists.api'
import type { ArtistProfile } from '../../../types/artist'
import { notify } from '../../../lib/toast'

export function useVerification(
  setArtistProfile: React.Dispatch<React.SetStateAction<ArtistProfile | null>>,
) {
  // Verification Application State
  const [verifyPitch, setVerifyPitch] = useState('')
  const [verifyContactEmail, setVerifyContactEmail] = useState('')
  const [verifyContactPhone, setVerifyContactPhone] = useState('')
  const [verifyLinks, setVerifyLinks] = useState<string[]>([''])
  const [isSubmittingVerify, setIsSubmittingVerify] = useState(false)
  const [showResubmitForm, setShowResubmitForm] = useState(false)

  // Handle Verification Application Submission
  const handleSubmitVerification = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanLinks = verifyLinks.map((l) => l.trim()).filter(Boolean)

    if (cleanLinks.length === 0) {
      notify.error(
        'Please provide at least one proof link (e.g. Spotify, official website)',
      )
      return
    }

    setIsSubmittingVerify(true)
    notify.dismiss()

    try {
      const res = await artistsApi.requestVerification({
        message: verifyPitch.trim(),
        contactEmail: verifyContactEmail.trim() || undefined,
        contactPhone: verifyContactPhone.trim() || undefined,
        links: cleanLinks,
      })

      setArtistProfile(res.profile)
      setShowResubmitForm(false)
      notify.success(
        'Verification application submitted for administrative review.',
      )
    } catch (err: any) {
      notify.error(err.message || 'Verification submission failed')
    } finally {
      setIsSubmittingVerify(false)
    }
  }

  // Seed the contact email from the signed-in account
  const hydrateContact = useCallback((email: string) => {
    setVerifyContactEmail(email)
  }, [])

  return {
    verifyPitch,
    setVerifyPitch,
    verifyContactEmail,
    setVerifyContactEmail,
    verifyContactPhone,
    setVerifyContactPhone,
    verifyLinks,
    setVerifyLinks,
    isSubmittingVerify,
    setIsSubmittingVerify,
    showResubmitForm,
    setShowResubmitForm,
    handleSubmitVerification,
    hydrateContact,
  }
}

export type VerificationState = ReturnType<typeof useVerification>
