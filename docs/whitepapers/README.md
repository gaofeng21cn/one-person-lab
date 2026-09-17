# Whitepapers

Owner: `one-person-lab`
Purpose: `whitepaper_source_root`
State: `active`
Machine boundary: Source prose and the family catalog for public whitepapers.
Build, publication and generated-output rules belong to
[`docs/delivery/whitepapers/README.md`](../delivery/whitepapers/README.md) and
[`docs/site/README.md`](../site/README.md); this directory does not own those workflows.

Each whitepaper owns its prose and build profile. A repository may own more than
one whitepaper; OPL Framework owns the OPL family narrative and the independent
Framework architecture narrative. App, Cloud and MAS retain their own prose and
profiles. The pointer-only family registry is
`contracts/opl-framework/public-whitepaper-registry.json`.

The editorial contract is purpose-first: explain the user problem, the design
choice, the user-visible consequence, a concrete scenario, and the trust
boundary. Profiles constrain artifact shape and public URLs; they must not pin
narrative section wording or turn the whitepaper into a feature checklist.

This repository's current source:

- [opl-whitepaper.md](./opl-whitepaper.md) (OPL family design and product philosophy)
- [opl-framework-whitepaper.md](./opl-framework-whitepaper.md) (Framework architecture and design philosophy)
- [index.md](./index.md) (family catalog published at `/latest/whitepapers/`)
