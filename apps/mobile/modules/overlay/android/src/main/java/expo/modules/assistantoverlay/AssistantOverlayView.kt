package expo.modules.assistantoverlay

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.view.GestureDetector
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.widget.NestedScrollView
import kotlin.math.abs
import kotlin.math.roundToInt

class AssistantOverlayView(
  context: Context,
  private val onWindowUpdate: () -> Unit,
  private val onPersistLayout: () -> Unit,
  private val getWindowLayoutParams: () -> WindowManager.LayoutParams?,
  private val onDismiss: () -> Unit,
  private val onOpenApp: () -> Unit,
  private val isCompact: () -> Boolean,
) : FrameLayout(context) {

  val statusBar: TextView
  val contextLabelView: TextView
  val bodyText: TextView

  private val statusDot: View
  private val bodyScroll: NestedScrollView
  private val card: FrameLayout
  private val contentClip: FrameLayout
  private val contentColumn: LinearLayout
  private val expandCornerHandle: FrameLayout

  private val cardCornerRadiusPx: Int

  companion object {
    private const val CARD_FILL = "#801A1D24"
    private const val CARD_STROKE = "#33FFFFFF"

    private const val AUTO_WIDTH_RATIO = 0.58f
    private const val AUTO_HEIGHT_RATIO = 0.32f

    private const val MAX_WIDTH_RATIO = 0.70f
    private const val MAX_HEIGHT_RATIO = 0.50f

    private const val HANDLE_GUTTER_DP = 10

    private const val COLOR_DOT_LISTENING = "#EF4444"
    private const val COLOR_DOT_RESPONDING = "#22C55E"
    private const val COLOR_DOT_IDLE = "#EAB308"
  }

  private val handleGutterPx: Int

  private var bubbleState: String = "idle"
  private var overlayText: String = ""
  private var assistantDisplayName: String = "Assistant"
  private var contextLabel: String = ""

  private var dragStartRawX = 0f
  private var dragStartRawY = 0f
  private var dragStartX = 0
  private var dragStartY = 0
  private var isDragging = false

  private var resizeStartRawX = 0f
  private var resizeStartRawY = 0f
  private var resizeStartW = 0
  private var resizeStartH = 0
  private var isResizing = false

  private val openAppDetector = GestureDetector(
    context,
    object : GestureDetector.SimpleOnGestureListener() {
      override fun onDoubleTap(e: MotionEvent): Boolean {
        launchApp()
        return true
      }
    }
  )

  init {
    clipChildren = false
    clipToPadding = false
    cardCornerRadiusPx = dp(20)
    handleGutterPx = dp(HANDLE_GUTTER_DP)
    val padH = dp(14)
    val padV = dp(12)

    card = FrameLayout(context).apply {
      clipChildren = false
      background = roundedBackground(cardCornerRadiusPx, Color.parseColor(CARD_FILL))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        elevation = dp(6).toFloat()
      }
    }

    contentClip = FrameLayout(context).apply {
      background = roundedBackground(cardCornerRadiusPx, Color.parseColor(CARD_FILL))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        clipToOutline = true
        outlineProvider = android.view.ViewOutlineProvider.BACKGROUND
      }
    }

    contentColumn = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(padH, padV, padH, padV)
    }

    val dotSize = dp(9)
    statusDot = View(context).apply {
      background = circleDrawable(Color.parseColor(COLOR_DOT_IDLE))
    }

    statusBar = TextView(context).apply {
      setTextColor(Color.WHITE)
      textSize = 13f
      setTypeface(typeface, Typeface.BOLD)
      text = "Assistant"
      layoutParams = LinearLayout.LayoutParams(
        0,
        LinearLayout.LayoutParams.WRAP_CONTENT,
        1f,
      )
    }

    contextLabelView = TextView(context).apply {
      setTextColor(Color.parseColor("#B0B8C4"))
      textSize = 11f
      visibility = GONE
    }

    val headerRow = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      addView(
        statusDot,
        LinearLayout.LayoutParams(dotSize, dotSize).apply {
          marginEnd = dp(8)
        },
      )
      addView(statusBar)
    }

    bodyText = TextView(context).apply {
      setTextColor(Color.parseColor("#E8EAED"))
      textSize = 15f
      setLineSpacing(4f, 1f)
    }

    bodyScroll = NestedScrollView(context).apply {
      isFillViewport = false
      isVerticalScrollBarEnabled = true
      addView(
        bodyText,
        LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
      )
      visibility = GONE
    }

    contentColumn.addView(headerRow)
    contentColumn.addView(
      contextLabelView,
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply { topMargin = dp(2) }
    )
    contentColumn.addView(
      bodyScroll,
      LinearLayout.LayoutParams(
        LinearLayout.LayoutParams.MATCH_PARENT,
        LinearLayout.LayoutParams.WRAP_CONTENT
      ).apply { topMargin = dp(6) }
    )

    contentClip.addView(
      contentColumn,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    )

    card.addView(
      contentClip,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    )

    addView(
      card,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT).apply {
        rightMargin = handleGutterPx
        bottomMargin = handleGutterPx
      }
    )

    val handleInset = dp(2)
    val handleSize = dp(48).coerceAtLeast(cardCornerRadiusPx + dp(12))
    expandCornerHandle = createExpandCornerHandle()
    addView(
      expandCornerHandle,
      LayoutParams(handleSize, handleSize).apply {
        gravity = Gravity.BOTTOM or Gravity.END
        rightMargin = handleInset
        bottomMargin = handleInset
      }
    )
    expandCornerHandle.bringToFront()

    expandCornerHandle.setOnTouchListener { _, event -> handleResize(event) }
    val moveTouch = { _: View, event: MotionEvent -> handleDrag(event) }
    headerRow.setOnTouchListener(moveTouch)
    statusDot.setOnTouchListener(moveTouch)
    statusBar.setOnTouchListener(moveTouch)
  }

  override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
    openAppDetector.onTouchEvent(ev)
    return super.dispatchTouchEvent(ev)
  }

  fun setAssistantDisplayName(name: String) {
    assistantDisplayName = name.trim().ifBlank { "Assistant" }
    applyContent()
  }

  fun setContextLabel(label: String) {
    contextLabel = label.trim()
    applyContent()
  }

  fun setBubbleState(state: String) {
    bubbleState = state
    applyContent()
  }

  fun setOverlayText(text: String) {
    overlayText = text
    applyContent()
  }

  fun applyContent() {
    val prefix = assistantDisplayName
    statusBar.text = when (bubbleState) {
      "listening" -> "$prefix · Listening…"
      "processing" -> "$prefix · Thinking…"
      "speaking" -> "$prefix · Speaking…"
      else -> prefix
    }

    if (contextLabel.isNotBlank()) {
      contextLabelView.text = contextLabel
      contextLabelView.visibility = VISIBLE
    } else {
      contextLabelView.visibility = GONE
    }

    val dotColor = when (bubbleState) {
      "listening" -> Color.parseColor(COLOR_DOT_LISTENING)
      "processing", "speaking" -> Color.parseColor(COLOR_DOT_RESPONDING)
      else -> Color.parseColor(COLOR_DOT_IDLE)
    }
    statusDot.background = circleDrawable(dotColor)

    if (overlayText.isNotBlank()) {
      bodyText.text = overlayText
      bodyScroll.visibility = VISIBLE
    } else {
      bodyScroll.visibility = GONE
    }
  }

  fun applyCompactSize() {
    val params = getWindowLayoutParams() ?: return
    params.width = windowWidthForContent(dp(160))
    params.height = windowHeightForContent(dp(72))
    anchorToBottomEnd(params)
    onWindowUpdate()
  }

  fun applyAutoReplySize() {
    val params = getWindowLayoutParams() ?: return
    val metrics = resources.displayMetrics
    params.width = windowWidthForContent(
      (metrics.widthPixels * AUTO_WIDTH_RATIO).roundToInt()
    )
    params.height = windowHeightForContent(
      (metrics.heightPixels * AUTO_HEIGHT_RATIO).roundToInt()
    )
    anchorToBottomEnd(params)
    onWindowUpdate()
  }

  fun clampAndApplyDefaultSize(widthPx: Int, heightPx: Int, xPx: Int, yPx: Int) {
    val params = getWindowLayoutParams() ?: return
    val metrics = resources.displayMetrics
    val minW = dp(140)
    val minH = dp(56)
    val maxW = (metrics.widthPixels * MAX_WIDTH_RATIO).roundToInt()
    val maxH = (metrics.heightPixels * MAX_HEIGHT_RATIO).roundToInt()

    params.width = widthPx.coerceIn(minW, maxW)
    params.height = heightPx.coerceIn(minH, maxH)
    params.x = xPx.coerceIn(0, metrics.widthPixels - params.width)
    params.y = yPx.coerceIn(dp(24), metrics.heightPixels - params.height - dp(24))
    params.gravity = Gravity.TOP or Gravity.START
    onWindowUpdate()
  }

  private fun clampPosition(params: WindowManager.LayoutParams) {
    val metrics = resources.displayMetrics
    params.x = params.x.coerceIn(0, metrics.widthPixels - params.width)
    params.y = params.y.coerceIn(dp(24), metrics.heightPixels - params.height - dp(24))
  }

  private fun windowWidthForContent(contentWidthPx: Int): Int =
    contentWidthPx + handleGutterPx

  private fun windowHeightForContent(contentHeightPx: Int): Int =
    contentHeightPx + handleGutterPx

  private fun anchorToBottomEnd(params: WindowManager.LayoutParams) {
    val metrics = resources.displayMetrics
    params.x = (metrics.widthPixels - params.width).coerceAtLeast(0)
    params.y = (metrics.heightPixels - params.height - dp(48)).coerceAtLeast(dp(24))
    clampPosition(params)
  }

  private fun sizeLimits(): SizeLimits {
    val metrics = resources.displayMetrics
    return SizeLimits(
      minW = windowWidthForContent(dp(140)),
      minH = windowHeightForContent(dp(56)),
      maxW = windowWidthForContent(
        (metrics.widthPixels * MAX_WIDTH_RATIO).roundToInt()
      ),
      maxH = windowHeightForContent(
        (metrics.heightPixels * MAX_HEIGHT_RATIO).roundToInt()
      ),
    )
  }

  private data class SizeLimits(
    val minW: Int,
    val minH: Int,
    val maxW: Int,
    val maxH: Int,
  )

  private fun handleDrag(event: MotionEvent): Boolean {
    val params = getWindowLayoutParams() ?: return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        isDragging = false
        dragStartRawX = event.rawX
        dragStartRawY = event.rawY
        dragStartX = params.x
        dragStartY = params.y
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        val dx = event.rawX - dragStartRawX
        val dy = event.rawY - dragStartRawY
        if (!isDragging && (abs(dx) > dp(4) || abs(dy) > dp(4))) {
          isDragging = true
        }
        if (!isDragging) return true
        val metrics = resources.displayMetrics
        params.x = (dragStartX + dx).roundToInt()
          .coerceIn(0, metrics.widthPixels - params.width.coerceAtLeast(dp(80)))
        params.y = (dragStartY + dy).roundToInt()
          .coerceIn(dp(24), metrics.heightPixels - params.height.coerceAtLeast(dp(56)) - dp(24))
        onWindowUpdate()
        return true
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (isDragging) onPersistLayout()
        isDragging = false
        return true
      }
    }
    return false
  }

  private fun handleResize(event: MotionEvent): Boolean {
    val params = getWindowLayoutParams() ?: return false
    val limits = sizeLimits()
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        isResizing = false
        resizeStartRawX = event.rawX
        resizeStartRawY = event.rawY
        resizeStartW = params.width
        resizeStartH = params.height
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        val dx = event.rawX - resizeStartRawX
        val dy = event.rawY - resizeStartRawY
        if (!isResizing && (abs(dx) > dp(4) || abs(dy) > dp(4))) {
          isResizing = true
        }
        if (!isResizing) return true
        params.width = (resizeStartW + dx).roundToInt()
          .coerceIn(limits.minW, limits.maxW)
        params.height = (resizeStartH + dy).roundToInt()
          .coerceIn(limits.minH, limits.maxH)
        clampPosition(params)
        onWindowUpdate()
        return true
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (isResizing) {
          val limits = sizeLimits()
          if (params.width <= limits.minW + dp(8) && params.height <= limits.minH + dp(8)) {
            onDismiss()
          } else {
            onPersistLayout()
          }
        } else if (isCompact()) {
          onDismiss()
        } else {
          toggleExpandedSize()
        }
        isResizing = false
        return true
      }
    }
    return false
  }

  private fun toggleExpandedSize() {
    val params = getWindowLayoutParams() ?: return
    val limits = sizeLimits()
    val metrics = resources.displayMetrics
    val defaultW = windowWidthForContent(
      (metrics.widthPixels * AUTO_WIDTH_RATIO).roundToInt()
    )
    val defaultH = windowHeightForContent(
      (metrics.heightPixels * AUTO_HEIGHT_RATIO).roundToInt()
    )
    val isExpanded =
      params.width >= limits.maxW * 0.92 || params.height >= limits.maxH * 0.92

    if (isExpanded) {
      params.width = defaultW.coerceIn(limits.minW, limits.maxW)
      params.height = defaultH.coerceIn(limits.minH, limits.maxH)
    } else {
      params.width = limits.maxW
      params.height = limits.maxH
    }
    anchorToBottomEnd(params)
    onWindowUpdate()
    onPersistLayout()
  }

  private fun launchApp() {
    onOpenApp()
  }

  private fun circleDrawable(color: Int): GradientDrawable {
    return GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(color)
    }
  }

  private fun createExpandCornerHandle(): FrameLayout {
    return FrameLayout(context).apply {
      contentDescription = "Resize overlay"
      isClickable = true
      isFocusable = true
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        elevation = dp(12).toFloat()
        translationZ = dp(12).toFloat()
      }
      background = ExteriorCornerArcDrawable(
        cornerRadiusPx = cardCornerRadiusPx.toFloat(),
        strokeWidthPx = dp(3).toFloat(),
        strokeColor = Color.WHITE,
      )
    }
  }

  private fun roundedBackground(radiusPx: Int, fillColor: Int): GradientDrawable {
    return GradientDrawable().apply {
      setColor(fillColor)
      cornerRadius = radiusPx.toFloat()
      setStroke(dp(1), Color.parseColor(CARD_STROKE))
    }
  }

  private fun dp(value: Int): Int {
    return (resources.displayMetrics.density * value).roundToInt()
  }

  private class ExteriorCornerArcDrawable(
    private val cornerRadiusPx: Float,
    private val strokeWidthPx: Float,
    private val strokeColor: Int,
  ) : Drawable() {

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = strokeWidthPx
      color = strokeColor
      strokeCap = Paint.Cap.ROUND
    }

    override fun draw(canvas: Canvas) {
      val bounds = bounds
      if (bounds.isEmpty) return

      val inset = strokeWidthPx / 2f
      val maxR = (bounds.width().coerceAtMost(bounds.height()) / 2f) - inset
      val r = cornerRadiusPx.coerceAtMost(maxR)

      val rect = RectF(
        bounds.right - 2f * r - inset,
        bounds.bottom - 2f * r - inset,
        bounds.right - inset,
        bounds.bottom - inset,
      )

      val path = Path()
      path.arcTo(rect, 90f, -90f, false)
      canvas.drawPath(path, paint)
    }

    override fun setAlpha(alpha: Int) {
      paint.alpha = alpha
    }

    override fun setColorFilter(colorFilter: ColorFilter?) {
      paint.colorFilter = colorFilter
    }

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
  }
}
