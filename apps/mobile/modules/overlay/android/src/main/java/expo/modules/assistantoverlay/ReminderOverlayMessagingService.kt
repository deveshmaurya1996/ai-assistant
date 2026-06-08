package expo.modules.assistantoverlay

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.delegates.FirebaseMessagingDelegate

class ReminderOverlayMessagingService : FirebaseMessagingService() {
  private val expoMessagingDelegate by lazy { FirebaseMessagingDelegate(applicationContext) }

  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data.mapValues { (_, value) -> value ?: "" }
    if (data["type"] == "reminder") {
      ReminderOverlayPushHandler.handleMessage(applicationContext, data)
    }
    expoMessagingDelegate.onMessageReceived(message)
  }

  override fun onNewToken(token: String) {
    expoMessagingDelegate.onNewToken(token)
  }

  override fun onDeletedMessages() {
    expoMessagingDelegate.onDeletedMessages()
  }
}
