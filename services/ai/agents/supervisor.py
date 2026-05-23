from typing import Dict, Any


def run_agent(agent_type: str, task: str, context: Dict[str, Any]) -> Dict[str, Any]:
    if agent_type == "email":
        email_body = context.get("email_body", task)
        return {
            "agent": "email",
            "summary": f"Email summary: {email_body[:200]}",
            "suggested_reply": (
                "Thank you for your message. I will review and respond shortly."
            ),
        }

    if agent_type == "calendar":
        return {
            "agent": "calendar",
            "parsed_intent": task,
            "suggestion": "Schedule a 30-minute meeting tomorrow at 10:00 AM.",
        }

    if agent_type == "browser":
        url = context.get("url", "")
        return {
            "agent": "browser",
            "url": url,
            "summary": f"Browser task processed: {task}",
        }

    return {"error": f"Unknown agent type: {agent_type}"}
