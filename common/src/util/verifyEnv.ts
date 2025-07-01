const verifyEnv = (envVars: string[]) => {
  const missingEnvVars = envVars.filter((envVar) => !process.env[envVar])
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
export default verifyEnv
