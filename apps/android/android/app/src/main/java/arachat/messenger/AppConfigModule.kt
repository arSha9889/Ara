package arachat.messenger

import android.content.pm.PackageInstaller
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.util.UUID

@ReactModule(name = AppConfigModule.NAME)
class AppConfigModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = NAME

  override fun getConstants(): Map<String, Any> = mapOf(
    "apiBaseUrl" to BuildConfig.API_BASE_URL,
    "appVersion" to BuildConfig.VERSION_NAME,
    "appVersionCode" to BuildConfig.VERSION_CODE,
    "deviceLanguage" to reactApplicationContext.resources.configuration.locales[0].toLanguageTag(),
    "installSource" to installSource(),
  )

  @ReactMethod
  fun createDeviceId(promise: Promise) {
    promise.resolve("android-${UUID.randomUUID()}")
  }

  private fun installSource(): Map<String, Any> {
    return try {
      val sourceInfo = reactApplicationContext.packageManager
        .getInstallSourceInfo(reactApplicationContext.packageName)
      val installSource = mutableMapOf<String, Any>(
        "packageSource" to sourceInfo.packageSource,
        "isFileInstall" to (
          sourceInfo.packageSource == PackageInstaller.PACKAGE_SOURCE_LOCAL_FILE ||
            sourceInfo.packageSource == PackageInstaller.PACKAGE_SOURCE_DOWNLOADED_FILE
          ),
      )
      sourceInfo.installingPackageName
        ?.takeIf { it.isNotBlank() }
        ?.let { installSource["installerPackageName"] = it }
      installSource
    } catch (_: Exception) {
      emptyMap()
    }
  }

  companion object {
    const val NAME = "AppConfig"
  }
}
