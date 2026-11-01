---
'ras-stack': patch
---

Require nodemailer 9.0.3 or later, the first version that upgrades a supplied socket to TLS, so that a `secure` SMTP connection with `timeoutMs` never sends credentials in cleartext.
