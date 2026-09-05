package arachat.messenger

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
    "deviceLanguage" to reactApplicationContext.resources.configuration.locales[0].toLanguageTag(),
  )

  @ReactMethod
  fun createDeviceId(promise: Promise) {
    promise.resolve("android-${UUID.randomUUID()}")
  }

  companion object {
    const val NAME = "AppConfig"
  }
}
