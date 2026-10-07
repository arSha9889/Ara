package arachat.messenger

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

class CallForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val callType = intent?.getStringExtra(EXTRA_CALL_TYPE)
      ?.takeIf { it == CALL_TYPE_AUDIO || it == CALL_TYPE_VIDEO }
      ?: CALL_TYPE_AUDIO
    val peerName = intent?.getStringExtra(EXTRA_PEER_NAME)?.trim().orEmpty()

    createNotificationChannel()
    ServiceCompat.startForeground(
      this,
      NOTIFICATION_ID,
      buildNotification(callType, peerName),
      ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
        if (callType == CALL_TYPE_VIDEO) ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else 0,
    )
    return START_NOT_STICKY
  }

  private fun buildNotification(callType: String, peerName: String) = NotificationCompat.Builder(this, CHANNEL_ID)
    .setSmallIcon(R.drawable.ic_stat_arachat)
    .setCategory(NotificationCompat.CATEGORY_CALL)
    .setContentIntent(openAppIntent())
    .setContentTitle(
      if (peerName.isBlank()) getString(R.string.active_call_title)
      else getString(R.string.active_call_with, peerName),
    )
    .setContentText(
      getString(if (callType == CALL_TYPE_VIDEO) R.string.active_video_call else R.string.active_audio_call),
    )
    .setOngoing(true)
    .setOnlyAlertOnce(true)
    .setShowWhen(false)
    .build()

  private fun openAppIntent(): PendingIntent {
    val intent = Intent(this, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    return PendingIntent.getActivity(
      this,
      NOTIFICATION_ID,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun createNotificationChannel() {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
      NotificationChannel(
        CHANNEL_ID,
        getString(R.string.active_call_channel),
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        setShowBadge(false)
      },
    )
  }

  companion object {
    const val CALL_TYPE_AUDIO = "audio"
    const val CALL_TYPE_VIDEO = "video"
    private const val ACTION_START = "arachat.messenger.call.START_FOREGROUND"
    private const val CHANNEL_ID = "arachat_active_calls"
    private const val EXTRA_CALL_TYPE = "arachat.call.type"
    private const val EXTRA_PEER_NAME = "arachat.call.peer_name"
    private const val NOTIFICATION_ID = 3_412

    fun start(context: Context, callType: String, peerName: String) {
      ContextCompat.startForegroundService(
        context,
        Intent(context, CallForegroundService::class.java).apply {
          action = ACTION_START
          putExtra(EXTRA_CALL_TYPE, callType)
          putExtra(EXTRA_PEER_NAME, peerName)
        },
      )
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, CallForegroundService::class.java))
    }
  }
}
