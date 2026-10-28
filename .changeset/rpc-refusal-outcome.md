---
'ras-stack': patch
---

Record server functions that throw a 4xx `Response` with the `refused` outcome and an `http.response.status_code` span attribute, instead of marking their span and request metric as errors.
