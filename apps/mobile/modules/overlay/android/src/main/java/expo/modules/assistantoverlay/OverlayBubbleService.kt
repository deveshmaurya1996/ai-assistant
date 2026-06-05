package expo.modules.assistantoverlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.core.app.NotificationCompat
class OverlayBubbleService : Service() {
  companion object {
    const val ACTION_SHOW = "SHOW"
    const val ACTION_HIDE = "HIDE"
    const val CHANNEL_ID = "assistant_overlay"
    const val NOTIFICATION_ID = 42
    var bubbleState: String = "idle"
  }

  private var windowManager: WindowManager? = null
  private var bubbleView: View? = null
  private var layoutParams: WindowManager.LayoutParams? = null
  private var bubbleIcon: ImageView? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_SHOW -> showBubble()
      ACTION_HIDE -> hideBubble()
    }
    return START_STICKY
  }

  private fun showBubble() {
    startForeground(NOTIFICATION_ID, buildNotification())
    if (bubbleView != null) {
      updateIcon()
      return
    }

    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager

    val container = FrameLayout(this)
    val size = (56 * resources.displayMetrics.density).toInt()
    val icon = ImageView(this)
    icon.setImageResource(android.R.drawable.ic_btn_speak_now)
    icon.setColorFilter(Color.WHITE)
    val bg = GradientDrawable()
    bg.shape = GradientDrawable.OVAL
    bg.setColor(Color.parseColor("#4F46E5"))
    container.background = bg
    container.addView(
      icon,
      FrameLayout.LayoutParams(
        (28 * resources.displayMetrics.density).toInt(),
        (28 * resources.displayMetrics.density).toInt(),
        Gravity.CENTER
      )
    )
    bubbleIcon = icon
    bubbleView = container

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }

    layoutParams = WindowManager.LayoutParams(
      size,
      size,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = 100
      y = 300
    }

    container.setOnTouchListener(BubbleTouchListener())
    windowManager?.addView(container, layoutParams)
    updateIcon()
  }

  private inner class BubbleTouchListener : View.OnTouchListener {
    private var initialX = 0
    private var initialY = 0
    private var touchX = 0f
    private var touchY = 0f

    override fun onTouch(v: View?, event: MotionEvent): Boolean {
      val lp = layoutParams ?: return false
      when (event.action) {
        MotionEvent.ACTION_DOWN -> {
          initialX = lp.x
          initialY = lp.y
          touchX = event.rawX
          touchY = event.rawY
          return true
        }
        MotionEvent.ACTION_MOVE -> {
          lp.x = initialX + (event.rawX - touchX).toInt()
          lp.y = initialY + (event.rawY - touchY).toInt()
          windowManager?.updateViewLayout(bubbleView, lp)
          return true
        }
        MotionEvent.ACTION_UP -> {
          val dx = (event.rawX - touchX).toInt()
          val dy = (event.rawY - touchY).toInt()
          if (dx * dx + dy * dy < 100) {
            openApp()
          }
          return true
        }
      }
      return false
    }
  }

  private fun updateIcon() {
    bubbleIcon?.alpha = when (bubbleState) {
      "listening" -> 1f
      "processing" -> 0.65f
      else -> 0.9f
    }
  }

  private fun openApp() {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    launch?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    startActivity(launch)
  }

  private fun hideBubble() {
    bubbleView?.let { windowManager?.removeView(it) }
    bubbleView = null
    bubbleIcon = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  private fun buildNotification(): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Assistant overlay",
        NotificationManager.IMPORTANCE_LOW
      )
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    val pending = PendingIntent.getActivity(
      this,
      0,
      packageManager.getLaunchIntentForPackage(packageName),
      PendingIntent.FLAG_IMMUTABLE
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("AI Assistant")
      .setContentText("Floating assistant active")
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentIntent(pending)
      .setOngoing(true)
      .build()
  }
}
