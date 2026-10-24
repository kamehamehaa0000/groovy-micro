import { useState } from 'react'
import { slugifyText, artistsApi } from '../../lib/artists.api'
import type { ArtistProfile } from '../../types/artist'
import { toast } from 'sonner'
import { PartyPopper, Sparkles } from 'lucide-react'

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
      toast.error('Please provide a stage name')
      return
    }

    setIsSubmittingUpgrade(true)
    toast.dismiss()

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
      toast.success(
        'Welcome to Groovy Creator Studio! Your artist identity is live.',
        { icon: <PartyPopper className="h-3 w-3" /> },
      )
    } catch (err: any) {
      toast.error(
        err.message || 'Instant upgrade failed. Please check your details.',
      )
    } finally {
      setIsSubmittingUpgrade(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-5 sm:px-8 py-12">
      <div className="border-b border-border pb-6 mb-8">
        <span className="font-eyebrow text-eyebrow uppercase tracking-widest text-primary block mb-2">
          Maison Creator Studio
        </span>
        <h1 className="font-serif italic text-3xl sm:text-4xl text-foreground tracking-tight">
          Launch Your Artist Identity
        </h1>
        <p className="font-sans text-caption text-muted-foreground mt-2 leading-relaxed">
          Upgrade instantly from a listener account to an official Groovy
          artist profile. Release master tracks, manage your presence, and
          curate your discography.
        </p>
      </div>

      <form onSubmit={handleInstantUpgrade} className="flex flex-col gap-6">
        <div className="p-6 border border-border bg-card flex flex-col gap-5 shadow-raised">
          <div>
            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-2">
              Stage / Ensemble Name{' '}
              <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              required
              value={stageName}
              onChange={(e) => setStageName(e.target.value)}
              placeholder="e.g. Hélène Vane, The Cinematic Trio"
              className="w-full font-serif italic text-title py-2.5 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground">
                Vanity Handle (Slug)
              </label>
              <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground">
                Auto-generated if blank
              </span>
            </div>
            <input
              type="text"
              value={customSlug}
              onChange={(e) => setCustomSlug(e.target.value)}
              placeholder="e.g. helene-vane"
              className="w-full font-mono text-caption py-2.5 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground transition-colors"
            />
            <div className="mt-2 font-mono text-eyebrow text-muted-foreground flex items-center gap-1">
              <span>Public profile URL:</span>
              <span className="text-primary font-semibold">
                groovy.app/artists/{previewSlug}
              </span>
            </div>
          </div>

          <div>
            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-2">
              Artist Biography
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Share your musical background, style, influences, or instruments..."
              className="w-full font-sans text-caption py-2.5 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground transition-colors resize-y leading-relaxed"
            />
          </div>

          <div className="pt-4 border-t border-border-soft">
            <span className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-3">
              Official Channels (Optional)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                  Instagram URL
                </label>
                <input
                  type="url"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="https://instagram.com/..."
                  className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground"
                />
              </div>
              <div>
                <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                  Website URL
                </label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-muted-foreground block mb-1">
                  Spotify Artist URL
                </label>
                <input
                  type="url"
                  value={spotify}
                  onChange={(e) => setSpotify(e.target.value)}
                  placeholder="https://open.spotify.com/artist/..."
                  className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground"
                />
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmittingUpgrade}
          className="w-full font-eyebrow text-caption uppercase tracking-widest py-3.5 px-6 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold inline-flex items-center justify-center gap-1.5"
        >
          {isSubmittingUpgrade ? (
            'Activating Studio...'
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              Activate Artist Studio (Instant Upgrade)
            </>
          )}
        </button>
      </form>
    </div>
  )
}
