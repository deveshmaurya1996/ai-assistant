from orchestration.executor import _resolve_connection_id


def test_resolve_connection_id_maps_email_tools_to_google():
    connections = [{"id": "google_user-1", "providerId": "google"}]
    assert _resolve_connection_id("email.read_email", connections) == "google_user-1"
    assert _resolve_connection_id("email.list_unread", connections) == "google_user-1"
    assert _resolve_connection_id("gmail.search", connections) == "google_user-1"
    assert _resolve_connection_id("calendar.list_upcoming", connections) == "google_user-1"
    assert _resolve_connection_id("drive.search", connections) == "google_user-1"


def test_resolve_connection_id_maps_whatsapp_tools():
    connections = [{"id": "whatsapp_user-1", "providerId": "whatsapp"}]
    assert _resolve_connection_id("whatsapp.list_unread", connections) == "whatsapp_user-1"
