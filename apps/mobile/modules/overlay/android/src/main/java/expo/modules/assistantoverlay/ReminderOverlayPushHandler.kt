package expo.modules.assistantoverlay

import android.content.Context

object ReminderOverlayPushHandler {
  fun handleMessage(context: Context, data: Map<String, String>) {
    if (data["type"] != "reminder") return
    val showOverlay = data["showOverlay"]
    if (showOverlay != "true" && showOverlay != "1") return

    val prefs =
      context.getSharedPreferences("reminder_overlay_prefs", Context.MODE_PRIVATE)
    if (!prefs.getBoolean("reminder_overlay_enabled", false)) return
    if (!OverlayWindowManager.canDrawOverlays(context)) return

    val displayTitle = data["displayTitle"]?.trim().orEmpty().ifBlank {
      data["title"]?.trim().orEmpty().ifBlank { "Reminder" }
    }
    val userPrompt = data["userPrompt"]?.trim().orEmpty()

    OverlayWindowManager.showReminderPinned(context, displayTitle, userPrompt)
  }

  fun formatReminderText(displayTitle: String, userPrompt: String): String {
    val title = displayTitle.trim().ifBlank { "Reminder" }
    val prompt = userPrompt.trim()
    return if (prompt.isBlank() || prompt.equals(title, ignoreCase = true)) {
      title
    } else {
      "$title\n$prompt"
    }
  }
}
