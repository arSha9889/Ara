package arachat.messenger

import android.media.AudioManager
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioFocusPolicyTest {
  @Test
  fun `pauses voice playback for permanent and transient focus loss`() {
    assertTrue(pausesVoicePlaybackForAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS))
    assertTrue(pausesVoicePlaybackForAudioFocusChange(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT))
  }

  @Test
  fun `keeps voice playback running when another app can duck`() {
    assertFalse(
      pausesVoicePlaybackForAudioFocusChange(
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK,
      ),
    )
  }
}
