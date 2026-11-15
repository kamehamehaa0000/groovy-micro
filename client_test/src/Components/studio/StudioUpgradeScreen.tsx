import { useState } from 'react'
import { slugifyText, artistsApi } from '../../lib/artists.api'
import type { ArtistProfile } from '../../types/artist'
import { notify } from '../../lib/toast'
import { PartyPopper, Sparkles } from 'lucide-react'
import {
  Button,
  Card,
  Eyebrow,
  Field,
  H1,
  Input,
  Subtitle,
  Textarea,
} from '../ui'

interface StudioUpgradeScreenProps {
  setArtistProfile: React.Dispatch<React.SetStateAction<ArtistProfile | null>>
}

export function StudioUpgradeScreen({
  setArtistProfile,
}: StudioUpgradeScreenProps) {
  // Upgrade Form State (for Listeners)
  const [stageName, setStageName] = useState('')
  const [customSlug, setCustomSlug] = useState('')
  const [bio, setBio] = useState('')
  const [instagram, setInstagram] = useState('')
  const [website, setWebsite] = useState('')
  const [spotify, setSpotify] = useState('')
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] = useState(false)

  const previewSlug = customSlug.trim()
    ? slugifyText(customSlug)
    : slugifyText(stageName) || 'your-stage-name'

  const handleInstantUpgrade = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stageName.trim()) {
      notify.error('Please provide a stage name')
      return
    }

    setIsSubmittingUpgrade(true)
    notify.dismiss()

    try {
      const socialLinks: Record<string, string> = {}
      if (instagram.trim()) socialLinks.instagram = instagram.trim()
      if (website.trim()) socialLinks.website = website.trim()
      if (spotify.trim()) socialLinks.spotify = spotify.trim()

      const res = await artistsApi.createProfile({
        stageName: stageName.trim(),
        slug: customSlug.trim() ? slugifyText(customSlug) : undefined,
        bio: bio.trim() || undefined,
        socialLinks:
          Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
      })

      setArtistProfile(res.profile)
      notify.success(
        'Welcome to Groovy Creator Studio! Your artist identity is live.',
        { icon: <PartyPopper className="h-3 w-3" /> },
      )
    } catch (err: any) {
      notify.error(
        err.message || 'Instant upgrade failed. Please check your details.',
      )
    } finally {
      setIsSubmittingUpgrade(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
      <div className="border-b border-border pb-6 mb-8">
        <Eyebrow tone="brand" className="mb-2 block">
          Maison Creator Studio
        </Eyebrow>
        <H1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Launch Your Artist Identity
        </H1>
        <Subtitle className="mt-2 leading-relaxed">
          Create your official Groovy artist profile. Release master tracks,
          manage your presence, and curate your discography.
        </Subtitle>
      </div>

      <form onSubmit={handleInstantUpgrade} className="flex flex-col gap-6">
        <Card
          variant="plain"
          padding="lg"
          className="flex flex-col gap-5 shadow-raised border-none rounded-lg"
        >
          <Field
            label={
              <span>
                Stage / Ensemble Name{' '}
                <span className="text-destructive">*</span>
              </span>
            }
          >
            <Input
              type="text"
              required
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
              placeholder="e.g. Hélène Vane, The Cinematic Trio"
              className="text-title font-medium  bg-background border-none rounded-lg"
            />
          </Field>

          <Field
            label={
              <div className="flex items-center justify-between w-full">
                <span>Vanity Handle (Slug)</span>
                <span className="text-muted-foreground normal-case font-normal text-caption">
                  Auto-generated if blank
                </span>
              </div>
            }
            hint={
              <span className="font-mono text-eyebrow flex items-center gap-1">
                <span>Public profile URL:</span>
                <span className="text-primary font-semibold">
                  groovy.app/artists/{previewSlug}
                </span>
              </span>
            }
          >
            <Input
              type="text"
              value={customSlug}
              onChange={(e) => setCustomSlug(e.target.value)}
              placeholder="e.g. helene-vane"
              className="font-mono text-caption   bg-background border-none rounded-lg"
            />
          </Field>

          <Field label="Artist Biography">
            <Textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Share your musical background, style, influences, or instruments..."
              className="font-sans text-caption leading-relaxed  bg-background border-none rounded-lg"
            />
          </Field>

          <div className="pt-4 border-t border-border">
            <Eyebrow className="block mb-3">
              Official Channels (Optional)
            </Eyebrow>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Instagram URL">
                <Input
                  type="url"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="https://instagram.com/..."
                  className="font-mono text-caption  bg-background border-none rounded-lg"
                />
              </Field>
              <Field label="Website URL">
                <Input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  className="font-mono text-caption  bg-background border-none rounded-lg "
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Spotify Artist URL">
                  <Input
                    type="url"
                    value={spotify}
                    onChange={(e) => setSpotify(e.target.value)}
                    placeholder="https://open.spotify.com/artist/..."
                    className="font-mono text-caption  bg-background border-none rounded-lg"
                  />
                </Field>
              </div>
            </div>
          </div>
        </Card>

        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={isSubmittingUpgrade}
          leftIcon={
            !isSubmittingUpgrade ? (
              <Sparkles className="w-4 h-4 shrink-0" />
            ) : undefined
          }
          className="ml-auto text-muted text-xs "
        >
          {isSubmittingUpgrade
            ? 'Activating Studio...'
            : 'Create Artist Profile'}
        </Button>
      </form>
    </div>
  )
}
