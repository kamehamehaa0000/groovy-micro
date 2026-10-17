import { BadgeCheck, Plus } from 'lucide-react'
import type { ArtistProfile } from '../../../types/artist'
import type { VerificationState } from '../hooks/useVerification'

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
    <div className="p-6 border border-border bg-card shadow-raised">
      <div className="mb-6 pb-4 border-b border-border-soft">
        <h2 className="font-serif italic text-heading text-foreground">
          Creator Verification
        </h2>
        <p className="font-sans text-caption text-muted-foreground mt-0.5">
          Verified badges certify official recording artists and unlock
          prominent catalog placement.
        </p>
      </div>

      {artistProfile.verificationStatus === 'VERIFIED' ? (
        <div className="p-6 border border-primary/20 bg-primary/5 flex items-center gap-4">
          <BadgeCheck className="w-8 h-8 text-primary shrink-0" />
          <div>
            <h3 className="font-serif italic text-title text-foreground">
              Officially Verified Artist
            </h3>
            <p className="font-sans text-caption text-muted-foreground mt-0.5">
              Your artist profile has been verified by the administration
              desk. The verified emblem is active on your public profile and
              catalog releases.
            </p>
          </div>
        </div>
      ) : artistProfile.verificationStatus === 'PENDING' ? (
        <div className="p-6 border border-warning/40 bg-warning-soft flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-warning animate-ping" />
            <h3 className="font-serif italic text-title text-foreground">
              Application Under Review
            </h3>
          </div>
          <p className="font-sans text-caption text-muted-foreground leading-relaxed">
            Your verification application was received and is queued for
            administrative audit. Proof links and official artist identities
            are usually reviewed within 24-48 hours.
          </p>
          {artistProfile.verificationDetails?.message && (
            <div className="mt-2 p-3 border border-border-soft bg-background/60 font-sans text-caption text-muted-foreground italic">
              "{artistProfile.verificationDetails.message}"
            </div>
          )}
        </div>
      ) : artistProfile.verificationStatus === 'REJECTED' &&
        !showResubmitForm ? (
        <div className="p-6 border border-destructive/60 bg-destructive-soft flex flex-col gap-4">
          <div>
            <h3 className="font-serif italic text-title text-destructive">
              Application Needs Revision
            </h3>
            <p className="font-sans text-caption text-muted-foreground mt-1">
              The administrative review requested adjustments to your
              verification materials:
            </p>
            <div className="mt-2 p-3 border border-destructive/40 bg-background font-mono text-caption text-destructive">
              {artistProfile.rejectionReason ||
                'Please provide verifiable official links.'}
            </div>
          </div>

          <button
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
            className="self-start font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            Update & Resubmit Application &rarr;
          </button>
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
              className="w-full font-sans text-caption py-2.5 px-3 border border-border bg-background text-foreground focus:outline-none focus:border-foreground resize-y leading-relaxed"
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
                className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground"
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
                className="w-full font-mono text-caption py-2 px-3 border border-border bg-background text-foreground"
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
                    className="flex-1 font-mono text-caption py-2 px-3 border border-border bg-background text-foreground"
                  />
                  {verifyLinks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setVerifyLinks(
                          verifyLinks.filter((_, i) => i !== idx),
                        )
                      }}
                      className="font-mono text-caption py-2 px-3 border border-border text-muted-foreground hover:text-destructive hover:border-destructive cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}

              {verifyLinks.length < 5 && (
                <button
                  type="button"
                  onClick={() => setVerifyLinks([...verifyLinks, ''])}
                  className="self-start font-eyebrow text-eyebrow uppercase tracking-wider py-1.5 px-3 border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground cursor-pointer mt-1 inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  Add Another Link
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isSubmittingVerify}
              className="font-eyebrow text-eyebrow uppercase tracking-wider py-2.5 px-6 bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 font-semibold"
            >
              {isSubmittingVerify
                ? 'Submitting...'
                : 'Submit Verification Request'}
            </button>
            {showResubmitForm && (
              <button
                type="button"
                onClick={() => setShowResubmitForm(false)}
                className="font-eyebrow text-eyebrow uppercase tracking-wider py-2 px-4 border border-border text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
