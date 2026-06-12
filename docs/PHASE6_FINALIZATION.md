# Phase 6 Domain Finalization

Verified on June 12, 2026.

## Current Ownership

| Host | GitHub Pages repository | Current result |
| --- | --- | --- |
| `oms.tastory4u.com` | `GnRjp48/tastory-oms-test` | Tastory OMS, HTTP 200 |
| `tastory4u.com` | None | Released, GitHub Pages HTTP 404 |
| `www.tastory4u.com` | None | Released, GitHub Pages HTTP 404 |

The OMS repository's `main` and `gh-pages` branches both contain:

```text
oms.tastory4u.com
```

No other public repository under `GnRjp48` currently has GitHub Pages enabled
or claims either public website host.

## OMS Configuration

- GitHub Pages source: `gh-pages`
- Custom domain: `oms.tastory4u.com`
- DNS target: `gnrjp48.github.io`
- PWA manifest `id`, `start_url`, and `scope`: `/`
- Supabase Site URL: `https://oms.tastory4u.com`
- Production Auth redirects:
  - `https://oms.tastory4u.com`
  - `https://oms.tastory4u.com/?auth=reset`

The manifest and service-worker paths are origin-relative. A `/` scope on
`oms.tastory4u.com` cannot control `tastory4u.com` or `www.tastory4u.com`.

## Final DNS Layout

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `gnrjp48.github.io` |
| CNAME | `oms` | `gnrjp48.github.io` |

These DNS records can remain in place. Until a public website repository
claims `www.tastory4u.com`, the apex and `www` hosts are expected to show a
GitHub Pages 404.

## Public Website Preparation

Recommended repository:

```text
GnRjp48/tastory-public-website
```

Recommended structure:

- `main`: production source and protected default branch
- feature branches: `codex/<feature>` or another short-lived branch
- GitHub Actions: build and deploy an artifact to GitHub Pages
- public website `CNAME`: `www.tastory4u.com`

When the public repository claims `www.tastory4u.com`, GitHub Pages can serve
`www` and redirect the correctly configured apex domain to `www`. Do not add
the apex domain to the OMS repository.

## Cached Old OMS

An existing browser may still display a previously cached OMS shell at the
apex origin even though the live host returns HTTP 404. Clear site data and
unregister the old service worker for `tastory4u.com`; this does not affect
the installed OMS at `oms.tastory4u.com`.
