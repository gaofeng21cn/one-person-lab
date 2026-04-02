**English** | [中文](./roadmap.zh-CN.md)

# OPL Roadmap

## Current Phase

The priority of the current phase is not to launch all workstreams at once. It is to stabilize the top-level blueprint and the current established reference implementation.

What is already clear today:

- `OPL` serves as a top-level blueprint that defines the task topology and shared foundation of a one-person research lab
- [`MedAutoScience`](https://github.com/gaofeng21cn/med-autoscience) is already the current established reference implementation under the `OPL` umbrella
- `Grant Ops`, `Thesis Ops`, `Review Ops`, and `Presentation Ops` are part of the formal roadmap but remain workstreams under definition

What this phase does not do:

- create empty shells for workstreams whose boundaries are still unclear
- force every task surface into `MedAutoScience`
- present `OPL` as a fully implemented umbrella system

## Next Phase

The next phase should prioritize:

- making the shared foundation of `OPL` more explicit, especially the memory, governance, and delivery layers
- choosing the most suitable next workstream to define through a clear task boundary and delivery object
- continuing to keep `MedAutoScience` independent as the medical research-ops surface

Among current candidates, the more natural priority order is usually:

- `Grant Ops`
- `Review Ops`
- `Thesis Ops`
- `Presentation Ops`

The first two are more directly reusable from the current research chain.

## Later Phase

Only after a second workstream boundary becomes sufficiently stable should `OPL` move into a fuller ecosystem expression, for example:

- a more formal workstream status maintenance model
- an organization profile or docs site as the unified public entry point
- more explicit cross-workstream shared protocols

The condition for entering this phase is not a large number of possible directions. It is having at least two workstreams that have become clear, independent implementation surfaces.

## Current Evaluation Criteria

To judge whether `OPL` is progressing in the right direction, these checks matter:

- can external readers understand that `OPL` is a blueprint rather than a single product?
- can external readers understand that `MedAutoScience` is one implementation surface under that blueprint rather than a synonym for it?
- are new task surfaces being defined as formal workstreams rather than scattered feature requests?
- is the shared foundation becoming more clearly specified rather than remaining slogan-like?
