# Latest Published Docs

Owner: `one-person-lab`
Purpose: `latest_published_docs_output_boundary`
State: `active_support`
Machine boundary: `docs/site/latest/` is local generated output for GitHub
Pages. It is not tracked on `main`.
Source truth stays in `docs/whitepapers/` and
`contracts/whitepaper_profile.json`. Artifact verification is generated beside
the ignored HTML/PDF bundle; publication receipts are GitHub Actions artifacts.

This repo publishes one current public whitepaper copy plus the four-document
family catalog. A normal push builds a reviewable immutable bundle. An explicit
`workflow_dispatch` with `publish=true` enters the `whitepaper-production`
Environment, deploys the same bundle without rebuilding, and verifies the live
HTML/PDF/catalog bytes before writing a publication receipt.

Generated output:

- `docs/site/latest/whitepapers/opl-whitepaper.html`
- `docs/site/latest/whitepapers/opl-whitepaper.pdf`
- `docs/site/latest/whitepapers/opl-whitepaper.verification.json`
- `docs/site/latest/whitepapers/index.html`

Do not commit `docs/site/latest/` on `main`. Rebuild it with
`npm run docs:latest`. `npm run docs:publish` no longer force-pushes a locally
generated orphan branch; it requests the approved remote workflow from clean,
current `main`.
