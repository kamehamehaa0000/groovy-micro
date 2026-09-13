import type { FastifyBaseLogger } from 'fastify'

export interface SendVerificationEmailParams {
  to: string
  displayName: string
  verificationUrl: string
}

export interface SendPasswordResetEmailParams {
  to: string
  displayName: string
  resetUrl: string
}

export class MailService {
  private logger?: FastifyBaseLogger

  constructor(logger?: FastifyBaseLogger) {
    this.logger = logger
  }

  /**
   * Dispatches verification email via Brevo REST API with exponential backoff.
   * If BREVO_API_KEY is omitted, falls back to formatted terminal output for local dev.
   */
  async sendVerificationEmail(
    params: SendVerificationEmailParams,
  ): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY

    // Development Console Fallback
    if (!apiKey) {
      this.logDevVerificationLink(params)
      return
    }

    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'no-reply@groovy.com'
    const senderName = process.env.BREVO_SENDER_NAME || 'Groovy'

    const payload = {
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [
        {
          email: params.to,
          name: params.displayName,
        },
      ],
      subject: 'Verify your Groovy account',
      htmlContent: this.buildHtmlTemplate(
        params.displayName,
        params.verificationUrl,
      ),
      textContent: `Welcome to Groovy, ${params.displayName}!\n\nPlease verify your email address by opening the following link:\n${params.verificationUrl}\n\nThis link will expire in 24 hours.\nIf you didn't create a Groovy account, you can safely ignore this email.`,
    }

    await this.executeWithRetry(async () => {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        const err = new Error(
          `Brevo API responded with status ${response.status}: ${errorBody}`,
        )
        ;(err as any).statusCode = response.status
        throw err
      }

      this.logger?.info(
        { recipient: params.to },
        'Verification email successfully dispatched via Brevo',
      )
    })
  }

  /**
   * Dispatches password reset email via Brevo REST API with exponential backoff.
   * If BREVO_API_KEY is omitted, falls back to formatted terminal output for local dev.
   */
  async sendPasswordResetEmail(
    params: SendPasswordResetEmailParams,
  ): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY

    // Development Console Fallback
    if (!apiKey) {
      this.logDevPasswordResetLink(params)
      return
    }

    const senderEmail = process.env.BREVO_SENDER_EMAIL || 'no-reply@groovy.com'
    const senderName = process.env.BREVO_SENDER_NAME || 'Groovy'

    const payload = {
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [
        {
          email: params.to,
          name: params.displayName,
        },
      ],
      subject: 'Reset your Groovy password',
      htmlContent: this.buildPasswordResetHtmlTemplate(
        params.displayName,
        params.resetUrl,
      ),
      textContent: `Hello ${params.displayName},\n\nWe received a request to reset the password for your Groovy account.\n\nPlease reset your password by opening the following link:\n${params.resetUrl}\n\nThis link will expire in 1 hour.\nIf you didn't request a password reset, you can safely ignore this message. Your password will remain unchanged.`,
    }

    await this.executeWithRetry(async () => {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        const err = new Error(
          `Brevo API responded with status ${response.status}: ${errorBody}`,
        )
        ;(err as any).statusCode = response.status
        throw err
      }

      this.logger?.info(
        { recipient: params.to },
        'Password reset email successfully dispatched via Brevo',
      )
    })
  }

  /**
   * Executes an asynchronous operation with exponential backoff and jitter.
   * Retries on 429 (Rate Limit), 5xx (Server Error), or transient network failures.
   */
  private async executeWithRetry(
    operation: () => Promise<void>,
    maxRetries = 3,
    baseDelayMs = 1000,
  ): Promise<void> {
    let attempt = 0

    while (attempt < maxRetries) {
      try {
        await operation()
        return
      } catch (err: any) {
        attempt++
        const statusCode = err.statusCode || 0
        const isRetryable =
          statusCode === 429 ||
          statusCode >= 500 ||
          err.name === 'TypeError' || // Network / fetch failure
          err.code === 'ECONNRESET' ||
          err.code === 'ETIMEDOUT'

        if (!isRetryable || attempt >= maxRetries) {
          this.logger?.error(
            { err: err.message, attempt, maxRetries },
            'Verification email dispatch failed permanently',
          )
          throw err
        }

        // Exponential backoff: baseDelay * 2^(attempt - 1) + jitter (0-200ms)
        const delay =
          baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 200

        this.logger?.warn(
          { attempt, delayMs: Math.round(delay), error: err.message },
          `Transient error sending email. Retrying with exponential backoff...`,
        )

        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  /**
   * Formats a clean console notification for development environments.
   */
  private logDevVerificationLink(params: SendVerificationEmailParams): void {
    console.log('\n' + '='.repeat(72))
    console.log(' 📨 [DEV EMAIL VERIFICATION DISPATCH]')
    console.log(` To:           ${params.to} (${params.displayName})`)
    console.log(` Subject:      Verify your Groovy account`)
    console.log(` Verify URL:   ${params.verificationUrl}`)
    console.log(
      ' (Configure BREVO_API_KEY and BREVO_SENDER_EMAIL in .env to send real emails)',
    )
    console.log('='.repeat(72) + '\n')
  }

  /**
   * Formats a clean console notification for password reset links in development.
   */
  private logDevPasswordResetLink(params: SendPasswordResetEmailParams): void {
    console.log('\n' + '='.repeat(72))
    console.log(' 📨 [DEV PASSWORD RESET DISPATCH]')
    console.log(` To:           ${params.to} (${params.displayName})`)
    console.log(` Subject:      Reset your Groovy password`)
    console.log(` Reset URL:    ${params.resetUrl}`)
    console.log(
      ' (Configure BREVO_API_KEY and BREVO_SENDER_EMAIL in .env to send real emails)',
    )
    console.log('='.repeat(72) + '\n')
  }

  /**
   * Builds modern dark-themed HTML verification email template.
   */
  private buildHtmlTemplate(
    displayName: string,
    verificationUrl: string,
  ): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify your Groovy account</title>
  <style>
    :root {
      --canvas: #FAF8F3;
      --canvas-deep: #F1ECE1;
      --panel: #FFFFFF;
      --ink: #17160F;
      --ink-soft: #79766D;
      --stone: #D8D2C2;
      --blue: #1B5FA6;
      --blue-deep: #123D6B;
      --line: rgba(23,22,15,0.12);
      --line-soft: rgba(23,22,15,0.07);
    }

    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      background: var(--canvas);
      color: var(--ink);
    }

    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI",
        Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    table {
      border-collapse: collapse;
    }

    a {
      color: inherit;
    }

    .email-shell {
      width: 100%;
      background: var(--canvas);
      padding: 42px 18px;
    }

    .email {
      width: 100%;
      max-width: 620px;
      margin: 0 auto;
      background: var(--panel);
    }

    /* Header / Maison mark */
    .header {
      padding: 30px 38px 24px;
      background: var(--canvas-deep);
      border: 1px solid var(--line);
      border-bottom: 0;
    }

    .brand {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 25px;
      line-height: 1;
      font-style: italic;
      font-weight: 500;
      letter-spacing: -0.5px;
      color: var(--ink);
    }

    .brand-mark {
      color: var(--blue);
      font-style: normal;
    }

    .edition {
      margin-top: 11px;
      font-family: "Courier New", Courier, monospace;
      font-size: 9px;
      line-height: 1.4;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--ink-soft);
    }

    /* Main correspondence */
    .content {
      border: 1px solid var(--line);
      padding: 42px 38px 40px;
    }

    .eyebrow {
      margin: 0 0 17px;
      font-family: "Courier New", Courier, monospace;
      font-size: 9px;
      line-height: 1.4;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--blue-deep);
    }

    h1 {
      margin: 0 0 18px;
      max-width: 500px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 36px;
      line-height: 1.08;
      font-style: italic;
      font-weight: 400;
      letter-spacing: -0.7px;
      color: var(--ink);
    }

    .salutation {
      margin: 0 0 20px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 17px;
      line-height: 1.5;
      color: var(--ink);
    }

    p {
      margin: 0 0 20px;
      font-size: 14px;
      line-height: 1.7;
      color: var(--ink-soft);
    }

    .rule {
      height: 1px;
      background: var(--line);
      margin: 30px 0;
    }

    /* Verification action */
    .action {
      margin: 31px 0 30px;
    }

    .button {
      display: inline-block;
      padding: 14px 24px;
      background: var(--ink);
      border: 1.5px solid var(--ink);
      color: var(--canvas) !important;
      font-size: 11px;
      line-height: 1.2;
      font-weight: 600;
      letter-spacing: 0.11em;
      text-transform: uppercase;
      text-decoration: none;
    }

    .button:hover {
      background: var(--canvas);
      color: var(--ink) !important;
    }

    .expiry {
      margin: 0;
      font-family: "Courier New", Courier, monospace;
      font-size: 10px;
      line-height: 1.65;
      letter-spacing: 0.03em;
      color: var(--ink-soft);
    }

    /* Fallback URL */
    .fallback {
      margin-top: 31px;
      padding: 20px 0 0;
      border-top: 1px solid var(--line);
    }

    .fallback-label {
      margin: 0 0 8px;
      font-family: "Courier New", Courier, monospace;
      font-size: 9px;
      line-height: 1.4;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--ink-soft);
    }

    .fallback-url {
      display: block;
      font-size: 11px;
      line-height: 1.55;
      color: var(--blue-deep);
      text-decoration: none;
      word-break: break-all;
    }

    /* Footer */
    .footer {
      padding: 21px 38px 25px;
      background: var(--canvas-deep);
      border: 1px solid var(--line);
      border-top: 0;
    }

    .footer-row {
      width: 100%;
    }

    .footer-copy {
      font-family: "Courier New", Courier, monospace;
      font-size: 8.5px;
      line-height: 1.6;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink-soft);
    }

    .footer-dot {
      color: var(--blue);
      padding: 0 5px;
    }

    .footer-note {
      margin-top: 12px;
      font-size: 10px;
      line-height: 1.5;
      color: var(--ink-soft);
    }

    @media only screen and (max-width: 640px) {
      .email-shell {
        padding: 18px 10px;
      }

      .header,
      .content,
      .footer {
        padding-left: 25px;
        padding-right: 25px;
      }

      .content {
        padding-top: 34px;
        padding-bottom: 34px;
      }

      h1 {
        font-size: 31px;
      }

      .button {
        display: block;
        text-align: center;
      }
    }
  </style>
</head>

<body>
  <div class="email-shell">
    <table role="presentation" class="email" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td class="header">
          <div class="brand">Groov<span class="brand-mark">y</span></div>
          <div class="edition">Maison Édition &nbsp;—&nbsp; Sound Atelier</div>
        </td>
      </tr>

      <tr>
        <td class="content">
          <div class="eyebrow">Correspondence &nbsp;·&nbsp; Account</div>

          <h1>Verify your<br>email address.</h1>

          <p class="salutation">Hey ${displayName},</p>

          <p>
            Welcome to Groovy. Before you enter the Maison and begin
            streaming high-fidelity audio, we just need to confirm that
            this email address belongs to you.
          </p>

          <div class="rule"></div>

          <div class="action">
            <a
              href="${verificationUrl}"
              class="button"
              target="_blank"
              rel="noopener noreferrer"
            >
              Verify Email Address
            </a>
          </div>

          <p class="expiry">
            This verification link expires in 24 hours.<br>
            If you didn't create a Groovy account, you can safely ignore this message.
          </p>

          <div class="fallback">
            <div class="fallback-label">Button not working?</div>
            <a
              href="${verificationUrl}"
              class="fallback-url"
              target="_blank"
              rel="noopener noreferrer"
            >
              ${verificationUrl}
            </a>
          </div>
        </td>
      </tr>

      <tr>
        <td class="footer">
          <div class="footer-copy">
            Groovy
            <span class="footer-dot">·</span>
            High-Fidelity Streaming
            <span class="footer-dot">·</span>
            Maison Édition
          </div>

          <div class="footer-note">
            A quiet place for the records worth keeping.
          </div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`
  }

  /**
   * Builds modern HTML password reset email template.
   */
  private buildPasswordResetHtmlTemplate(
    displayName: string,
    resetUrl: string,
  ): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your Groovy password</title>
  <style>
    :root {
      --canvas: #FAF8F3;
      --canvas-deep: #F1ECE1;
      --panel: #FFFFFF;
      --ink: #17160F;
      --ink-soft: #79766D;
      --stone: #D8D2C2;
      --blue: #1B5FA6;
      --blue-deep: #123D6B;
      --line: rgba(23,22,15,0.12);
      --line-soft: rgba(23,22,15,0.07);
    }

    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      background: var(--canvas);
      color: var(--ink);
    }

    body {
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI",
        Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    table {
      border-collapse: collapse;
    }

    a {
      color: inherit;
    }

    .email-shell {
      width: 100%;
      background: var(--canvas);
      padding: 42px 18px;
    }

    .email {
      width: 100%;
      max-width: 620px;
      margin: 0 auto;
      background: var(--panel);
      border: 1px solid var(--line);
    }

    .header {
      padding: 30px 34px 22px;
      border-bottom: 1px solid var(--line);
      background: var(--canvas-deep);
    }

    .brand {
      font-family: Georgia, "Times New Roman", serif;
      font-style: italic;
      font-size: 26px;
      line-height: 1;
      color: var(--ink);
      letter-spacing: -0.02em;
    }

    .brand-mark {
      font-style: normal;
      color: var(--blue);
    }

    .edition {
      margin-top: 8px;
      font-family: "SF Mono", Monaco, Consolas, monospace;
      font-size: 10px;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--ink-soft);
    }

    .content {
      padding: 38px 34px 34px;
    }

    .eyebrow {
      font-family: "SF Mono", Monaco, Consolas, monospace;
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--blue-deep);
      margin-bottom: 14px;
    }

    h1 {
      margin: 0 0 16px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 30px;
      line-height: 1.15;
      font-weight: normal;
      letter-spacing: -0.025em;
      color: var(--ink);
    }

    p {
      margin: 0 0 16px;
      font-size: 14px;
      line-height: 1.65;
      color: #38352F;
    }

    .salutation {
      font-weight: 600;
      color: var(--ink);
    }

    .rule {
      margin: 26px 0 28px;
      height: 1px;
      background: var(--line);
    }

    .action {
      text-align: center;
      margin: 30px 0 24px;
    }

    .button {
      display: inline-block;
      background: var(--ink);
      color: #FAF8F3 !important;
      text-decoration: none;
      font-family: "SF Mono", Monaco, Consolas, monospace;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      padding: 14px 28px;
      border: 1px solid var(--ink);
    }

    .expiry {
      font-size: 12px;
      color: var(--ink-soft);
      line-height: 1.6;
      margin-bottom: 24px;
      text-align: center;
    }

    .fallback {
      margin-top: 26px;
      padding: 16px 18px;
      background: var(--canvas);
      border: 1px solid var(--line-soft);
      font-size: 12px;
      line-height: 1.6;
      word-break: break-all;
    }

    .fallback-label {
      font-family: "SF Mono", Monaco, Consolas, monospace;
      font-size: 10px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--ink-soft);
      margin-bottom: 6px;
    }

    .fallback-url {
      color: var(--blue);
      text-decoration: underline;
    }

    .footer {
      padding: 24px 34px 28px;
      background: var(--canvas-deep);
      border-top: 1px solid var(--line);
      text-align: center;
    }

    .footer-copy {
      font-family: "SF Mono", Monaco, Consolas, monospace;
      font-size: 10px;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--ink-soft);
      margin-bottom: 6px;
    }

    .footer-dot {
      color: var(--stone);
      margin: 0 4px;
    }

    .footer-note {
      font-size: 12px;
      font-style: italic;
      color: #8C887E;
    }
  </style>
</head>

<body>
  <div class="email-shell">
    <table role="presentation" class="email" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td class="header">
          <div class="brand">Groov<span class="brand-mark">y</span></div>
          <div class="edition">Maison Édition &nbsp;—&nbsp; Sound Atelier</div>
        </td>
      </tr>

      <tr>
        <td class="content">
          <div class="eyebrow">Security &nbsp;·&nbsp; Password Recovery</div>

          <h1>Reset your<br>password.</h1>

          <p class="salutation">Hey ${displayName},</p>

          <p>
            We received a request to reset the password for your Groovy account.
            Click the button below to choose a new password.
          </p>

          <div class="rule"></div>

          <div class="action">
            <a
              href="${resetUrl}"
              class="button"
              target="_blank"
              rel="noopener noreferrer"
            >
              Reset Password
            </a>
          </div>

          <p class="expiry">
            This reset link expires in 1 hour.<br>
            If you didn't request a password reset, you can safely ignore this message. Your password will remain unchanged.
          </p>

          <div class="fallback">
            <div class="fallback-label">Button not working?</div>
            <a
              href="${resetUrl}"
              class="fallback-url"
              target="_blank"
              rel="noopener noreferrer"
            >
              ${resetUrl}
            </a>
          </div>
        </td>
      </tr>

      <tr>
        <td class="footer">
          <div class="footer-copy">
            Groovy
            <span class="footer-dot">·</span>
            High-Fidelity Streaming
            <span class="footer-dot">·</span>
            Maison Édition
          </div>

          <div class="footer-note">
            A quiet place for the records worth keeping.
          </div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`
  }
}
