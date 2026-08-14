---
'ras-stack': patch
---

A release run that finds its branch has moved on now stands down instead of failing. Merging a second pull request while the first one's release is still queued is ordinary, and the run for the current head releases every pending changeset, so the earlier run has nothing left to do. It records `created=false` and a notice rather than a red build. A release that is genuinely stuck still fails loudly, because the existing tag-already-exists check is untouched.
