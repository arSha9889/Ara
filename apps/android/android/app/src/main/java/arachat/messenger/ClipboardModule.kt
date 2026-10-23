package arachat.messenger

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = ClipboardModule.NAME)
class ClipboardModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = NAME

  @ReactMethod
  fun setText(value: String, promise: Promise) {
    try {
      val clipboard = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("AraChat", value))
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("CLIPBOARD_UNAVAILABLE", "Could not copy text to the clipboard.", error)
    }
  }

  companion object {
    const val NAME = "AraChatClipboard"
  }
}
