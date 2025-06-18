import { emailTransporter } from '../config/mail'

export const sendVerificationEmail = async (
  email: string,
  verificationToken: string
): Promise<void> => {
  const verificationUrl = `${process.env.CLIENT_URL}/auth/verify-email?token=${verificationToken}`

  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Verify Your Email - Groovy Streaming',
    html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <h2 style="color: #333; text-align: center;">Welcome to Groovy Streaming!</h2>
          <p style="color: #666; font-size: 16px;">
            Thank you for signing up! Please verify your email address by clicking the button below:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" 
               style="background-color: #007bff; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p style="color: #999; font-size: 14px;">
            If the button doesn't work, copy and paste this link into your browser:
            <br>
            <a href="${verificationUrl}">${verificationUrl}</a>
          </p>
          <p style="color: #999; font-size: 12px;">
            This link will expire in 15 minutes. If you didn't create an account, you can safely ignore this email.
          </p>
        </div>
      `,
  }
  try {
    await emailTransporter.sendMail(mailOptions)
    console.log(`Verification email sent to ${email}`)
  } catch (error) {
    console.error('Error sending verification email:', error)
    throw new Error('Failed to send verification email')
  }
}
export const sendMagicLinkEmail = async (
  email: string,
  magicLinkToken: string
) => {
  const magicLinkTokenUrl = `${process.env.CLIENT_URL}/auth/magic-link?token=${magicLinkToken}`
  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Your Magic Login Link - Groovy Streaming',
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
        <h2 style="color: #333; text-align: center;">Your Magic Login Link</h2>
        <p style="color: #666; font-size: 16px;">
          Click the button below to log in without a password:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${magicLinkTokenUrl}" 
             style="background-color: #007bff; color: white; padding: 12px 30px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Log In with Magic Link
          </a>
        </div>
        <p style="color: #999; font-size: 14px;">
          If the button doesn't work, copy and paste this link into your browser:
          <br>
          <a href="${magicLinkTokenUrl}">${magicLinkTokenUrl}</a>
        </p>
        <p style="color: #999; font-size: 12px;">
          This link will expire in 15 minutes. If you didn't request this, you can ignore this email.
        </p>
      </div>
    `,
  }
  await emailTransporter.sendMail(mailOptions)
}

export const sendPasswordResetEmail = async (
  email: string,
  token: string,
  clientUrl: string
) => {
  const resetUrl = `${clientUrl}/api/auth/reset-password?token=${token}`

  const mailOptions = {
    from: process.env.FROM_EMAIL ?? 'noreply@musicstream.com',
    to: email,
    subject: 'Reset Your Password - Groovy Music',
    html: `
            <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
              <h2>Reset Your Password</h2>
              <p>To reset your password, click the button below:</p>
              <a href="${resetUrl}" 
                 style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                Reset Password
              </a>
              <p>Or copy this link: ${resetUrl}</p>
              <p>This link expires in 15 minutes.</p>
            </div>
          `,
  }

  await emailTransporter.sendMail(mailOptions)
}
