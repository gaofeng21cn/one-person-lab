# Whitepapers

Owner: `one-person-lab`
Purpose: `whitepaper_source_root`
State: `active`
Machine boundary: Source prose and the family catalog for public whitepapers.
Generated HTML/PDF/verification bundles live under ignored `docs/site/latest/`.
Publication truth comes from the approved bundle plus an exact-byte public
readback receipt, not from this directory or a successful render alone.

Each repository owns its prose and `contracts/whitepaper_profile.json`. OPL
Framework owns the only renderer and family release-set registry:

- `scripts/run-domain-whitepaper.ts`
- `scripts/opl-whitepaper-builder.ts`
- `scripts/whitepaper-style.css`
- `contracts/opl-framework/public-whitepaper-registry.json`

`npm run docs:whitepapers:family` builds OPL Framework, OPL App, OPL Cloud, and
MAS through those profiles. It does not copy renderer source into domain repos.
`npm run docs:whitepapers:family:release` additionally requires every selected
repo to be clean `main == origin/main`.

The editorial contract is purpose-first: explain the user problem, the design
choice, the user-visible consequence, a concrete scenario, and the trust
boundary. Profiles constrain artifact shape and public URLs; they must not pin
narrative section wording or turn the whitepaper into a feature checklist.

Current source:

- `opl-whitepaper.md`
- `index.md` (family catalog published at `/latest/whitepapers/`)
