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
      showDataNotification(context.applicationContext, message)
    }
  }

  private fun showDataNotification(context: Context, message: UniversalRemoteMessage) {
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      return
    }

    val data = message.data
    when (data["kind"]) {
      MESSAGE_KIND -> showMessageNotification(context, data)
      CALL_KIND -> showCallNotification(context, data)
    }
  }

  private fun showMessageNotification(context: Context, data: Map<String, String>) {
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
      messageNotificationTag(chatId),
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

  fun clearMessageNotificationsForChat(context: Context, chatId: String) {
    if (chatId.isBlank()) {
      return
    }

    val tag = messageNotificationTag(chatId)
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val notifications = manager.activeNotifications.filter { it.tag == tag }
    val notificationManager = NotificationManagerCompat.from(context)
    notifications.forEach { notification ->
      notificationManager.cancel(tag, notification.id)
    }
  }

  private fun showCallNotification(context: Context, data: Map<String, String>) {
    val title = data["title"]?.trim()?.takeIf { it.isNotEmpty() } ?: return
    val body = data["body"]?.trim()?.takeIf { it.isNotEmpty() } ?: return
    val callId = data["call_id"] ?: return
    val chatId = data["chat_id"] ?: return
    if (data["call_type"] !in setOf("audio", "video")) {
      return
    }

    createCallsNotificationChannel(context)
    val notificationId = callId.hashCode()
    val openAppIntent = Intent(context, MainActivity::class.java).apply {
      action = ACTION_OPEN_CALL
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra(EXTRA_CHAT_ID, chatId)
      putExtra(EXTRA_CALL_ID, callId)
    }
    val openApp = PendingIntent.getActivity(
      context,
      notificationId,
      openAppIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    NotificationManagerCompat.from(context).notify(
      notificationId,
      NotificationCompat.Builder(context, CALLS_CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_stat_arachat)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setContentIntent(openApp)
        .setContentTitle(title)
        .setContentText(body)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setTimeoutAfter(CALL_NOTIFICATION_TIMEOUT_MILLIS)
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

  private fun createCallsNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(
        CALLS_CHANNEL_ID,
        context.getString(R.string.push_calls_channel),
        NotificationManager.IMPORTANCE_HIGH,
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
  const val ACTION_OPEN_CALL = "arachat.messenger.OPEN_CALL"
  const val EXTRA_NOTIFICATION_KIND = "arachat.notification.kind"
  const val EXTRA_CHAT_ID = "arachat.notification.chat_id"
  const val EXTRA_CALL_ID = "arachat.notification.call_id"
  const val EXTRA_MESSAGE_ID = "arachat.notification.message_id"
  const val EXTRA_NOTIFICATION_ID = "arachat.notification.notification_id"
  private const val MESSAGES_CHANNEL_ID = "arachat_messages"
  private const val MESSAGE_NOTIFICATION_TAG_PREFIX = "arachat.message."
  private const val CALLS_CHANNEL_ID = "arachat_calls"
  private const val CALL_NOTIFICATION_TIMEOUT_MILLIS = 75_000L
  private const val CALL_KIND = "call"
  private const val MESSAGE_KIND = "message"

  private fun messageNotificationTag(chatId: String): String = "$MESSAGE_NOTIFICATION_TAG_PREFIX$chatId"
}
