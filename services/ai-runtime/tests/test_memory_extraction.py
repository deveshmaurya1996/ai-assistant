from memory.extraction import (
    _parse_facts_json,
    dedupe_facts,
    fact_fingerprint,
    normalize_fact_content,
)


def test_parse_facts_json_array():
    raw = '[{"type":"FACT","content":"User prefers dark mode"}]'
    facts = _parse_facts_json(raw)
    assert len(facts) == 1
    assert facts[0]["type"] == "FACT"
    assert "dark mode" in facts[0]["content"]


def test_parse_facts_json_empty():
    assert _parse_facts_json("[]") == []
    assert _parse_facts_json("not json") == []


def test_parse_facts_json_fenced():
    raw = '```json\n[{"type":"PREFERENCE","content":"Calls me Alex"}]\n```'
    facts = _parse_facts_json(raw)
    assert len(facts) == 1
    assert facts[0]["type"] == "PREFERENCE"


def test_parse_facts_caps_at_three():
    raw = "[" + ",".join(
        f'{{"type":"FACT","content":"fact {i}"}}' for i in range(5)
    ) + "]"
    assert len(_parse_facts_json(raw)) == 3


def test_normalize_fact_content():
    assert normalize_fact_content("  Hello   World  ") == "hello world"


def test_dedupe_facts_collapses_duplicates():
    facts = [
        {"type": "FACT", "content": "User works at Acme"},
        {"type": "FACT", "content": "user works at acme"},
        {"type": "FACT", "content": "User prefers dark mode"},
    ]
    out = dedupe_facts(facts)
    assert len(out) == 2
    assert fact_fingerprint(out[0]["content"]) != fact_fingerprint(out[1]["content"])
