# Whitepapers

Owner: `one-person-lab`
Purpose: `whitepaper_source_root`
State: `active`
Machine boundary: Source prose for public whitepapers. Generated HTML/PDF live
under local `docs/site/latest/` and are published from the local build to the
latest GitHub Pages copy, not tracked release-by-release files on `main`.

OPL-family whitepapers use the shared local builder
`scripts/opl-whitepaper-builder.ts`; each repo keeps only a small
`scripts/build-opl-*-whitepaper.ts` configuration wrapper. From the Framework
repo, `npm run docs:whitepapers:family` runs the App, Framework, and Cloud
whitepaper builds with the same PDF style profile.

Current source:

- `opl-whitepaper.md`
