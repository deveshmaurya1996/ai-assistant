from orchestration.llm.json_parse import parse_llm_json


def test_parse_fenced_json():
    raw = 'Here is the plan:\n```json\n{"capabilities":[{"capability":"drive.search"}]}\n```'
    data = parse_llm_json(raw)
    assert data["capabilities"][0]["capability"] == "drive.search"


def test_parse_bare_json():
    data = parse_llm_json('{"capabilities":[]}')
    assert data == {"capabilities": []}


def test_parse_malformed_returns_empty_capabilities():
    data = parse_llm_json("not json at all")
    assert data.get("capabilities") == []
