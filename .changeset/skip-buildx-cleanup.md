---
'ras-stack': patch
---

Skip removing the image builder at the end of jobs on GitHub-hosted runners, which took up to a minute per build.
