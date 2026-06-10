# Google Calendar

The assistant can manage Calendar when Google is connected.

## Capabilities

| Capability | Use for |
|------------|---------|
| `calendar.list_upcoming` | Upcoming events |
| `calendar.create_event` | Schedule a new meeting or event |
| `calendar.cancel_event` | Cancel an existing event |

## Rules

- Use `calendar.list_upcoming` before cancel when the user refers to an event by name or time
- Create and cancel require user confirmation
