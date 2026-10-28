---
'ras-stack': patch
---

Clear the realtime client and subscription hooks' values whenever their connection is torn down, so that a caller never holds a disconnected client after its inputs change.
