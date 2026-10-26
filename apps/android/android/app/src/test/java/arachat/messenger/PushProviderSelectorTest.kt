package arachat.messenger

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PushProviderSelectorTest {
  @Test
  fun `selects RuStore only for its exact installer package`() {
    assertEquals(
      AndroidPushProvider.RUSTORE,
      PushProviderSelector.select("ru.vk.store"),
    )
    assertNull(PushProviderSelector.select("ru.vk.store.beta"))
  }

  @Test
  fun `disables mobile push for Google Play direct and unknown installations`() {
    assertNull(PushProviderSelector.select("com.android.vending"))
    assertNull(PushProviderSelector.select(null))
  }
}
