from orchestration.integration_intent import is_connected_apps_query


def heuristic_connected_apps_query(query: str) -> bool:
    return is_connected_apps_query(query)
