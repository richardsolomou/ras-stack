---
name: email-smtp
version: 1
summary: Send transactional email through an SMTP server, with a hard deadline on every exchange.
requires: []
conflicts: [email-posthog]
dependencies: [nodemailer]
devDependencies: ['@types/nodemailer']
wires: [src/server/auth.ts]
---

# email-smtp

## Use it when

The product sends through a mail server someone else configures: a self-hosted product whose operator brings their own SMTP host or relay, or a workspace that enters its own mail server in settings. SMTP is the one protocol every provider and relay speaks, so the operator chooses.

Use `email-posthog` instead when the application sends its own email from a domain you control. It keeps the copy in PostHog templates and records delivery per person, which SMTP cannot.

## Decisions

- **Credentials only travel over TLS.** With a user configured, the transport sets `requireTLS`, so a server or attacker that strips the STARTTLS offer fails the send instead of receiving the password in plain text. An unauthenticated local server, such as Mailpit, still works without TLS.
- **Copy lives in code.** SMTP has no templates, so `authEmails()` carries the reset and verification copy in plain text and HTML, with `PRODUCT_NAME` in the subject. Edit the copy in place; an application with translated copy writes its own callbacks around `send` with the same shape.
- **`authEmails()` is the contract with the auth recipe.** It returns Better Auth's `sendResetPassword` and `sendVerificationEmail` with the same parameters as `email-posthog`, so switching email recipes does not change `src/server/auth.ts`. `EmailMessage` differs between the two (subject, text, and HTML here; a template and its data there), so code that calls `send` directly changes with the recipe.
- **Email is optional at runtime.** `emailDelivery()` returns `undefined` when neither `SMTP_HOST` nor `EMAIL_FROM` is set, so development and previews run without a mail server. Setting only one of them, a port outside 1–65535, or a user without a password throws at startup instead of failing on the first send.
- **Every exchange has a deadline, 20 seconds by default.** A server the application does not control can hold a connection for nodemailer's ten-minute idle timer, and keep it alive past that by trickling one byte at a time, which holds a sign-up or reset request open until the proxy gives up. `timeoutMs` bounds each wait on the server (connect, greeting, socket idle) and the whole exchange.
- **The deadline closes the connection, not just the promise.** nodemailer cannot abort an exchange, so a deadline that only rejected left the mail being sent after the caller was told it failed. Each exchange gets its own socket, and the deadline destroys it. Node revives a destroyed socket when `connect` is called on it, so a deadline that fires before nodemailer connects also destroys the socket as soon as it connects; `email.deadline.test.ts` covers both against real local servers. A non-pooled nodemailer transport opens a connection per message anyway, so the per-exchange socket costs nothing. nodemailer must stay at 9.0.3 or later: earlier versions connect a supplied socket without the TLS upgrade, so a `secure` connection would send `AUTH` in cleartext.
- **`fromName` changes the display name, never the address.** Sending on behalf of a tenant shows their name, while the address stays `EMAIL_FROM` so SPF and DKIM still pass. `replyTo` sends replies to the tenant instead.
- **Inline images are `cid` attachments.** Remote image URLs fail when the recipient's mail client cannot reach the server, and Gmail blocks `data:` images, so a logo travels as an attachment with a `cid` and the HTML refers to `cid:<value>`.
- **`servername` keeps TLS verified for a resolved address.** An application that resolves a tenant's SMTP host and checks the address is public before connecting (against SSRF) passes the address as `host` and the original name as `servername`, so SNI and certificate verification still use the name.
- **`verify()` connects and authenticates without sending**, for a settings form that checks a mail server before saving it.
- **Errors throw.** A rejected send fails the request, so Better Auth reports a failed reset instead of claiming the email went out.
- **Named exports from `nodemailer`.** nodemailer 10 ships ESM with named exports; the default import of older versions is gone.

## Files

| File                                  | Job                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/adapters/email.ts`               | Environment parsing, SMTP delivery with its deadline, and Better Auth's email callbacks.    |
| `src/adapters/email.test.ts`          | Configuration errors, message options, transport options, timeouts, and the auth copy.      |
| `src/adapters/email.deadline.test.ts` | Real local servers proving the deadline closes the connection, even before it is connected. |

## Wiring

With the `auth` recipe, pass the callbacks to Better Auth in `src/server/auth.ts` when delivery is configured, exactly as with `email-posthog`. See `stacks/full-stack/src/server/auth.ts`:

- `emailAndPassword` gets `sendResetPassword` from `authEmails(email)`.
- `emailVerification` gets `sendVerificationEmail` from `authEmails(email)`.

Elsewhere, create the delivery once at startup with `emailDelivery()` and pass it to the code that sends. For a mail server that a workspace configures, build the `SmtpConfig` from its stored settings and call `smtpDelivery(config)` per send, resolving and checking the host first when the server is hosted (see **Decisions**).

## Configuration

| Variable        | Where       | Value                                                                      |
| --------------- | ----------- | -------------------------------------------------------------------------- |
| `SMTP_HOST`     | Server only | The SMTP server's hostname.                                                |
| `EMAIL_FROM`    | Server only | The sender, such as `Example <mail@example.com>`.                          |
| `SMTP_PORT`     | Server only | Optional; 587 by default.                                                  |
| `SMTP_SECURE`   | Server only | `true` for TLS from the start (port 465); otherwise STARTTLS when offered. |
| `SMTP_USER`     | Server only | Optional; set together with `SMTP_PASSWORD`.                               |
| `SMTP_PASSWORD` | Server only | Optional secret; set together with `SMTP_USER`.                            |

Set `PRODUCT_NAME` in `src/adapters/email.ts` to the name users know the product by. Publish SPF and DKIM records for the `EMAIL_FROM` domain at whoever runs the mail server.

## Verify

With the variables set, request a password reset for a real address. The email arrives from `EMAIL_FROM` with a working link, and its headers show SPF and DKIM passing.
