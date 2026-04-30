from app.agent.negotiator import _normalize_chat_role


def test_normalize_chat_role_maps_internal_roles_to_provider_safe_roles():
    assert _normalize_chat_role("seller") == "user"
    assert _normalize_chat_role("merchant") == "assistant"
    assert _normalize_chat_role("user") == "user"
    assert _normalize_chat_role("assistant") == "assistant"
    assert _normalize_chat_role("system") == "system"
    assert _normalize_chat_role("weird-role") == "user"
