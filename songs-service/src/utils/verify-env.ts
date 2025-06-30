export const verifyEnv = () => {
  const requiredEnvVars = [
    'NODE_ENV',
    'PORT',
    'BASE_URL',
    'CLIENT_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'JWT_ACCESS_EXPIRES_IN',
    'JWT_REFRESH_EXPIRES_IN',
    'MAGIC_LINK_SECRET',
    'MAGIC_LINK_EXPIRES_IN',
  ]

  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar]
  )

  if (missingEnvVars.length > 0) {
    const errorMessage = [
      ' Missing required environment variables:',
      '',
      ...missingEnvVars.map((envVar) => `  • ${envVar}`),
      '',
      'Please set these variables in your .env file or environment configuration.',
    ].join('\n')

    throw new Error(errorMessage)
  }
}
