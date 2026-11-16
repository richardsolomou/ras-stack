---
name: email-posthog
version: 1
summary: Send transactional email from PostHog email templates.
requires: []
conflicts: [email-smtp]
dependencies: [posthog-node]
devDependencies: []
wires: [src/server/auth.ts]
---

# email-posthog

## Use it when

The application sends its own transactional email: password resets, verification, receipts, notifications. This is the default.

Use `email-smtp` instead when the product sends through a mail server someone else configures, such as a workspace that brings its own SMTP host. Resend and other providers are not recipes; PostHog covers the same need without another account, and its sends land on the same person as the product's events.

## Decisions

- **Templates live in PostHog, not in code.** Copy changes do not need a deploy, and PostHog records delivery, bounces, and complaints per email. The code refers to each template by id in `EMAIL_TEMPLATES`, and each template's description in PostHog lists the variables it reads.
- **A dedicated key that can only send email.** `POSTHOG_EMAIL_API_KEY` is a project secret key with only the `hog_flow:write` scope. The client sets `enableLocalEvaluation: false`, because a key with no feature-flag scope fails when the SDK polls flag definitions at startup.
- **Email is optional at runtime.** `emailDelivery()` returns `undefined` without the key or project token, so local development and previews run without email. Code that needs email decides what to do without it, for example hiding password reset.
- **A missing template id throws on send**, naming the template, instead of sending a request PostHog will refuse with a less specific error.
- **Errors throw.** `posthog.emails.send` resolves `{ data, error }` and never rejects; the adapter turns `error` into a rejection, so a failed reset email fails the request instead of silently succeeding.
- **`distinctId` is the user id**, so email events join the recipient's product history instead of creating a person keyed by email address.
- **No idempotency key on auth emails.** Each reset or verification request carries a new token, so a repeated request is a new email. Pass `idempotencyKey` for sends a job or webhook can retry, derived from what the email is for, such as `receipt:<order id>`.
- **`authEmails()` is the contract with the auth recipe.** `email-smtp` exports the same function, so switching email recipes does not change `src/server/auth.ts`.

## Files

| File                         | Job                                                                    |
| ---------------------------- | ---------------------------------------------------------------------- |
| `src/adapters/email.ts`      | Template ids, the PostHog delivery, and Better Auth's email callbacks. |
| `src/adapters/email.test.ts` | Disabled states, the email-only client options, sending, and errors.   |

## Wiring

With the `auth` recipe, pass the callbacks to Better Auth in `src/server/auth.ts` when delivery is configured. See `stacks/full-stack/src/server/auth.ts`:

- `emailAndPassword` gets `sendResetPassword` from `authEmails(email)`.
- `emailVerification` gets `sendVerificationEmail` from `authEmails(email)`.

Elsewhere, create the delivery once at startup with `emailDelivery()` and pass it to the code that sends.

## Configuration

| Variable                     | Where       | Value                                                    |
| ---------------------------- | ----------- | -------------------------------------------------------- |
| `POSTHOG_EMAIL_API_KEY`      | Server only | Project secret key with only the `hog_flow:write` scope. |
| `VITE_POSTHOG_PROJECT_TOKEN` | Both        | The project token, shared with the `posthog-web` recipe. |
| `VITE_POSTHOG_HOST`          | Both        | Optional; US Cloud by default. Set it for EU Cloud.      |

In PostHog, set up an email sending domain, then create one transactional template per entry in `EMAIL_TEMPLATES` and paste its id:

| Template        | Variables                                     |
| --------------- | --------------------------------------------- |
| `resetPassword` | `{{ variables.name }}`, `{{ variables.url }}` |
| `verifyEmail`   | `{{ variables.name }}`, `{{ variables.url }}` |

List each template's variables in its PostHog description, so whoever edits the copy knows what the code sends.

## Verify

With the key set, request a password reset for a real address. The email arrives, and PostHog shows it under the recipient's person.
