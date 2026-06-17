package expo.modules.assistantoverlay

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AssistantOverlayModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AssistantOverlay")

    Events("onOverlayDismissed", "onOverlayOpened")

    OnCreate {
      OverlayWindowManager.setOnDismissListener {
        sendEvent("onOverlayDismissed", mapOf<String, Any>())
      }
      OverlayWindowManager.setOnOpenListener { kind, sessionKey ->
        sendEvent(
          "onOverlayOpened",
          mapOf("kind" to kind, "sessionKey" to sessionKey)
        )
      }
    }

    OnDestroy {
      OverlayWindowManager.setOnDismissListener(null)
      OverlayWindowManager.setOnOpenListener(null)
    }

    AsyncFunction("canDrawOverlays") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      OverlayWindowManager.canDrawOverlays(context)
    }

    AsyncFunction("requestOverlayPermission") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      val appIntent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${context.packageName}")
      ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

      try {
        context.startActivity(appIntent)
      } catch (_: Exception) {
        // Some devices / build channels block package-scoped deep links.
        val fallbackIntent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(fallbackIntent)
      }
    }

    AsyncFunction("showOverlay") { text: String ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      if (!OverlayWindowManager.canDrawOverlays(context)) return@AsyncFunction null
      OverlayWindowManager.show(context, text)
    }

    AsyncFunction("hideOverlay") {
      OverlayWindowManager.hideAssistant()
    }

    AsyncFunction("isReminderOverlayPinned") {
      OverlayWindowManager.isReminderPinned()
    }

    AsyncFunction("updateOverlayText") { text: String ->
      OverlayWindowManager.updateText(text)
    }

    AsyncFunction("showBubble") {
      val context = appContext.reactContext ?: return@AsyncFunction null
      if (!OverlayWindowManager.canDrawOverlays(context)) return@AsyncFunction null
      OverlayWindowManager.show(context, "")
    }

    AsyncFunction("hideBubble") {
      OverlayWindowManager.hideAssistant()
    }

    AsyncFunction("setBubbleState") { state: String ->
      OverlayWindowManager.setBubbleState(state)
    }

    AsyncFunction("setOverlayAssistantName") { name: String ->
      OverlayWindowManager.setAssistantDisplayName(name)
    }

    AsyncFunction("setOverlayContextLabel") { label: String ->
      OverlayWindowManager.setContextLabel(label)
    }

    AsyncFunction("setOverlayExpanded") { expanded: Boolean ->
      OverlayWindowManager.setExpanded(expanded)
    }

    AsyncFunction("setOverlayNavigationTarget") { kind: String, sessionKey: String ->
      if (kind.isBlank() || sessionKey.isBlank()) {
        OverlayWindowManager.clearNavigationTarget()
      } else {
        OverlayWindowManager.setNavigationTarget(kind, sessionKey)
      }
    }

    AsyncFunction("startVoiceService") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is not available")
      try {
        val intent = Intent(context, VoiceAssistantForegroundService::class.java)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        // startService/startForegroundService return ComponentName, which Expo cannot marshal.
        null
      } catch (e: Exception) {
        throw IllegalStateException(
          e.message ?: "Failed to start voice assistant foreground service"
        )
      }
    }

    AsyncFunction("setReminderOverlayEnabled") { enabled: Boolean ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      context
        .getSharedPreferences("reminder_overlay_prefs", android.content.Context.MODE_PRIVATE)
        .edit()
        .putBoolean("reminder_overlay_enabled", enabled)
        .apply()
    }

    AsyncFunction("showReminderOverlay") { displayTitle: String, userPrompt: String ->
      val context = appContext.reactContext?.applicationContext
        ?: appContext.currentActivity?.applicationContext
        ?: return@AsyncFunction null
      if (!OverlayWindowManager.canDrawOverlays(context)) return@AsyncFunction null
      val prefs =
        context.getSharedPreferences("reminder_overlay_prefs", android.content.Context.MODE_PRIVATE)
      if (!prefs.getBoolean("reminder_overlay_enabled", false)) return@AsyncFunction null
      OverlayWindowManager.showReminderPinned(context, displayTitle, userPrompt)
    }

    AsyncFunction("stopVoiceService") {
      val context = appContext.reactContext
        ?: throw IllegalStateException("React context is not available")
      try {
        val intent = Intent(context, VoiceAssistantForegroundService::class.java)
        context.stopService(intent)
      } catch (e: Exception) {
        throw IllegalStateException(
          e.message ?: "Failed to stop voice assistant foreground service"
        )
      }
      OverlayWindowManager.hideAssistant()
    }
  }
}
