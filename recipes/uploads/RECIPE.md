---
name: uploads
version: 1
summary: Resumable tus uploads stored under the data directory, with owners, limits, and cleanup.
requires: [start-app]
conflicts: []
dependencies: ['@tus/server', '@tus/file-store', tus-js-client]
devDependencies: []
wires: [.gitignore, src/server/app.ts]
---

# uploads

## Use it when

Users send files the server keeps: models, photos, documents, attachments. Uploads resume after a dropped connection or a closed tab, so large files and slow links work.

It stores files on the container's disk, which suits one container on Dokploy with a `/data` volume. For several replicas, or on Cloudflare, store in object storage instead (`@tus/s3-store` behind the same server, or presigned uploads). A small form field that is part of a form submission does not need resumable uploads.

## Decisions

- **The tus protocol, through `@tus/server` and `tus-js-client`.** It resumes from the last byte the server stored, uploads in chunks, and leaves locking, offsets, and expiry to a maintained server instead of a hand-written protocol subset.
- **Files live under `$DATA_DIR/uploads`** (`.data/uploads` locally, `/data/uploads` in the container), each with a `.json` record of its size, offset, and metadata beside it. The mechanics need no database, so the recipe works before one exists.
- **The server stamps the owner.** `owner(request)` from `src/server/app.ts` names who is uploading, and the server writes it into the upload's metadata, replacing any `owner` the client sent. Every later request on that upload must come from the same owner. Someone else's upload answers 404, exactly like a missing one, so ids cannot be probed.
- **The application records what finished.** `complete(owner, upload)` runs when the last byte arrives, for example to insert a database row or publish a realtime event. If it fails, the client sees an error, but the bytes are already stored; when the client resumes, its `HEAD` finds the upload finished, so `complete` runs again there. It must therefore be idempotent. Without this, a client that resumed a finished upload would report success for a file the application never recorded.
- **Uploads are same-origin.** POST, PATCH, and DELETE pass `requireSameOrigin`; HEAD is exempt because browsers send no `Origin` on it and it changes nothing. tus answers `Access-Control-Allow-Origin: *` by default; `allowedOrigins: []` turns CORS off.
- **No GET.** tus would serve stored files from the app's origin, where an uploaded HTML or SVG file runs as the app. The application serves downloads from its own route, after its own access check, using `uploads.file(id)` and a `Content-Disposition: attachment` response unless it knows the type is safe.
- **Limits are application policy.** `src/server/uploadPolicy.ts` holds them: 100 MB per file; three unfinished uploads, 500 files, and 1 GB in total per owner; 2,000 files and 10 GB for the whole deployment; and a filename without a path or control characters. The deployment limits exist because uploads share the `/data` volume with the database, and a full disk stops SQLite writing. Files are counted as well as bytes, because empty files cost no bytes and would otherwise pass every byte limit without end. The limits count files on disk, finished or not, so they hold for what the disk actually stores. Over a per-owner limit answers 413, over a deployment limit 507. The length must be declared up front, so every limit applies before the first byte. tus enforces the file size on creation and on every chunk.
- **Each creation reads every upload record.** That is how it counts what is stored without a database, and the deployment file limit bounds the work to 2,000 small JSON reads. An in-memory index would have to follow expiry sweeps, cancellations, and partial writes it does not see, which costs more than the reads; an application that raises the file limit far beyond that counts rows in its database instead.
- **Creations run one at a time.** Each creation counts the stored uploads and then creates one, so two concurrent requests could otherwise both see room for one more. The lock is in memory, which holds for one replica.
- **Abandoned uploads free their slot.** Cancelling deletes the upload on the server, so it stops counting at once. An unfinished upload nobody has written to for 15 minutes is deleted the next time its owner starts one, so a few failed or stalled uploads do not block new ones until expiry. Every unfinished upload is deleted 24 hours after it started by an hourly sweep. Finished uploads stay until the application deletes them with `uploads.remove(id)`, and a client cannot delete one, since it belongs to the application's records.
- **Unexpected failures stay on the server.** tus answers an unexpected error with its raw message, which can name storage paths, and logs nothing. Any 5xx is logged as `upload_failed` and answers `upload failed`. The policy's 4xx messages reach the browser as written.
- **The client sends 32 MB chunks.** Proxies in front of the app cap request bodies (Cloudflare at 100 MB), and a failed chunk costs less to resend. It retries after 0, 1, 3, and 5 seconds, and remembers an unfinished upload by file name, type, size, and modification time, so choosing the same file again resumes it; the record is removed once the upload finishes.
- **Cancellation settles at once.** Aborting the signal rejects with an `AbortError` straight away, and deleting the upload on the server continues in the background. Aborting while the client is still looking for an earlier upload to resume means it never starts.

## Files

| File                          | Job                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/server/uploads.ts`       | `createUploads`: the tus server, owners, same-origin checks, completion, cleanup, `file`, and `remove`.   |
| `src/server/uploadPolicy.ts`  | Application policy: size limits, per-owner and deployment limits, expiry, and `uploadRejected`.           |
| `src/routes/api/uploads.$.ts` | `/api/uploads` and `/api/uploads/<id>` for POST, HEAD, PATCH, and DELETE.                                 |
| `src/client/uploads.ts`       | `uploadFile(file, { metadata, onProgress, signal })`, resolving with the upload's URL.                    |
| `src/**/*.test.ts`            | The protocol against a real store: owners, limits, abandonment, completion, cancellation, and the client. |

The upload's id is the last segment of the URL `uploadFile` resolves with; `complete` receives the same `upload.id`. Extra metadata from `uploadFile`'s `metadata` reaches `acceptUpload` and `complete` as `upload.metadata`.

## Wiring

See `stacks/full-stack/`:

- `.gitignore`: add `.data/`.
- `src/server/app.ts`: create the instance in `createApp` with the two hooks and return it:

  ```ts
  const uploads = resources.adopt(createUploads({ owner, complete }), (instance) => instance.close())
  return { uploads, close: () => resources.disposeAsync() }
  ```

  - With `auth`: `owner: async (request) => (await currentUser(request))?.id`. Without it, uploads need some other notion of who is uploading.
  - With a database recipe: `complete` inserts a row keyed by `upload.id` with `onConflictDoNothing()` (the `upload` table in `stacks/full-stack/src/db/schema.ts`), so a repeated call is harmless, and deleting a record calls `app().uploads.remove(id)` after deleting the row. A database-backed application that wants its limits in the same transaction as its records can count rows in `acceptUpload` instead of files.
  - With `realtime`: create `realtime` first and publish from `complete`, such as `realtime.publish(\`user:${owner}\`, { type: 'upload.finished', id: upload.id })`.

`deploy-dokploy`'s Dockerfile already sets `DATA_DIR=/data` and creates `/data` for the `node` user; mount a volume there so uploads survive redeploys.

## Configuration

| Variable   | Where       | Value                                                                      |
| ---------- | ----------- | -------------------------------------------------------------------------- |
| `DATA_DIR` | Server only | The data directory; uploads go in `uploads/` under it. `.data` by default. |

Back up `$DATA_DIR/uploads` together with the database, since each needs the other.

## Verify

- Upload a file from the browser: progress reaches 100%, `uploadFile` resolves with `/api/uploads/<id>`, `complete` runs once, and `$DATA_DIR/uploads/<id>` holds the bytes.
- Reload the page halfway through a large upload and choose the same file again: it resumes from where it stopped.
- A HEAD for that upload from another user answers 404, and a fourth simultaneous unfinished upload answers 429.
