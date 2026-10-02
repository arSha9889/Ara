package arachat.messenger

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import ru.rustore.sdk.universalpush.RuStoreUniversalPushClient
import ru.rustore.sdk.universalpush.domain.model.UniversalRemoteMessage

object PushNotificationHandler {
  data class NotificationOpen(
    val chatId: String?,
    val messageId: String?,
    val notificationId: String?,
  )

  fun install(context: Context) {
    RuStoreUniversalPushClient.setOnMessageReceiveListener { message ->
      showDataMessageNotification(context.applicationContext, message)
    }
  }

  private fun showDataMessageNotification(context: Context, message: UniversalRemoteMessage) {
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      return
    }

    val data = message.data
    if (data["kind"] != MESSAGE_KIND) {
      return
    }
    val title = data["title"]?.trim()?.takeIf { it.isNotEmpty() } ?: return
    val body = data["body"]?.trim()?.takeIf { it.isNotEmpty() } ?: return
    val notificationIdValue = data["notification_id"] ?: return
    val chatId = data["chat_id"] ?: return

    createMessagesNotificationChannel(context)
    val notificationId = notificationIdValue.hashCode()
    val openAppIntent = Intent(context, MainActivity::class.java).apply {
      action = ACTION_OPEN_NOTIFICATION
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra(EXTRA_NOTIFICATION_KIND, MESSAGE_KIND)
      putExtra(EXTRA_CHAT_ID, chatId)
      data["message_id"]?.let { putExtra(EXTRA_MESSAGE_ID, it) }
      putExtra(EXTRA_NOTIFICATION_ID, notificationIdValue)
    }
    val openApp = PendingIntent.getActivity(
      context,
      notificationId,
      openAppIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    NotificationManagerCompat.from(context).notify(
      notificationId,
      NotificationCompat.Builder(context, MESSAGES_CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_arachat)
        .setContentIntent(openApp)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .setAutoCancel(true)
        .build(),
    )
  }

  private fun createMessagesNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(
        MESSAGES_CHANNEL_ID,
        context.getString(R.string.push_messages_channel),
        NotificationManager.IMPORTANCE_DEFAULT,
      ),
    )
  }

  fun notificationOpenFromIntent(intent: Intent): NotificationOpen? {
    if (intent.action != ACTION_OPEN_NOTIFICATION) {
      return null
    }

    if (intent.getStringExtra(EXTRA_NOTIFICATION_KIND) != MESSAGE_KIND) {
      return null
    }
    return NotificationOpen(
      chatId = intent.getStringExtra(EXTRA_CHAT_ID),
      messageId = intent.getStringExtra(EXTRA_MESSAGE_ID),
      notificationId = intent.getStringExtra(EXTRA_NOTIFICATION_ID),
    )
  }

  const val ACTION_OPEN_NOTIFICATION = "arachat.messenger.OPEN_NOTIFICATION"
  const val EXTRA_NOTIFICATION_KIND = "arachat.notification.kind"
  const val EXTRA_CHAT_ID = "arachat.notification.chat_id"
  const val EXTRA_MESSAGE_ID = "arachat.notification.message_id"
  const val EXTRA_NOTIFICATION_ID = "arachat.notification.notification_id"
  private const val MESSAGES_CHANNEL_ID = "arachat_messages"
  private const val MESSAGE_KIND = "message"
}
