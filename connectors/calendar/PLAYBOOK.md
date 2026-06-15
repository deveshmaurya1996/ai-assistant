# Google Calendar

The assistant can manage Calendar when Google is connected.

## Capabilities

| Capability | Use for |
|------------|---------|
| `calendar.list_upcoming` | Upcoming events (default from now); pass time range args when user asks about past dates |
| `calendar.create_event` | Schedule a meeting, call, or block of time |
| `calendar.cancel_event` | Cancel an existing event |

## Common scenarios

| User intent | Plan |
|-------------|------|
| "What's on my calendar?" / "meetings today" | `calendar.list_upcoming` |
| "What did I have yesterday?" | `calendar.list_upcoming` with appropriate time window |
| "Schedule a call with Alex tomorrow 3pm" | `calendar.create_event` (summary, start, end, attendees optional) |
| "Book 30 minutes for lunch Friday" | `calendar.create_event` |
| "Cancel my 2pm meeting" | `calendar.list_upcoming` → `calendar.cancel_event` with event id |
| "Remind me to stand up at 9am" | **Scheduling planner** — `reminder.create` (push nudge), NOT `calendar.create_event` |

## Rules

- Use `calendar.list_upcoming` before cancel when the user refers to an event by name or time
- Distinguish **calendar events** (meetings on Google Calendar) from **reminders** (push notifications) — simple "remind me at X" goes to scheduling planner
- `calendar.create_event` and `calendar.cancel_event` require user confirmation
- Include timezone-aware ISO datetimes when the user specifies a time
