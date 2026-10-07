package arachat.messenger

import android.app.PictureInPictureParams
import android.content.Intent
import android.content.res.Configuration
import android.os.Bundle
import android.util.Rational
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import java.lang.ref.WeakReference

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    activeInstance = WeakReference(this)
    PushModule.handleNotificationIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    PushModule.handleNotificationIntent(intent)
  }

  override fun onResume() {
    super.onResume()
    activeInstance = WeakReference(this)
  }

  override fun onDestroy() {
    if (activeInstance?.get() === this) {
      activeInstance = null
    }
    super.onDestroy()
  }

  override fun onPictureInPictureModeChanged(
    isInPictureInPictureMode: Boolean,
    newConfig: Configuration,
  ) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    CallForegroundModule.emitPictureInPictureModeChanged(isInPictureInPictureMode)
  }

  private fun setVideoCallPictureInPictureEnabled(enabled: Boolean) {
    setPictureInPictureParams(
      PictureInPictureParams.Builder()
        .setAspectRatio(Rational(16, 9))
        .setAutoEnterEnabled(enabled)
        .build(),
    )
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "AraChat"

  /** Returns the instance of the [ReactActivityDelegate]. */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName)

  companion object {
    private var activeInstance: WeakReference<MainActivity>? = null

    fun setVideoCallPictureInPictureEnabled(enabled: Boolean) {
      activeInstance?.get()?.setVideoCallPictureInPictureEnabled(enabled)
    }
  }
}
