export function extractKeyFromR2Url(url: string, customDomain: string): string {
  try {
    return new URL(url).pathname.substring(1) // Remove leading slash and return the path as key
  } catch (error) {
    throw new Error('Invalid R2 URL format')
  }
}
