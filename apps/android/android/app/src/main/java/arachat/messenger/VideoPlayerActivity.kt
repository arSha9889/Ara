package arachat.messenger

import android.app.Activity
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.MediaController
import android.widget.VideoView

class VideoPlayerActivity : Activity() {
  private lateinit var videoView: VideoView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val videoUri = intent.data
    if (!isPrivateVideoUri(videoUri) || intent.type !in VIDEO_MIME_TYPES) {
      finish()
      return
    }

    videoView = VideoView(this)
    val controller = MediaController(this).apply {
      setAnchorView(videoView)
    }
    videoView.setMediaController(controller)
    videoView.setVideoURI(videoUri)
    videoView.setOnPreparedListener {
      videoView.start()
      controller.show(0)
    }
    videoView.setOnErrorListener { _, _, _ ->
      finish()
      true
    }

    setContentView(
      FrameLayout(this).apply {
        setBackgroundColor(android.graphics.Color.BLACK)
        addView(
          videoView,
          FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
          ),
        )
      },
    )
  }

  override fun onPause() {
    super.onPause()
    if (::videoView.isInitialized) {
      videoView.pause()
    }
  }

  private fun isPrivateVideoUri(uri: Uri?): Boolean =
    uri?.scheme == "content" && uri.authority == "$packageName.media"

  companion object {
    private val VIDEO_MIME_TYPES = setOf(
      "video/mp4",
      "video/webm",
      "video/quicktime",
    )
  }
}
