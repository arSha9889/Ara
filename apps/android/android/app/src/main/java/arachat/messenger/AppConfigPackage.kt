package arachat.messenger

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class AppConfigPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    when (name) {
      AppConfigModule.NAME -> AppConfigModule(reactContext)
      CallAudioModule.NAME -> CallAudioModule(reactContext)
      CallForegroundModule.NAME -> CallForegroundModule(reactContext)
      MediaModule.NAME -> MediaModule(reactContext)
      NetworkModule.NAME -> NetworkModule(reactContext)
      PushModule.NAME -> PushModule(reactContext)
      else -> null
    }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      mapOf(
        AppConfigModule.NAME to
          ReactModuleInfo(
            name = AppConfigModule.NAME,
            className = AppConfigModule::class.java.name,
            canOverrideExistingModule = false,
            needsEagerInit = false,
            isCxxModule = false,
            isTurboModule = false,
          ),
        CallAudioModule.NAME to
          ReactModuleInfo(
            name = CallAudioModule.NAME,
            className = CallAudioModule::class.java.name,
            canOverrideExistingModule = false,
            needsEagerInit = false,
            isCxxModule = false,
            isTurboModule = false,
          ),
        CallForegroundModule.NAME to
          ReactModuleInfo(
            name = CallForegroundModule.NAME,
            className = CallForegroundModule::class.java.name,
            canOverrideExistingModule = false,
            needsEagerInit = false,
            isCxxModule = false,
            isTurboModule = false,
          ),
        MediaModule.NAME to
          ReactModuleInfo(
            name = MediaModule.NAME,
            className = MediaModule::class.java.name,
            canOverrideExistingModule = false,
            needsEagerInit = false,
            isCxxModule = false,
            isTurboModule = false,
          ),
        NetworkModule.NAME to
          ReactModuleInfo(
            name = NetworkModule.NAME,
            className = NetworkModule::class.java.name,
            canOverrideExistingModule = false,
            needsEagerInit = false,
            isCxxModule = false,
            isTurboModule = false,
          ),
        PushModule.NAME to
          ReactModuleInfo(
            name = PushModule.NAME,
            className = PushModule::class.java.name,
            canOverrideExistingModule = false,
            needsEagerInit = true,
            isCxxModule = false,
            isTurboModule = false,
          ),
      )
    }
}
