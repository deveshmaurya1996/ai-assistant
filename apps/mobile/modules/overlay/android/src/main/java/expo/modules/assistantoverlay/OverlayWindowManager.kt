package expo.modules.assistantoverlay

import android.content.Context
import android.graphics.PixelFormat
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import kotlin.math.roundToInt

object OverlayWindowManager {
  private const val PREFS = "assistant_overlay_layout"
  private const val KEY_WIDTH = "width"
  private const val KEY_HEIGHT = "height"
  private const val KEY_X = "x"
  private const val KEY_Y = "y"
  private const val KEY_USER_RESIZED = "user_resized"

  private var windowManager: WindowManager? = null
  private var overlayView: AssistantOverlayView? = null
  private var layoutParams: WindowManager.LayoutParams? = null
  private var appContext: Context? = null
  private var userResized = false
  private var assistantName: String = "Assistant"
  private var contextLabel: String = ""
  private var navigationKind: String = ""
  private var navigationSessionKey: String = ""
  private var onDismissListener: (() -> Unit)? = null
  private var onOpenListener: ((String, String) -> Unit)? = null

  fun setOnOpenListener(listener: ((String, String) -> Unit)?) {
    onOpenListener = listener
  }

  fun setNavigationTarget(kind: String, sessionKey: String) {
    navigationKind = kind.trim()
    navigationSessionKey = sessionKey.trim()
  }

  fun clearNavigationTarget() {
    navigationKind = ""
    navigationSessionKey = ""
  }

  fun openAppFromOverlay(context: Context) {
    val kind = navigationKind.ifBlank { "voice" }
    val sessionKey = navigationSessionKey
    onOpenListener?.invoke(kind, sessionKey)

    val launch =
      context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    launch.addFlags(
      android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
        android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP or
        android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
    )
    val encodedKey = android.net.Uri.encode(sessionKey)
    launch.data = android.net.Uri.parse(
      "ai-assistant://overlay/open?kind=$kind&sessionKey=$encodedKey"
    )
    context.startActivity(launch)
  }

  fun setOnDismissListener(listener: (() -> Unit)?) {
    onDismissListener = listener
  }

  fun dismissByUser() {
    hide()
    onDismissListener?.invoke()
  }

  fun isCompactSize(): Boolean {
    val params = layoutParams ?: return true
    val ctx = appContext ?: return true
    val density = ctx.resources.displayMetrics.density
    val compactW = (density * 160).roundToInt() + (density * 10).roundToInt()
    val compactH = (density * 72).roundToInt() + (density * 10).roundToInt()
    return params.width <= compactW && params.height <= compactH
  }

  fun canDrawOverlays(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      Settings.canDrawOverlays(context)
    } else {
      true
    }
  }

  fun show(context: Context, text: String) {
    val ctx = context.applicationContext
    appContext = ctx

    if (overlayView == null) {
      windowManager = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
      val wm = windowManager ?: return

      val params = createLayoutParams(ctx)
      layoutParams = params

      val view = AssistantOverlayView(
        context = ctx,
        onWindowUpdate = { updateWindow() },
        onPersistLayout = { persistLayout(ctx) },
        getWindowLayoutParams = { layoutParams },
        onDismiss = { dismissByUser() },
        onOpenApp = { openAppFromOverlay(ctx) },
        isCompact = { isCompactSize() },
      )
      overlayView = view
      view.setAssistantDisplayName(assistantName)
      view.setContextLabel(contextLabel)
      wm.addView(view, params)
      loadSavedLayout(ctx, params, view)
      overlayView?.setOverlayText(text)
      applySizeTier(if (text.isBlank()) "compact" else "medium")
      return
    }

    overlayView?.setOverlayText(text)
    if (!userResized) {
      applySizeTier(if (text.isBlank()) "compact" else "medium")
    } else {
      overlayView?.applyContent()
    }
  }

  fun hide() {
    val wm = windowManager ?: return
    val view = overlayView ?: return
    try {
      wm.removeView(view)
    } catch (_: Exception) {
      /* already removed */
    }
    overlayView = null
    layoutParams = null
    userResized = false
  }

  fun updateText(text: String) {
    overlayView?.setOverlayText(text)
    if (!userResized) {
      applySizeTier(if (text.isBlank()) "compact" else "medium")
    } else {
      overlayView?.applyContent()
    }
  }

  fun setBubbleState(state: String) {
    overlayView?.setBubbleState(state)
  }

  fun setAssistantDisplayName(name: String) {
    assistantName = name.trim().ifBlank { "Assistant" }
    overlayView?.setAssistantDisplayName(assistantName)
  }

  fun setContextLabel(label: String) {
    contextLabel = label.trim()
    overlayView?.setContextLabel(contextLabel)
  }

  fun setExpanded(expanded: Boolean) {
    applySizeTier(if (expanded) "medium" else "compact")
  }

  private fun applySizeTier(tier: String) {
    val ctx = appContext ?: return
    val view = overlayView ?: return
    val params = layoutParams ?: return
    val metrics = ctx.resources.displayMetrics
    val density = metrics.density

    fun dp(value: Int): Int = (density * value).roundToInt()

    when (tier) {
      "medium" -> {
        if (userResized) {
          // Keep user-chosen size; only refresh text
          view.applyContent()
        } else {
          view.applyAutoReplySize()
        }
      }
      else -> {
        if (!userResized) {
          view.applyCompactSize()
          val margin = dp(16)
          params.x = metrics.widthPixels - params.width - margin
          params.y = metrics.heightPixels - params.height - margin - dp(48)
          params.x = params.x.coerceIn(0, metrics.widthPixels - params.width)
          params.y = params.y.coerceIn(dp(24), metrics.heightPixels - params.height - dp(24))
          updateWindow()
        } else {
          view.applyContent()
        }
      }
    }
  }

  private fun createLayoutParams(context: Context): WindowManager.LayoutParams {
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    val metrics = context.resources.displayMetrics
    val density = metrics.density
    val compactW = (density * 160).roundToInt()
    val compactH = (density * 72).roundToInt()

    return WindowManager.LayoutParams(
      compactW,
      compactH,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = metrics.widthPixels - compactW - (density * 16).roundToInt()
      y = metrics.heightPixels - compactH - (density * 64).roundToInt()
    }
  }

  private fun updateWindow() {
    val wm = windowManager ?: return
    val view = overlayView ?: return
    val params = layoutParams ?: return
    try {
      wm.updateViewLayout(view, params)
    } catch (_: Exception) {
      /* view detached */
    }
  }

  private fun loadSavedLayout(
    context: Context,
    params: WindowManager.LayoutParams,
    view: AssistantOverlayView,
  ) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    userResized = prefs.getBoolean(KEY_USER_RESIZED, false)
    if (!prefs.contains(KEY_WIDTH)) return

    val w = prefs.getInt(KEY_WIDTH, params.width)
    val h = prefs.getInt(KEY_HEIGHT, params.height)
    val x = prefs.getInt(KEY_X, params.x)
    val y = prefs.getInt(KEY_Y, params.y)
    view.clampAndApplyDefaultSize(w, h, x, y)
  }

  private fun persistLayout(context: Context) {
    val params = layoutParams ?: return
    userResized = true
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_USER_RESIZED, true)
      .putInt(KEY_WIDTH, params.width)
      .putInt(KEY_HEIGHT, params.height)
      .putInt(KEY_X, params.x)
      .putInt(KEY_Y, params.y)
      .apply()
  }
}
