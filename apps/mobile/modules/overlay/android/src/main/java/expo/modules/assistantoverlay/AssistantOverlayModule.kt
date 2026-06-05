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
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${context.packageName}")
      )
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("showOverlay") { text: String ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      if (!OverlayWindowManager.canDrawOverlays(context)) return@AsyncFunction null
      OverlayWindowManager.show(context, text)
    }

    AsyncFunction("hideOverlay") {
      OverlayWindowManager.hide()
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
      OverlayWindowManager.hide()
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
      } catch (e: Exception) {
        throw IllegalStateException(
          e.message ?: "Failed to start voice assistant foreground service"
        )
      }
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
      OverlayWindowManager.hide()
    }
  }
}
