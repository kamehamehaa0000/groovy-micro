import { BadgeCheck, Plus } from 'lucide-react'
import type { ArtistProfile } from '../../../types/artist'
import type { VerificationState } from '../hooks/useVerification'
import { H3, H4 } from '../../ui/typography'
import { Button } from '../../ui'

interface VerificationTabProps {
  artistProfile: ArtistProfile
  verification: VerificationState
}

export function VerificationTab({
  artistProfile,
  verification,
}: VerificationTabProps) {
  const {
    showResubmitForm,
    setShowResubmitForm,
    setVerifyPitch,
    setVerifyLinks,
    handleSubmitVerification,
    verifyPitch,
    verifyContactEmail,
    setVerifyContactEmail,
    verifyContactPhone,
    setVerifyContactPhone,
    verifyLinks,
    isSubmittingVerify,
  } = verification

  return (
    <div className="p-6 bg-card shadow-raised rounded-2xl space-y-6">
      <div className="pb-4 border-b border-border-soft">
        <H3 className="text-title font-semibold tracking-tight text-foreground sm:text-lg">
          Creator Verification
        </H3>
        <p className="font-sans text-caption text-muted-foreground mt-0.5">
          Verified badges certify official recording artists and unlock
          prominent catalog placement.
        </p>
      </div>

      {artistProfile.verificationStatus === 'VERIFIED' ? (
        <div className="p-6 bg-primary/10 rounded-2xl flex items-center gap-4">
          <BadgeCheck className="w-8 h-8 text-primary shrink-0" />
          <div>
            <H4 className="text-body font-semibold text-foreground">
              Officially Verified Artist
            </H4>
            <p className="font-sans text-caption text-muted-foreground mt-0.5">
              Your artist profile has been verified by the administration
              desk. The verified emblem is active on your public profile and
              catalog releases.
            </p>
          </div>
        </div>
      ) : artistProfile.verificationStatus === 'PENDING' ? (
        <div className="p-6 bg-warning-soft rounded-2xl flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-warning animate-ping" />
            <H4 className="text-body font-semibold text-foreground">
              Application Under Review
            </H4>
          </div>
          <p className="font-sans text-caption text-muted-foreground leading-relaxed">
            Your verification application was received and is queued for
            administrative audit. Proof links and official artist identities
            are usually reviewed within 24-48 hours.
          </p>
          {artistProfile.verificationDetails?.message && (
            <div className="mt-2 p-3.5 bg-background/60 rounded-xl font-sans text-caption text-muted-foreground italic">
              "{artistProfile.verificationDetails.message}"
            </div>
          )}
        </div>
      ) : artistProfile.verificationStatus === 'REJECTED' &&
        !showResubmitForm ? (
        <div className="p-6 bg-destructive-soft rounded-2xl flex flex-col gap-4">
          <div>
            <H4 className="text-body font-semibold text-destructive">
              Application Needs Revision
            </H4>
            <p className="font-sans text-caption text-muted-foreground mt-1">
              The administrative review requested adjustments to your
              verification materials:
            </p>
            <div className="mt-2 p-3.5 bg-background rounded-xl font-mono text-caption text-destructive">
              {artistProfile.rejectionReason ||
                'Please provide verifiable official links.'}
            </div>
          </div>

          <Button
            variant="pixel"
            size="sm"
            type="button"
            onClick={() => {
              setShowResubmitForm(true)
              setVerifyPitch(
                artistProfile.verificationDetails?.message || '',
              )
              if (artistProfile.verificationDetails?.links) {
                setVerifyLinks(artistProfile.verificationDetails.links)
              }
            }}
            className="self-start"
          >
            <span>Update & Resubmit Application &rarr;</span>
          </Button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmitVerification}
          className="flex flex-col gap-5"
        >
          <div>
            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1.5">
              Verification Pitch / Artist Background{' '}
              <span className="text-destructive">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={verifyPitch}
              onChange={(e) => setVerifyPitch(e.target.value)}
              placeholder="Briefly describe your musical career, past releases, live performances, or label affiliations..."
              className="w-full font-sans text-caption py-2.5 px-3 bg-background text-foreground focus:outline-none rounded-lg resize-y leading-relaxed border-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1.5">
                Contact Email
              </label>
              <input
                type="email"
                value={verifyContactEmail}
                onChange={(e) => setVerifyContactEmail(e.target.value)}
                placeholder="artist@example.com"
                className="w-full font-mono text-caption py-2 px-3 bg-background text-foreground rounded-lg border-none focus:outline-none"
              />
            </div>
            <div>
              <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1.5">
                Contact Phone (Optional)
              </label>
              <input
                type="tel"
                value={verifyContactPhone}
                onChange={(e) => setVerifyContactPhone(e.target.value)}
                placeholder="+1 555-0199"
                className="w-full font-mono text-caption py-2 px-3 bg-background text-foreground rounded-lg border-none focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="font-eyebrow text-eyebrow uppercase tracking-wider text-foreground block mb-1.5">
              Official Proof & Portfolio Links{' '}
              <span className="text-destructive">*</span>
            </label>
            <p className="font-sans text-caption text-muted-foreground mb-3">
              Include links to verified Spotify, Apple Music, Bandcamp,
              official website, or press articles.
            </p>

            <div className="flex flex-col gap-2">
              {verifyLinks.map((link, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="url"
                    required
                    value={link}
                    onChange={(e) => {
                      const copy = [...verifyLinks]
                      copy[idx] = e.target.value
                      setVerifyLinks(copy)
                    }}
                    placeholder="https://open.spotify.com/artist/..."
                    className="flex-1 font-mono text-caption py-2 px-3 bg-background text-foreground rounded-lg border-none focus:outline-none"
                  />
                  {verifyLinks.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => {
                        setVerifyLinks(
                          verifyLinks.filter((_, i) => i !== idx),
                        )
                      }}
                      className="rounded-full text-muted-foreground hover:text-destructive hover:border-destructive"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}

              {verifyLinks.length < 5 && (
                <Button
                  variant="pixel"
                  size="sm"
                  type="button"
                  onClick={() => setVerifyLinks([...verifyLinks, ''])}
                  className="self-start mt-1"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>Add Another Link</span>
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="pixel"
              size="sm"
              type="submit"
              disabled={isSubmittingVerify}
            >
              <span>
                {isSubmittingVerify
                  ? 'Submitting...'
                  : 'Submit Verification Request'}
              </span>
            </Button>
            {showResubmitForm && (
              <Button
                variant="outline"
                size="sm"
                type="button"
                className="rounded-full"
                onClick={() => setShowResubmitForm(false)}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
