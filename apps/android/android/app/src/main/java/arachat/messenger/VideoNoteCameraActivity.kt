package arachat.messenger

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Outline
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.view.ViewOutlineProvider
import android.widget.Button
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import java.io.File
import kotlin.math.max

class VideoNoteCameraActivity : ComponentActivity() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private lateinit var outputFile: File
  private lateinit var previewView: PreviewView
  private lateinit var recordButton: Button
  private lateinit var timerLabel: TextView
  private lateinit var switchCameraButton: Button
  private var cameraProvider: ProcessCameraProvider? = null
  private var videoCapture: VideoCapture<Recorder>? = null
  private var recording: Recording? = null
  private var lensFacing = CameraSelector.LENS_FACING_FRONT
  private var recordingStartedAtMs = 0L
  private var discardOnFinalize = false

  private val maxDurationRunnable = Runnable {
    stopRecording()
  }

  private val timerRunnable = object : Runnable {
    override fun run() {
      if (recording == null) {
        return
      }
      timerLabel.text = formatDuration(elapsedSeconds())
      mainHandler.postDelayed(this, TIMER_UPDATE_INTERVAL_MS)
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val outputPath = intent.getStringExtra(EXTRA_OUTPUT_PATH)
    if (outputPath.isNullOrBlank()) {
      finishWithError("VIDEO_NOTE_UNAVAILABLE")
      return
    }
    outputFile = File(outputPath)
    if (outputFile.parentFile?.isDirectory != true) {
      outputFile.parentFile?.mkdirs()
    }

    if (checkSelfPermission(android.Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED ||
      checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
    ) {
      finishWithError("CAMERA_PERMISSION_DENIED")
      return
    }

    setContentView(createContentView())
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        cancelRecording()
      }
    })
    startCamera()
  }

  override fun onPause() {
    super.onPause()
    if (!isFinishing && recording != null) {
      cancelRecording()
    }
  }

  override fun onDestroy() {
    mainHandler.removeCallbacks(maxDurationRunnable)
    mainHandler.removeCallbacks(timerRunnable)
    cameraProvider?.unbindAll()
    super.onDestroy()
  }

  private fun createContentView(): View {
    val root = FrameLayout(this).apply {
      setBackgroundColor(Color.BLACK)
    }
    previewView = PreviewView(this).apply {
      implementationMode = PreviewView.ImplementationMode.COMPATIBLE
      scaleType = PreviewView.ScaleType.FILL_CENTER
    }
    val previewFrame = FrameLayout(this).apply {
      clipToOutline = true
      outlineProvider = object : ViewOutlineProvider() {
        override fun getOutline(view: View, outline: Outline) {
          outline.setOval(0, 0, view.width, view.height)
        }
      }
      addView(
        previewView,
        FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT,
        ),
      )
    }
    val previewSize = (resources.displayMetrics.density * PREVIEW_SIZE_DP).toInt()
    root.addView(
      previewFrame,
      FrameLayout.LayoutParams(previewSize, previewSize, Gravity.CENTER).apply {
        bottomMargin = (resources.displayMetrics.density * 28).toInt()
      },
    )

    val closeButton = cameraButton(getString(R.string.video_note_camera_close)).apply {
      contentDescription = getString(R.string.video_note_camera_close_description)
      setOnClickListener { cancelRecording() }
    }
    root.addView(
      closeButton,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.WRAP_CONTENT,
        FrameLayout.LayoutParams.WRAP_CONTENT,
        Gravity.TOP or Gravity.START,
      ).apply {
        leftMargin = (resources.displayMetrics.density * 16).toInt()
        topMargin = (resources.displayMetrics.density * 24).toInt()
      },
    )

    switchCameraButton = cameraButton(getString(R.string.video_note_camera_switch)).apply {
      contentDescription = getString(R.string.video_note_camera_switch_description)
      setOnClickListener { switchCamera() }
    }
    root.addView(
      switchCameraButton,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.WRAP_CONTENT,
        FrameLayout.LayoutParams.WRAP_CONTENT,
        Gravity.TOP or Gravity.END,
      ).apply {
        rightMargin = (resources.displayMetrics.density * 16).toInt()
        topMargin = (resources.displayMetrics.density * 24).toInt()
      },
    )

    timerLabel = TextView(this).apply {
      setTextColor(Color.WHITE)
      textSize = 18f
      gravity = Gravity.CENTER
      text = formatDuration(0)
    }
    root.addView(
      timerLabel,
      FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.WRAP_CONTENT,
        FrameLayout.LayoutParams.WRAP_CONTENT,
        Gravity.TOP or Gravity.CENTER_HORIZONTAL,
      ).apply {
        topMargin = (resources.displayMetrics.density * 32).toInt()
      },
    )

    recordButton = Button(this).apply {
      background = recordingControlBackground(Color.rgb(74, 168, 240))
      contentDescription = getString(R.string.video_note_camera_start_description)
      minHeight = (resources.displayMetrics.density * RECORD_BUTTON_SIZE_DP).toInt()
      minWidth = minHeight
      text = ""
      setOnClickListener {
        if (recording == null) {
          startRecording()
        } else {
          stopRecording()
        }
      }
    }
    root.addView(
      recordButton,
      FrameLayout.LayoutParams(
        (resources.displayMetrics.density * RECORD_BUTTON_SIZE_DP).toInt(),
        (resources.displayMetrics.density * RECORD_BUTTON_SIZE_DP).toInt(),
        Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL,
      ).apply {
        bottomMargin = (resources.displayMetrics.density * 36).toInt()
      },
    )
    return root
  }

  private fun cameraButton(label: String): Button = Button(this).apply {
    setTextColor(Color.WHITE)
    text = label
  }

  private fun recordingControlBackground(color: Int): GradientDrawable = GradientDrawable().apply {
    shape = GradientDrawable.OVAL
    setColor(color)
  }

  private fun startCamera() {
    val providerFuture = ProcessCameraProvider.getInstance(this)
    providerFuture.addListener(
      {
        try {
          cameraProvider = providerFuture.get()
          bindCamera()
        } catch (_: Exception) {
          finishWithError("VIDEO_NOTE_UNAVAILABLE")
        }
      },
      ContextCompat.getMainExecutor(this),
    )
  }

  private fun bindCamera() {
    val provider = cameraProvider ?: return
    val selector = CameraSelector.Builder().requireLensFacing(lensFacing).build()
    val recorder = Recorder.Builder()
      .setQualitySelector(QualitySelector.from(Quality.SD))
      .build()
    val capture = VideoCapture.withOutput(recorder)
    val preview = Preview.Builder().build().also {
      it.surfaceProvider = previewView.surfaceProvider
    }
    try {
      provider.unbindAll()
      provider.bindToLifecycle(this, selector, preview, capture)
      videoCapture = capture
      switchCameraButton.isEnabled = true
    } catch (_: Exception) {
      if (lensFacing == CameraSelector.LENS_FACING_FRONT) {
        lensFacing = CameraSelector.LENS_FACING_BACK
        bindCamera()
      } else {
        finishWithError("VIDEO_NOTE_UNAVAILABLE")
      }
    }
  }

  private fun switchCamera() {
    if (recording != null) {
      return
    }
    lensFacing = if (lensFacing == CameraSelector.LENS_FACING_FRONT) {
      CameraSelector.LENS_FACING_BACK
    } else {
      CameraSelector.LENS_FACING_FRONT
    }
    bindCamera()
  }

  private fun startRecording() {
    val capture = videoCapture ?: return
    outputFile.delete()
    discardOnFinalize = false
    val outputOptions = FileOutputOptions.Builder(outputFile)
      .setFileSizeLimit(MAX_ATTACHMENT_BYTES)
      .build()
    recordingStartedAtMs = SystemClock.elapsedRealtime()
    switchCameraButton.isEnabled = false
    recordButton.background = recordingControlBackground(Color.rgb(255, 107, 129))
    recordButton.contentDescription = getString(R.string.video_note_camera_stop_description)
    val pendingRecording = capture.output.prepareRecording(this, outputOptions).withAudioEnabled()
    recording = pendingRecording.start(ContextCompat.getMainExecutor(this)) { event ->
      if (event is VideoRecordEvent.Finalize) {
        handleRecordingFinished(event)
      }
    }
    mainHandler.post(timerRunnable)
    mainHandler.postDelayed(maxDurationRunnable, MAX_DURATION_MS)
  }

  private fun stopRecording() {
    recording?.stop()
  }

  private fun cancelRecording() {
    if (recording != null) {
      discardOnFinalize = true
      recording?.stop()
      return
    }
    outputFile.delete()
    setResult(Activity.RESULT_CANCELED)
    finish()
  }

  private fun handleRecordingFinished(event: VideoRecordEvent.Finalize) {
    recording = null
    mainHandler.removeCallbacks(maxDurationRunnable)
    mainHandler.removeCallbacks(timerRunnable)
    if (discardOnFinalize) {
      outputFile.delete()
      setResult(Activity.RESULT_CANCELED)
      finish()
      return
    }
    if (event.hasError() || !outputFile.isFile || outputFile.length() <= 0L) {
      outputFile.delete()
      finishWithError(
        if (event.error == VideoRecordEvent.Finalize.ERROR_FILE_SIZE_LIMIT_REACHED) {
          "ATTACHMENT_TOO_LARGE"
        } else {
          "VIDEO_NOTE_RECORDING_FAILED"
        },
      )
      return
    }
    val durationSeconds = elapsedSeconds()
    if (durationSeconds <= 0) {
      outputFile.delete()
      finishWithError("INVALID_RECORDING_DURATION")
      return
    }
    setResult(
      Activity.RESULT_OK,
      Intent().putExtra(EXTRA_DURATION_SECONDS, durationSeconds),
    )
    finish()
  }

  private fun elapsedSeconds(): Int = max(
    1,
    ((SystemClock.elapsedRealtime() - recordingStartedAtMs + 500L) / 1_000L).toInt(),
  )

  private fun formatDuration(seconds: Int): String =
    "%d:%02d".format(seconds / 60, seconds % 60)

  private fun finishWithError(code: String) {
    if (::outputFile.isInitialized) {
      outputFile.delete()
    }
    setResult(Activity.RESULT_CANCELED, Intent().putExtra(EXTRA_ERROR_CODE, code))
    finish()
  }

  companion object {
    const val EXTRA_DURATION_SECONDS = "arachat.video_note.duration_seconds"
    const val EXTRA_ERROR_CODE = "arachat.video_note.error_code"
    private const val EXTRA_OUTPUT_PATH = "arachat.video_note.output_path"
    private const val PREVIEW_SIZE_DP = 288
    private const val RECORD_BUTTON_SIZE_DP = 72
    private const val TIMER_UPDATE_INTERVAL_MS = 250L
    private const val MAX_DURATION_MS = 60_000L
    private const val MAX_ATTACHMENT_BYTES = 30L * 1024 * 1024

    fun createIntent(activity: Activity, outputFile: File): Intent =
      Intent(activity, VideoNoteCameraActivity::class.java)
        .putExtra(EXTRA_OUTPUT_PATH, outputFile.absolutePath)
  }
}
