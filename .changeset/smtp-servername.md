---
'ras-stack': minor
---

Accept a TLS server name in the SMTP configuration so that applications can connect to an address they resolved and checked while still verifying the certificate for the original hostname, and accept a timeout so that a slow or unresponsive server cannot hold a send or verification open.
