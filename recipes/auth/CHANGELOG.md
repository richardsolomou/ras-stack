# auth

## 3

Group `better-auth` with its plugins in Dependabot, because a plugin pins Better Auth's core version and a lone `better-auth` bump splits the types and fails the build.

Upgrade: add the `better-auth` group to `.github/dependabot.yml` before the patch and minor groups, and drop any ignore entry for `@better-auth/*` plugins.

## 2

Declare `zod`, because an older `zod` in the application made every sign-in answer 500 in the built server. Classify Better Auth's `account not linked` callback code, and test `useAuthAction` with React's `createRoot` in happy-dom instead of the deprecated `react-test-renderer`.

Upgrade: install the packages `update` lists, raising `zod` even when the application's own code was written for an older 4.x.

## 1

Better Auth on TanStack Start: server configuration, auth route, session helpers, client, sign-in failure classification, local redirects, and `useAuthAction`.
