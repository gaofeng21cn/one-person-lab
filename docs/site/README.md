# Latest Published Docs

Owner: `one-person-lab`
Purpose: `latest_published_docs_output_boundary`
State: `active_support`
Machine boundary: `docs/site/latest/` is generated output for GitHub Pages.
Source truth stays in `docs/whitepapers/` and verification records under
`docs/delivery/`.

This repo publishes one current public whitepaper copy, not one copy per
release. CI builds `docs/site/latest/` and deploys `docs/site/` to GitHub Pages.

Generated output:

- `docs/site/latest/whitepapers/opl-whitepaper.html`
- `docs/site/latest/whitepapers/opl-whitepaper.pdf`

Do not commit `docs/site/latest/`. Rebuild it with `npm run docs:latest`.
