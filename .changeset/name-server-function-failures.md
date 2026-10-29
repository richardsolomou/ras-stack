---
'ras-stack': minor
---

RPC failures, logs, and exceptions now name the server function they happened in, and a thrown 5xx `Response` is reported with its status instead of passing silently.
