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
    val kind = data["kind"] ?: return
    if (kind !in SUPPORTED_NOTIFICATION_KINDS) {
      return
    }

    val channelId = if (kind == "message") MESSAGES_CHANNEL_ID else SYSTEM_CHANNEL_ID
    createNotificationChannel(context, channelId)
    val notificationId = data["notification_id"]?.hashCode() ?: message.messageId?.hashCode() ?: 0
    val openAppIntent = Intent(context, MainActivity::class.java).apply {
      action = ACTION_OPEN_NOTIFICATION
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra(EXTRA_NOTIFICATION_KIND, kind)
      data["chat_id"]?.let { putExtra(EXTRA_CHAT_ID, it) }
      data["message_id"]?.let { putExtra(EXTRA_MESSAGE_ID, it) }
      data["notification_id"]?.let { putExtra(EXTRA_NOTIFICATION_ID, it) }
    }
    val openApp = PendingIntent.getActivity(
      context,
      notificationId,
      openAppIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val isMessage = kind == "message"
    NotificationManagerCompat.from(context).notify(
      notificationId,
      NotificationCompat.Builder(context, channelId)
        .setSmallIcon(R.drawable.ic_stat_arachat)
        .setContentIntent(openApp)
        .setContentTitle(context.getString(if (isMessage) R.string.push_message_title else R.string.app_name))
        .setContentText(context.getString(if (isMessage) R.string.push_message_body else R.string.push_system_body))
        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
        .setAutoCancel(true)
        .build(),
    )
  }

  private fun createNotificationChannel(context: Context, channelId: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val channelName = context.getString(
      if (channelId == MESSAGES_CHANNEL_ID) R.string.push_messages_channel else R.string.push_system_channel,
    )
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_DEFAULT),
    )
  }

  private const val ACTION_OPEN_NOTIFICATION = "arachat.messenger.OPEN_NOTIFICATION"
  private const val EXTRA_NOTIFICATION_KIND = "arachat.notification.kind"
  private const val EXTRA_CHAT_ID = "arachat.notification.chat_id"
  private const val EXTRA_MESSAGE_ID = "arachat.notification.message_id"
  private const val EXTRA_NOTIFICATION_ID = "arachat.notification.notification_id"
  private const val MESSAGES_CHANNEL_ID = "arachat_messages"
  private const val SYSTEM_CHANNEL_ID = "arachat_system"
  private val SUPPORTED_NOTIFICATION_KINDS = setOf("message", "announcement", "support", "system")
}
