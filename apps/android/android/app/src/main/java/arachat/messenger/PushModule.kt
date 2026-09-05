package arachat.messenger

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import ru.rustore.sdk.universalpush.RuStoreUniversalPushClient

@ReactModule(name = PushModule.NAME)
class PushModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  init {
    RuStoreUniversalPushClient.setOnNewTokenListener { provider, token ->
      emitToken(provider, token)
    }
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun getTokens(promise: Promise) {
    RuStoreUniversalPushClient.getTokens()
      .addOnSuccessListener { tokens ->
        val result = Arguments.createMap()
        tokens.forEach { (provider, token) ->
          if (token.isNotBlank()) {
            result.putString(provider, token)
          }
        }
        promise.resolve(result)
      }
      .addOnFailureListener {
        promise.reject("PUSH_TOKENS_UNAVAILABLE", "Не удалось получить push-токены.")
      }
  }

  @ReactMethod
  fun getNotificationPermissionStatus(promise: Promise) {
    promise.resolve(notificationPermissionStatus())
  }

  @ReactMethod
  fun requestNotificationPermission(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      promise.resolve(PERMISSION_GRANTED)
      return
    }

    if (reactApplicationContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
      promise.resolve(PERMISSION_GRANTED)
      return
    }

    val activity = reactApplicationContext.currentActivity as? PermissionAwareActivity
    if (activity == null) {
      promise.reject("ACTIVITY_UNAVAILABLE", "Невозможно запросить разрешение без активного экрана.")
      return
    }

    activity.requestPermissions(
      arrayOf(Manifest.permission.POST_NOTIFICATIONS),
      NOTIFICATION_PERMISSION_REQUEST_CODE,
      PermissionListener { requestCode, _, grantResults ->
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST_CODE) {
          promise.resolve(
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
              PERMISSION_GRANTED
            } else {
              PERMISSION_DENIED
            },
          )
          true
        } else {
          false
        }
      },
    )
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  private fun notificationPermissionStatus(): String =
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      reactApplicationContext.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    ) {
      PERMISSION_GRANTED
    } else {
      PERMISSION_DENIED
    }

  private fun emitToken(provider: String, token: String) {
    if (token.isBlank()) {
      return
    }

    val payload = Arguments.createMap().apply {
      putString("provider", provider)
      putString("token", token)
    }
    if (!reactApplicationContext.hasActiveReactInstance()) {
      return
    }
    reactApplicationContext
      .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(TOKEN_EVENT, payload)
  }

  companion object {
    const val NAME = "AraChatPush"
    const val TOKEN_EVENT = "AraChatPushToken"
    private const val NOTIFICATION_PERMISSION_REQUEST_CODE = 7431
    private const val PERMISSION_GRANTED = "granted"
    private const val PERMISSION_DENIED = "denied"
  }
}
