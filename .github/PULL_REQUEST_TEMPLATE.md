Read [CONTRIBUTING.md](https://github.com/gaofeng21cn/one-person-lab/blob/main/CONTRIBUTING.md) before submitting. The principal maintainer account, `gaofeng21cn`, is exempt from the third-party intake requirements below.

## Contribution classification

Select the actual scope. Calling a change a fix does not make an intentional product change a Debug fix.

- [ ] Reproducible Debug
- [ ] Unreproduced Debug, linked to an Issue
- [ ] Behavior change, linked to an Issue
- [ ] New feature, linked to an Issue

## Required evidence

- Related Issue: <!-- required for unreproduced Debug, behavior changes, and new features -->
- Current main / contract checked:
- User-visible or runtime behavior affected:
- Reproduction, root cause, and smallest fix:
- Evidence: tests, logs, traces, screenshots, or caller readback:
- Expected behavior restored, or proposed default / opt-in changes and necessity:

## Maintainer review boundary

Third-party PRs are proposals. A passing CI run, contract edit, or test addition does not establish product necessity. Reproducible Debug may be evaluated directly; unreproduced Debug, behavior changes, and new features require an Issue with enough evidence for maintainers to judge necessity and SSOT fit. A missing required Issue or insufficient explanation or evidence will result in closure with the specific gaps explained. Complete the Issue and evidence, then submit a new, focused PR. A reproducible bug does not authorize unrelated behavior changes in the same PR.
