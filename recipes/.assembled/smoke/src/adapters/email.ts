import { PostHog } from 'posthog-node'

/** PostHog transactional email template ids; each template's description in PostHog lists the variables it reads. */
export const EMAIL_TEMPLATES: Record<'resetPassword' | 'verifyEmail', string> = {
  resetPassword: '',
  verifyEmail: '',
}

export type EmailTemplate = keyof typeof EMAIL_TEMPLATES

export type EmailMessage = {
  template: EmailTemplate
  to: string
  /** The recipient's user id, so the email's events land on the same person as their product events. */
  distinctId?: string
  data: Record<string, string>
  /** Makes a repeat of the same send a no-op, for sends a job or webhook can retry. */
  idempotencyKey?: string
}

export type EmailDelivery = { send(message: EmailMessage): Promise<void> }

/** Sends through PostHog transactional email; undefined when no email key is configured. */
export function emailDelivery(environment: NodeJS.ProcessEnv = process.env): EmailDelivery | undefined {
  const secretKey = environment.POSTHOG_EMAIL_API_KEY
  const projectToken = environment.VITE_POSTHOG_PROJECT_TOKEN
  if (!secretKey || !projectToken) return undefined
  // A key that may only send email cannot poll flag definitions, which local evaluation would try at startup.
  const posthog = new PostHog(projectToken, { host: environment.VITE_POSTHOG_HOST, secretKey, enableLocalEvaluation: false })

  return {
    async send({ template, to, distinctId, data, idempotencyKey }) {
      const templateId = EMAIL_TEMPLATES[template]
      if (!templateId) throw new Error(`EMAIL_TEMPLATES.${template} has no PostHog template id`)
      const { error } = await posthog.emails.send({ templateId, to, distinctId, templateData: data, idempotencyKey })
      if (error) throw error
    },
  }
}

type AuthEmail = { user: { id: string; email: string; name: string }; url: string }

/** Better Auth's password-reset and verification callbacks, which wait for PostHog to queue each email. */
export function authEmails(delivery: EmailDelivery) {
  return {
    sendResetPassword: ({ user, url }: AuthEmail) =>
      delivery.send({ template: 'resetPassword', to: user.email, distinctId: user.id, data: { name: user.name, url } }),
    sendVerificationEmail: ({ user, url }: AuthEmail) =>
      delivery.send({ template: 'verifyEmail', to: user.email, distinctId: user.id, data: { name: user.name, url } }),
  }
}
