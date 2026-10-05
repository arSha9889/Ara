package arachat.messenger

import org.junit.Assert.assertEquals
import org.junit.Test

class PushProviderSelectorTest {
  @Test
  fun `selects RuStore only for its exact installer package`() {
    assertEquals(
      AndroidPushProvider.RUSTORE,
      PushProviderSelector.select("ru.vk.store"),
    )
    assertEquals(
      AndroidPushProvider.FCM,
      PushProviderSelector.select("ru.vk.store.beta"),
    )
  }

  @Test
  fun `selects FCM for Google Play direct and unknown installations`() {
    assertEquals(
      AndroidPushProvider.FCM,
      PushProviderSelector.select("com.android.vending"),
    )
    assertEquals(AndroidPushProvider.FCM, PushProviderSelector.select(null))
  }
}
