from __future__ import annotations

from typing import Any, Mapping


def _text(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def _require_string(value: object, field: str) -> str:
    text = _text(value)
    if text is None:
        raise ValueError(f"family orchestration 缺少字符串字段: {field}")
    return text


def resolve_family_product_entry_preset(
    *,
    product_entry_node_id: str | None,
    direct_node_id: str | None,
    opl_hosted_node_id: str | None,
    progress_node_id: str | None,
    direct_transition_event: str | None,
    opl_hosted_transition_event: str | None,
    direct_progress_event: str | None,
    opl_hosted_progress_event: str | None,
    opl_hosted_title: str | None,
    opl_hosted_surface_kind: str | None,
) -> dict[str, str | None]:
    resolved_opl_hosted_title = _text(opl_hosted_title)
    resolved_opl_hosted_surface_kind = _text(opl_hosted_surface_kind)
    if bool(resolved_opl_hosted_title) != bool(resolved_opl_hosted_surface_kind):
        raise ValueError("family orchestration OPL-hosted step requires both title and surface_kind")
    return {
        "product_entry_node_id": _text(product_entry_node_id) or "step:open_product_entry",
        "direct_node_id": _text(direct_node_id) or "step:continue_current_loop",
        "opl_hosted_node_id": _text(opl_hosted_node_id) or "step:opl_bridge_handoff",
        "progress_node_id": _text(progress_node_id) or "step:inspect_current_progress",
        "direct_transition_event": _text(direct_transition_event) or "start_direct",
        "opl_hosted_transition_event": _text(opl_hosted_transition_event) or "enter_via_opl_bridge",
        "direct_progress_event": _text(direct_progress_event) or "session_started",
        "opl_hosted_progress_event": _text(opl_hosted_progress_event) or "handoff_completed",
        "opl_hosted_title": resolved_opl_hosted_title,
        "opl_hosted_surface_kind": resolved_opl_hosted_surface_kind,
    }


def build_family_product_entry_preset_graph_parts(
    *,
    product_entry_title: str,
    product_entry_surface_kind: str,
    direct_title: str,
    direct_surface_kind: str,
    progress_title: str,
    progress_surface_kind: str,
    review_gate_id: str,
    review_gate_title: str | None,
    review_gate_status: str | None,
    review_surface: Mapping[str, Any] | None,
    resolved: Mapping[str, str | None],
) -> dict[str, Any]:
    resolved_product_entry_node_id = _require_string(resolved.get("product_entry_node_id"), "product_entry_node_id")
    resolved_direct_node_id = _require_string(resolved.get("direct_node_id"), "direct_node_id")
    resolved_opl_hosted_node_id = _require_string(resolved.get("opl_hosted_node_id"), "opl_hosted_node_id")
    resolved_progress_node_id = _require_string(resolved.get("progress_node_id"), "progress_node_id")
    resolved_direct_transition_event = _require_string(resolved.get("direct_transition_event"), "direct_transition_event")
    resolved_opl_hosted_transition_event = _require_string(
        resolved.get("opl_hosted_transition_event"), "opl_hosted_transition_event"
    )
    resolved_direct_progress_event = _require_string(resolved.get("direct_progress_event"), "direct_progress_event")
    resolved_opl_hosted_progress_event = _require_string(
        resolved.get("opl_hosted_progress_event"), "opl_hosted_progress_event"
    )
    resolved_opl_hosted_title = resolved.get("opl_hosted_title")
    resolved_opl_hosted_surface_kind = resolved.get("opl_hosted_surface_kind")

    nodes: list[dict[str, Any]] = [
        {
            "node_id": resolved_product_entry_node_id,
            "node_kind": "product_entry",
            "title": _require_string(product_entry_title, "product_entry_title"),
            "surface_kind": _require_string(product_entry_surface_kind, "product_entry_surface_kind"),
        },
        {
            "node_id": resolved_direct_node_id,
            "node_kind": "direct_entry",
            "title": _require_string(direct_title, "direct_title"),
            "surface_kind": _require_string(direct_surface_kind, "direct_surface_kind"),
            "produces_checkpoint": True,
        },
    ]
    edges: list[dict[str, Any]] = [
        {
            "from": resolved_product_entry_node_id,
            "to": resolved_direct_node_id,
            "on": resolved_direct_transition_event,
        }
    ]
    checkpoint_nodes = [resolved_direct_node_id]
    has_opl_hosted_entry = bool(resolved_opl_hosted_title and resolved_opl_hosted_surface_kind)

    if has_opl_hosted_entry:
        nodes.append(
            {
                "node_id": resolved_opl_hosted_node_id,
                "node_kind": "opl_hosted_entry",
                "title": resolved_opl_hosted_title,
                "surface_kind": resolved_opl_hosted_surface_kind,
                "produces_checkpoint": True,
            }
        )
        edges.append(
            {
                "from": resolved_product_entry_node_id,
                "to": resolved_opl_hosted_node_id,
                "on": resolved_opl_hosted_transition_event,
            }
        )
        checkpoint_nodes.append(resolved_opl_hosted_node_id)

    nodes.append(
        {
            "node_id": resolved_progress_node_id,
            "node_kind": "progress_read",
            "title": _require_string(progress_title, "progress_title"),
            "surface_kind": _require_string(progress_surface_kind, "progress_surface_kind"),
            "produces_checkpoint": True,
        }
    )
    edges.append(
        {
            "from": resolved_direct_node_id,
            "to": resolved_progress_node_id,
            "on": resolved_direct_progress_event,
        }
    )
    if has_opl_hosted_entry:
        edges.append(
            {
                "from": resolved_opl_hosted_node_id,
                "to": resolved_progress_node_id,
                "on": resolved_opl_hosted_progress_event,
            }
        )
    checkpoint_nodes.append(resolved_progress_node_id)

    human_gate_preview: dict[str, Any] = {
        "gate_id": _require_string(review_gate_id, "review_gate_id"),
        "status": _text(review_gate_status) or "requested",
    }
    if _text(review_gate_title) is not None:
        human_gate_preview["title"] = _text(review_gate_title)
    if isinstance(review_surface, Mapping):
        human_gate_preview["review_surface"] = dict(review_surface)

    return {
        "nodes": nodes,
        "edges": edges,
        "entry_nodes": [resolved_product_entry_node_id],
        "exit_nodes": [resolved_progress_node_id],
        "human_gates": [
            {
                "gate_id": _require_string(review_gate_id, "review_gate_id"),
                "trigger_nodes": [resolved_progress_node_id],
                "blocking": True,
            }
        ],
        "checkpoint_nodes": checkpoint_nodes,
        "human_gate_previews": [human_gate_preview],
    }
