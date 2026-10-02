package arachat.messenger

import android.media.AudioManager

internal fun pausesVoicePlaybackForAudioFocusChange(focusChange: Int): Boolean =
  focusChange == AudioManager.AUDIOFOCUS_LOSS ||
    focusChange == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
