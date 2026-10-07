package arachat.messenger

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.lang.ref.WeakReference

@ReactModule(name = CallForegroundModule.NAME)
class CallForegroundModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  init {
    instance = WeakReference(this)
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun startCallForeground(callType: String, peerName: String, promise: Promise) {
    if (callType !in setOf(CallForegroundService.CALL_TYPE_AUDIO, CallForegroundService.CALL_TYPE_VIDEO)) {
      promise.reject("INVALID_CALL_TYPE", "Unsupported call type.")
      return
    }

    try {
      CallForegroundService.start(reactApplicationContext, callType, peerName)
      MainActivity.setVideoCallPictureInPictureEnabled(callType == CallForegroundService.CALL_TYPE_VIDEO)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("CALL_FOREGROUND_SERVICE_UNAVAILABLE", "Unable to start the call service.", error)
    }
  }

  @ReactMethod
  fun stopCallForeground(promise: Promise) {
    MainActivity.setVideoCallPictureInPictureEnabled(false)
    CallForegroundService.stop(reactApplicationContext)
    promise.resolve(null)
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  override fun invalidate() {
    if (instance?.get() === this) {
      instance = null
    }
    super.invalidate()
  }

  private fun emitPictureInPictureModeChanged(isInPictureInPicture: Boolean) {
    if (!reactApplicationContext.hasActiveReactInstance()) {
      return
    }

    reactApplicationContext
      .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(
        EVENT_NAME,
        Arguments.createMap().apply { putBoolean("isInPictureInPicture", isInPictureInPicture) },
      )
  }

  companion object {
    const val NAME = "AraChatCallForeground"
    private const val EVENT_NAME = "AraChatCallPresentationEvent"
    private var instance: WeakReference<CallForegroundModule>? = null

    fun emitPictureInPictureModeChanged(isInPictureInPicture: Boolean) {
      instance?.get()?.emitPictureInPictureModeChanged(isInPictureInPicture)
    }
  }
}
