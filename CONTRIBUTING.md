# Contributing to One Person Lab Framework

Pairing an Issue with a PR helps maintainers evaluate the user need before reviewing implementation. The repository's [contribution admission policy](docs/policies/third-party-contribution-admission-policy.md) defines the intake rules for both human and Agent maintainers.

| Contribution | Before a third-party PR can be evaluated |
| --- | --- |
| Debug fix that maintainers can reproduce | A direct PR is welcome. Include reproduction steps, environment, expected and actual behavior, and focused validation. |
| Suspected bug that maintainers cannot reproduce | Link a [Bug report](https://github.com/gaofeng21cn/one-person-lab/issues/new?template=bug-report.yml) describing the observed problem, why it matters, and the available evidence. |
| Intentional behavior change or new feature | Link a [proposal Issue](https://github.com/gaofeng21cn/one-person-lab/issues/new?template=feature-or-behavior-change.yml) explaining the user task, necessity, current intent, proposed behavior, and supporting evidence. |

An existing Issue covering the same problem is sufficient; avoid creating duplicates. A linked Issue starts evaluation and does not approve the proposed implementation. Maintainers judge the actual scope of the change, including defaults, restrictions, permissions, compatibility, visibility, and lifecycle. CI success and changes to contracts or tests do not establish product necessity.

If a required Issue is missing, or its explanation or evidence is insufficient, maintainers will explain the gaps and close the PR. Complete the Issue and supporting evidence, then submit a new, focused PR. Keep a reproducible fix separate from additional product changes unless those changes have their own adequate Issue context.

The principal maintainer account, **`gaofeng21cn`**, is exempt from this third-party intake policy. That exemption does not change execution permissions, verification requirements, or release boundaries.

For source and verification conventions, read [AGENTS.md](AGENTS.md) and the [documentation index](docs/README.md). Do not include credentials, customer data, or other private material in public reproduction evidence.
