---
'ras-stack': patch
---

Close the SMTP connection when a send or verification passes `timeoutMs`, so that a server that trickles bytes cannot keep the socket open after the caller gave up.
