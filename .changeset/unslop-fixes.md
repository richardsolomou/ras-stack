---
'ras-stack': patch
---

Fix several edge cases found while simplifying the package:

- `spacetime` accepts plain HTTP to every loopback host, including `[::1]` and `127.0.0.0/8`, as documented.
- `persistedSecret` rejects a zero-byte secret instead of persisting an empty string.
- `CentrifugoPublisher` no longer stalls when publishing to an empty channel name.
- `ras assets sync` rejects asset paths that resolve to their parent directory, so a `.` destination can no longer delete the server build.
- `ras` prints command errors without a stack trace, and `ras realtime` accepts `--option=value`.
- `ras preview` always names its check `PR preview deploy`; `PREVIEW_CHECK_NAME` is no longer read.
