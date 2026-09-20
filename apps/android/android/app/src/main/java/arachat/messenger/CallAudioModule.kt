package arachat.messenger

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = CallAudioModule.NAME)
class CallAudioModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val audioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .build()
  private val audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
    .setAudioAttributes(audioAttributes)
    .setOnAudioFocusChangeListener(::handleAudioFocusChange)
    .build()
  private var audioSessionActive = false
  private var previousAudioMode = AudioManager.MODE_NORMAL

  private val audioDeviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<AudioDeviceInfo>) = emitRoutesChanged()

    override fun onAudioDevicesRemoved(removedDevices: Array<AudioDeviceInfo>) = emitRoutesChanged()
  }

  init {
    audioManager.registerAudioDeviceCallback(audioDeviceCallback, Handler(Looper.getMainLooper()))
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun startCallAudioSession(promise: Promise) {
    if (!audioSessionActive) {
      previousAudioMode = audioManager.mode
      audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
      val focusResult = audioManager.requestAudioFocus(audioFocusRequest)
      if (focusResult != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
        audioManager.mode = previousAudioMode
        promise.reject("AUDIO_FOCUS_UNAVAILABLE", "Не удалось получить аудиофокус для звонка.")
        return
      }
      audioSessionActive = true
      selectPreferredRoute()
    }

    promise.resolve(audioSessionToWritableMap())
  }

  @ReactMethod
  fun getCallAudioSession(promise: Promise) {
    promise.resolve(audioSessionToWritableMap())
  }

  @ReactMethod
  fun selectCallAudioRoute(routeId: String, promise: Promise) {
    if (!audioSessionActive) {
      promise.reject("AUDIO_SESSION_INACTIVE", "Аудиосессия звонка не активна.")
      return
    }

    val device = availableCommunicationDevices().firstOrNull { it.id.toString() == routeId }
    if (device == null || !audioManager.setCommunicationDevice(device)) {
      promise.reject("AUDIO_ROUTE_UNAVAILABLE", "Выбранное аудиоустройство недоступно.")
      return
    }

    emitRoutesChanged()
    promise.resolve(audioSessionToWritableMap())
  }

  @ReactMethod
  fun stopCallAudioSession(promise: Promise) {
    stopAudioSession()
    promise.resolve(null)
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  override fun invalidate() {
    stopAudioSession()
    audioManager.unregisterAudioDeviceCallback(audioDeviceCallback)
    super.invalidate()
  }

  private fun stopAudioSession() {
    if (!audioSessionActive) {
      return
    }

    audioManager.clearCommunicationDevice()
    audioManager.abandonAudioFocusRequest(audioFocusRequest)
    audioManager.mode = previousAudioMode
    audioSessionActive = false
  }

  private fun selectPreferredRoute() {
    val routes = availableCommunicationDevices()
    val preferredDevice = routes.firstOrNull { routeKind(it) == ROUTE_BLUETOOTH }
      ?: routes.firstOrNull { routeKind(it) == ROUTE_WIRED }
      ?: routes.firstOrNull { routeKind(it) == ROUTE_EARPIECE }

    if (preferredDevice != null) {
      audioManager.setCommunicationDevice(preferredDevice)
    } else {
      audioManager.clearCommunicationDevice()
    }
  }

  private fun availableCommunicationDevices(): List<AudioDeviceInfo> =
    audioManager.availableCommunicationDevices.filter { routeKind(it) != null }

  private fun routeKind(device: AudioDeviceInfo): String? = when (device.type) {
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> ROUTE_EARPIECE
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> ROUTE_SPEAKER
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    AudioDeviceInfo.TYPE_BLE_HEADSET,
    AudioDeviceInfo.TYPE_HEARING_AID -> ROUTE_BLUETOOTH
    AudioDeviceInfo.TYPE_WIRED_HEADSET,
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_USB_HEADSET -> ROUTE_WIRED
    else -> null
  }

  private fun audioSessionToWritableMap(): WritableMap = Arguments.createMap().apply {
    putArray("routes", routesToWritableArray())
    audioManager.communicationDevice?.let { putString("selectedRouteId", it.id.toString()) }
  }

  private fun routesToWritableArray(): WritableArray = Arguments.createArray().apply {
    availableCommunicationDevices().forEach { device ->
      val kind = routeKind(device) ?: return@forEach
      pushMap(Arguments.createMap().apply {
        putString("id", device.id.toString())
        putString("kind", kind)
      })
    }
  }

  private fun handleAudioFocusChange(focusChange: Int) {
    if (
      audioSessionActive && (
        focusChange == AudioManager.AUDIOFOCUS_LOSS ||
          focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
        )
    ) {
      emitEvent(FOCUS_LOST_EVENT)
    }
  }

  private fun emitRoutesChanged() {
    if (audioSessionActive) {
      emitEvent(ROUTES_CHANGED_EVENT)
    }
  }

  private fun emitEvent(type: String) {
    if (!reactApplicationContext.hasActiveReactInstance()) {
      return
    }

    val payload = Arguments.createMap().apply { putString("type", type) }
    reactApplicationContext
      .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, payload)
  }

  companion object {
    const val NAME = "AraChatCallAudio"
    const val EVENT_NAME = "AraChatCallAudioEvent"
    const val ROUTES_CHANGED_EVENT = "routesChanged"
    const val FOCUS_LOST_EVENT = "focusLost"
    const val ROUTE_EARPIECE = "earpiece"
    const val ROUTE_SPEAKER = "speaker"
    const val ROUTE_WIRED = "wired"
    const val ROUTE_BLUETOOTH = "bluetooth"
  }
}
