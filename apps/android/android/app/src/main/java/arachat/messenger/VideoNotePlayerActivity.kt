package arachat.messenger

import android.app.Activity
import android.graphics.Color
import android.graphics.Outline
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.widget.FrameLayout
import android.widget.MediaController
import android.widget.VideoView

class VideoNotePlayerActivity : Activity() {
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

    val noteFrame = FrameLayout(this).apply {
      clipToOutline = true
      outlineProvider = object : ViewOutlineProvider() {
        override fun getOutline(view: View, outline: Outline) {
          outline.setOval(0, 0, view.width, view.height)
        }
      }
      addView(
        videoView,
        FrameLayout.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT,
        ),
      )
    }
    val noteSize = (resources.displayMetrics.density * 320).toInt()

    setContentView(
      FrameLayout(this).apply {
        setBackgroundColor(Color.BLACK)
        addView(
          noteFrame,
          FrameLayout.LayoutParams(noteSize, noteSize).apply {
            gravity = android.view.Gravity.CENTER
          },
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
