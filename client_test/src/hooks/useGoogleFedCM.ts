import { useEffect, useRef } from 'react'
import { useAuthStore } from '../stores/auth.store'
import { api } from '../lib/api'

/**
 * Pure Browser-Native Google FedCM (Federated Credential Management) Hook.
 * Zero external <script> tags loaded, zero iframes injected.
 * Directly communicates with the Chromium browser engine.
 */
export function useGoogleFedCM(
  options: { autoPrompt?: boolean } = { autoPrompt: true },
) {
  const { isAuthenticated, isLoading, setAccessToken, setUser } = useAuthStore()
  const hasPromptedRef = useRef(false)

  useEffect(() => {
    // Only prompt unauthenticated users once initial session check finishes
    if (isLoading || isAuthenticated || hasPromptedRef.current) {
      return
    }

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    // if (!clientId || clientId === 'your_google_client_id_here') {
    //   return
    // }

    // Check if the browser natively supports FedCM
    const isFedCMSupported =
      typeof window !== 'undefined' &&
      'IdentityCredential' in window &&
      navigator.credentials &&
      typeof navigator.credentials.get === 'function'

    if (!isFedCMSupported) {
      return
    }

    if (!options.autoPrompt) {
      return
    }

    hasPromptedRef.current = true

    async function triggerNativeFedCM() {
      try {
        // Native W3C browser call directly to the Chromium engine
        const nonce = crypto.randomUUID();
        const credential = await (navigator.credentials as any).get({
          identity: {
            context: "signin",
            providers: [
              {
                configURL: "https://accounts.google.com/gsi/fedcm.json",
                clientId,
                params: {
                  response_type: "id_token",
                  scope: "openid email profile",
                  nonce,
                },
              },
            ],
          },
        });

        if (!credential || !credential.token) {
          return
        }

        // Send the browser-verified Google ID Token to Fastify backend
        const result = await api.post<{
          user: any
          accessToken: string
        }>('/api/v1/auth/google/token', {
          idToken: credential.token,
        })

        // Store tokens & update Zustand state
        setAccessToken(result.accessToken)
        setUser(result.user)
      } catch (err: any) {
        // User closed the native prompt, or cooling-down period active
        if (err.name !== 'AbortError') {
          console.debug('Native FedCM dismissed or unavailable:', err.message)
        }
      }
    }

    // Small delay to ensure smooth page paint before native browser sheet appears
    const timer = setTimeout(() => {
      triggerNativeFedCM()
    }, 600)

    return () => clearTimeout(timer)
  }, [isLoading, isAuthenticated, options.autoPrompt, setAccessToken, setUser])
}
