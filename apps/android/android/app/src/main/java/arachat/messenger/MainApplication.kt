package arachat.messenger

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import ru.rustore.sdk.pushclient.common.logger.Logger
import ru.rustore.sdk.universalpush.RuStoreUniversalPushClient
import ru.rustore.sdk.universalpush.firebase.provides.FirebasePushProvider
import ru.rustore.sdk.universalpush.rustore.providers.RuStorePushProvider

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(AppConfigPackage())
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    initializePushProviders()
    PushNotificationHandler.install(this)
    loadReactNative(this)
  }

  private fun initializePushProviders() {
    val rustoreProjectId = BuildConfig.RUSTORE_PUSH_PROJECT_ID.trim()
    val rustoreProvider = rustoreProjectId.takeIf { it.isNotEmpty() }?.let { projectId ->
      RuStorePushProvider(
        application = this,
        projectId = projectId,
        logger = PushLogger,
      )
    }

    RuStoreUniversalPushClient.init(
      context = this,
      rustore = rustoreProvider,
      firebase = FirebasePushProvider(context = this),
    )
  }

  private object PushLogger : Logger {
    override fun verbose(message: String, throwable: Throwable?) = Unit

    override fun debug(message: String, throwable: Throwable?) = Unit

    override fun info(message: String, throwable: Throwable?) = Unit

    override fun warn(message: String, throwable: Throwable?) = Unit

    override fun error(message: String, throwable: Throwable?) = Unit

    override fun createLogger(tag: String): Logger = this

    override fun createLogger(any: Any): Logger = this
  }
}
