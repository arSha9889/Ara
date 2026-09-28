package arachat.messenger

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = NetworkModule.NAME)
class NetworkModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val connectivityManager =
    reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  private var isNetworkCallbackRegistered = false
  private var lastEmittedState: NetworkState? = null

  private val networkCallback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) = emitNetworkState()

    override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) =
      emitNetworkState()

    override fun onLost(network: Network) = emitNetworkState()

    override fun onUnavailable() = emitNetworkState()
  }

  init {
    registerNetworkCallback()
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun getNetworkState(promise: Promise) {
    promise.resolve(currentNetworkState().toWritableMap())
  }

  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  override fun invalidate() {
    if (isNetworkCallbackRegistered) {
      try {
        connectivityManager.unregisterNetworkCallback(networkCallback)
      } catch (_: IllegalArgumentException) {
        // The Android process can remove callbacks before the React bridge is invalidated.
      }
      isNetworkCallbackRegistered = false
    }
    super.invalidate()
  }

  private fun registerNetworkCallback() {
    try {
      connectivityManager.registerDefaultNetworkCallback(networkCallback)
      isNetworkCallbackRegistered = true
    } catch (_: SecurityException) {
      // getNetworkState still reports an unavailable status instead of a false offline state.
    }
  }

  private fun emitNetworkState() {
    if (!reactApplicationContext.hasActiveReactInstance()) {
      return
    }

    val state = currentNetworkState()
    if (state == lastEmittedState) {
      return
    }
    lastEmittedState = state
    reactApplicationContext
      .getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(EVENT_NAME, state.toWritableMap())
  }

  private fun currentNetworkState(): NetworkState = try {
    val activeNetwork = connectivityManager.activeNetwork
      ?: return NetworkState(STATE_DISCONNECTED, TRANSPORT_NONE)
    val capabilities = connectivityManager.getNetworkCapabilities(activeNetwork)
      ?: return NetworkState(STATE_CONNECTING, TRANSPORT_OTHER)
    val transport = transportFor(capabilities)

    when {
      !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) ->
        NetworkState(STATE_DISCONNECTED, transport)
      capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) ->
        NetworkState(STATE_CONNECTED, transport)
      else -> NetworkState(STATE_CONNECTING, transport)
    }
  } catch (_: SecurityException) {
    NetworkState(STATE_UNAVAILABLE, TRANSPORT_NONE)
  }

  private fun transportFor(capabilities: NetworkCapabilities): String = when {
    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> TRANSPORT_WIFI
    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> TRANSPORT_CELLULAR
    else -> TRANSPORT_OTHER
  }

  private data class NetworkState(val state: String, val transport: String) {
    fun toWritableMap(): WritableMap = Arguments.createMap().apply {
      putString("state", state)
      putString("transport", transport)
    }
  }

  companion object {
    const val NAME = "AraChatNetwork"
    const val EVENT_NAME = "AraChatNetworkState"
    private const val STATE_CONNECTED = "connected"
    private const val STATE_CONNECTING = "connecting"
    private const val STATE_DISCONNECTED = "disconnected"
    private const val STATE_UNAVAILABLE = "unavailable"
    private const val TRANSPORT_WIFI = "wifi"
    private const val TRANSPORT_CELLULAR = "cellular"
    private const val TRANSPORT_OTHER = "other"
    private const val TRANSPORT_NONE = "none"
  }
}
