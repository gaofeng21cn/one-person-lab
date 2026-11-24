# Latest Published Docs

Owner: `one-person-lab`
Purpose: `latest_published_docs_output_boundary`
State: `active_support`
Machine boundary: `docs/site/latest/` is local generated output for GitHub
Pages. It is not tracked on `main`.
Source truth stays in `docs/whitepapers/` and
`contracts/whitepaper_profile.json`. Artifact verification is generated beside
the ignored HTML/PDF bundle; publication receipts are GitHub Actions artifacts.

`npm run docs:whitepaper`, `npm run docs:whitepaper:framework`,
`npm run docs:whitepaper:miniapp`, and `npm run docs:whitepaper:occ` generate the
local whitepaper outputs held in this repository.
`npm run docs:whitepapers:family` builds all registry entries and stages the
atomic publication candidate outside this directory. Build and publication
evidence is documented in [`docs/delivery/whitepapers/README.md`](../delivery/whitepapers/README.md).

Generated output (this repository's local sources):

- `docs/site/latest/whitepapers/opl-whitepaper.{html,pdf,verification.json}`
- `docs/site/latest/whitepapers/opl-framework-whitepaper.{html,pdf,verification.json}`
- `docs/site/latest/whitepapers/opl-miniapp-whitepaper.{html,pdf,verification.json}`
- `docs/site/latest/whitepapers/opl-capital-compass-whitepaper.{html,pdf,verification.json}`
- `docs/site/latest/whitepapers/index.html`

Do not commit `docs/site/latest/` on `main`. `npm run docs:latest` is the local
OPL family source build; the complete public collection is produced by the
family build and published only through the environment-gated workflow.
