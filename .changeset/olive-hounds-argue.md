---
'ras-stack': patch
---

`canonicalRedirect` no longer redirects a request that arrived over the loopback interface. Centrifugo's connect proxy calls the application on `127.0.0.1`, which can never match the canonical host, so the middleware answered it with a 301. Go's HTTP client follows that redirect and turns the POST into a GET, which lands on the page shell and hands Centrifugo HTML to parse as JSON — surfacing in the browser as `{code: 100, message: "internal server error", temporary: true}` and retrying forever.

Applications no longer need `/api/centrifugo/connect` in `pathsServedOnAnyHost`. Leaving it there is harmless.
