# `opl-client` — Pure-Stdlib Python SDK for OPL Framework v2

Zero-dependency Python 3.12+ client for communicating with local `opld` over Unix Domain Socket (`AF_UNIX`) or Windows Named Pipe (`\\.\pipe\...`).

## Usage

```python
from opl_client import OplClient, OplRpcError

with OplClient(client_kind="sdk_python") as cli:
    snap = cli.knowledge_snapshot("ws-1", "sr-1")
    cli.append_ledger("task-1", "artifact_ref", "mas", {"path": "out/report.md", "sha256": "..."})
    events = cli.drain_events()
    timeline = cli.ledger_timeline("task-1")
```

## Development & Tests

```bash
PYTHONPATH=sdks/python-client/src python3 -m unittest discover -s sdks/python-client/tests -v
node sdks/python-client/tests/test_opld_e2e.mjs
```
