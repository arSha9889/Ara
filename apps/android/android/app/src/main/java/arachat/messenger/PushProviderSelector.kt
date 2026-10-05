package arachat.messenger

import android.content.Context

enum class AndroidPushProvider(val sdkKey: String) {
  RUSTORE("rustore"),
  FCM("firebase"),
}

object PushProviderSelector {
  private const val RUSTORE_INSTALLER_PACKAGE = "ru.vk.store"

  fun select(context: Context): AndroidPushProvider = select(installerPackageName(context))

  fun select(installerPackageName: String?): AndroidPushProvider =
    if (installerPackageName == RUSTORE_INSTALLER_PACKAGE) {
      AndroidPushProvider.RUSTORE
    } else {
      AndroidPushProvider.FCM
    }

  private fun installerPackageName(context: Context): String? =
    try {
      context.packageManager
        .getInstallSourceInfo(context.packageName)
        .installingPackageName
    } catch (_: Exception) {
      null
    }
}
