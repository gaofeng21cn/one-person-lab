# Whitepapers

Owner: `one-person-lab`
Purpose: `whitepaper_source_root`
State: `active`
Machine boundary: Source prose and the family catalog for public whitepapers.
Build, publication and generated-output rules belong to
[`docs/delivery/whitepapers/README.md`](../delivery/whitepapers/README.md) and
[`docs/site/README.md`](../site/README.md); this directory does not own those workflows.

Each whitepaper owns its prose and build profile. A repository may own more than
one whitepaper; OPL Framework holds the OPL family narrative, the independent
Framework architecture narrative, the OPL Agent Apps & MiniApp narrative, and
public whitepaper prose for private-repo family agents such as OPL Capital
Compass (OCC) so the central publication workflow stays free of private-repo
secrets. App, Cloud, Flow and MAS retain their own prose and profiles in their
public repositories. The pointer-only family registry is
`contracts/opl-framework/public-whitepaper-registry.json`.

The editorial contract is purpose-first: explain the user problem, the design
choice, the user-visible consequence, a concrete scenario, and the trust
boundary. Profiles constrain artifact shape and public URLs; they must not pin
narrative section wording or turn the whitepaper into a feature checklist.

This repository's current source:

- [opl-whitepaper.md](./opl-whitepaper.md) (OPL family design and product philosophy)
- [opl-framework-whitepaper.md](./opl-framework-whitepaper.md) (Framework architecture and design philosophy)
- [opl-miniapp-whitepaper.md](./opl-miniapp-whitepaper.md) (OPL Agent Apps and MiniApp on-demand collaboration)
- [opl-capital-compass-whitepaper.md](./opl-capital-compass-whitepaper.md) (OPL Capital Compass public whitepaper; implementation repository stays private)
- [index.md](./index.md) (family catalog published at `/latest/whitepapers/`)

Local single-document build helpers:

```sh
npm run docs:whitepaper
npm run docs:whitepaper:framework
npm run docs:whitepaper:miniapp
npm run docs:whitepaper:occ
```

Profiles declare intended publication URLs; they do not prove publication.
Publication is complete only after the environment-gated family workflow publishes
the bundle and records `publication_readback_verified`.
