package arachat.messenger

import android.app.Activity
import android.Manifest
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.SystemClock
import android.provider.MediaStore.Files.FileColumns
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Log
import androidx.core.content.FileProvider
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.io.File
import java.io.FileOutputStream
import java.net.URI
import java.net.URL
import java.security.MessageDigest
import java.util.UUID
import javax.net.ssl.HttpsURLConnection
import kotlin.math.max

@ReactModule(name = MediaModule.NAME)
class MediaModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext), ActivityEventListener, LifecycleEventListener {
  private val mediaCacheLock = Any()
  private val voiceRecordingLock = Any()
  private val audioPlaybackLock = Any()
  private val audioManager = reactContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val audioPlaybackAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_MEDIA)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .build()
  private val audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    .setAudioAttributes(audioPlaybackAttributes)
    .setOnAudioFocusChangeListener(::handleAudioFocusChange)
    .build()
  private var mediaCacheGeneration = 0L
  private var pendingPicker: PendingPicker? = null
  private var pendingVideoNote: PendingVideoNote? = null
  private var voiceRecorder: MediaRecorder? = null
  private var voiceRecordingFile: File? = null
  private var voiceRecordingStartedAtMs = 0L
  private var audioPlayer: MediaPlayer? = null
  private var audioPlaybackUri: String? = null
  private var audioPlayerPrepared = false
  private var audioPlaybackEnded = false
  private var pendingAudioPlaybackPromise: Promise? = null
  private var pendingAudioPlaybackUri: String? = null

  init {
    reactContext.addActivityEventListener(this)
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun pickPhoto(promise: Promise) {
    launchPicker(
      Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*"),
      PHOTO_PICKER_REQUEST_CODE,
      attachmentKind = AttachmentKind.PHOTO,
      promise = promise,
    )
  }

  @ReactMethod
  fun pickDocument(promise: Promise) {
    launchPicker(
      Intent(Intent.ACTION_OPEN_DOCUMENT)
        .addCategory(Intent.CATEGORY_OPENABLE)
        .setType("*/*")
        .putExtra(Intent.EXTRA_MIME_TYPES, DOCUMENT_MIME_TYPES.toTypedArray())
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
      DOCUMENT_PICKER_REQUEST_CODE,
      attachmentKind = AttachmentKind.DOCUMENT,
      promise = promise,
    )
  }

  @ReactMethod
  fun pickVideo(promise: Promise) {
    launchPicker(
      Intent(Intent.ACTION_OPEN_DOCUMENT)
        .addCategory(Intent.CATEGORY_OPENABLE)
        .setType("video/*")
        .putExtra(Intent.EXTRA_MIME_TYPES, VIDEO_MIME_TYPES.toTypedArray())
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION),
      VIDEO_PICKER_REQUEST_CODE,
      attachmentKind = AttachmentKind.VIDEO,
      promise = promise,
    )
  }

  @ReactMethod
  fun listRecentMedia(limit: Int, promise: Promise) {
    try {
      if (!hasMediaLibraryPermission()) {
        promise.reject("MEDIA_LIBRARY_PERMISSION_DENIED", "Для просмотра медиатеки нужен доступ к фото и видео.")
        return
      }

      val result = Arguments.createArray()
      val projection = arrayOf(
        FileColumns._ID,
        FileColumns.DISPLAY_NAME,
        FileColumns.MIME_TYPE,
        FileColumns.SIZE,
        FileColumns.DATE_MODIFIED,
        FileColumns.MEDIA_TYPE,
      )
      val mediaCollection = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL)
      val selection = "${FileColumns.MEDIA_TYPE} IN (?, ?)"
      val selectionArgs = arrayOf(
        FileColumns.MEDIA_TYPE_IMAGE.toString(),
        FileColumns.MEDIA_TYPE_VIDEO.toString(),
      )
      val sortOrder = "${FileColumns.DATE_MODIFIED} DESC"
      val maxResults = limit.coerceIn(1, MAX_MEDIA_LIBRARY_ITEMS)
      reactApplicationContext.contentResolver.query(
        mediaCollection,
        projection,
        selection,
        selectionArgs,
        sortOrder,
      )?.use { cursor ->
        val idIndex = cursor.getColumnIndexOrThrow(FileColumns._ID)
        val nameIndex = cursor.getColumnIndexOrThrow(FileColumns.DISPLAY_NAME)
        val mimeTypeIndex = cursor.getColumnIndexOrThrow(FileColumns.MIME_TYPE)
        val sizeIndex = cursor.getColumnIndexOrThrow(FileColumns.SIZE)
        while (cursor.moveToNext() && result.size() < maxResults) {
          val mimeType = normalizedMimeType(cursor.getString(mimeTypeIndex))
          if (mimeType !in PHOTO_MIME_TYPES && mimeType !in VIDEO_MIME_TYPES) {
            continue
          }
          val name = cursor.getString(nameIndex)?.takeIf { it.isNotBlank() } ?: continue
          val sizeBytes = cursor.getLong(sizeIndex)
          if (sizeBytes <= 0L) {
            continue
          }
          val itemUri = Uri.withAppendedPath(mediaCollection, cursor.getLong(idIndex).toString())
          result.pushMap(Arguments.createMap().apply {
            putString("uri", itemUri.toString())
            putString("name", name.take(MAX_FILENAME_LENGTH))
            putString("mimeType", mimeType)
            putDouble("sizeBytes", sizeBytes.toDouble())
          })
        }
      }
      promise.resolve(result)
    } catch (error: SecurityException) {
      promise.reject("MEDIA_LIBRARY_PERMISSION_DENIED", "Для просмотра медиатеки нужен доступ к фото и видео.", error)
    } catch (error: Exception) {
      Log.w(LOG_TAG, "Unable to list recent media.", error)
      promise.reject("MEDIA_LIBRARY_UNAVAILABLE", "Не удалось открыть медиатеку устройства.", error)
    }
  }

  @ReactMethod
  fun copyMediaLibraryItem(contentUri: String, promise: Promise) {
    Thread {
      try {
        val source = Uri.parse(contentUri)
        if (source.scheme != "content" || source.authority != MediaStore.AUTHORITY) {
          throw MediaModuleException("INVALID_MEDIA_LIBRARY_ITEM", "Выбранный объект медиатеки недоступен.")
        }
        val mimeType = normalizedMimeType(reactApplicationContext.contentResolver.getType(source))
        val attachmentKind = when (mimeType) {
          in PHOTO_MIME_TYPES -> AttachmentKind.PHOTO
          in VIDEO_MIME_TYPES -> AttachmentKind.VIDEO
          else -> throw MediaModuleException("UNSUPPORTED_ATTACHMENT_TYPE", "Этот формат вложения пока не поддерживается.")
        }
        promise.resolve(copySelectedAttachment(source, attachmentKind))
      } catch (error: MediaModuleException) {
        promise.reject(error.code, error.message)
      } catch (error: SecurityException) {
        promise.reject("MEDIA_LIBRARY_PERMISSION_DENIED", "Для выбора объекта нужен доступ к медиатеке.", error)
      } catch (error: Exception) {
        Log.w(LOG_TAG, "Unable to copy media library item.", error)
        promise.reject("ATTACHMENT_READ_FAILED", "Не удалось прочитать выбранный файл.", error)
      }
    }.start()
  }

  @ReactMethod
  fun startVoiceRecording(promise: Promise) {
    if (ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("VOICE_PERMISSION_DENIED", "Для записи голосового сообщения нужен доступ к микрофону.")
      return
    }

    synchronized(voiceRecordingLock) {
      if (voiceRecorder != null) {
        promise.reject("VOICE_RECORDING_IN_PROGRESS", "Запись голосового сообщения уже идёт.")
        return
      }

      val target = File(draftsDirectory(), "voice-${UUID.randomUUID()}.m4a")
      val recorder = MediaRecorder(reactApplicationContext)
      try {
        recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
        recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        recorder.setAudioEncodingBitRate(96_000)
        recorder.setAudioSamplingRate(44_100)
        recorder.setOutputFile(target.absolutePath)
        recorder.prepare()
        recorder.start()
        voiceRecorder = recorder
        voiceRecordingFile = target
        voiceRecordingStartedAtMs = SystemClock.elapsedRealtime()
        promise.resolve(null)
      } catch (_: Exception) {
        recorder.release()
        target.delete()
        promise.reject("VOICE_RECORDING_FAILED", "Не удалось начать запись голосового сообщения.")
      }
    }
  }

  @ReactMethod
  fun stopVoiceRecording(promise: Promise) {
    val recorder: MediaRecorder
    val target: File
    val startedAtMs: Long
    synchronized(voiceRecordingLock) {
      recorder = voiceRecorder
        ?: run {
          promise.reject("VOICE_RECORDING_INACTIVE", "Запись голосового сообщения не начата.")
          return
        }
      target = voiceRecordingFile
        ?: run {
          voiceRecorder = null
          recorder.release()
          promise.reject("VOICE_RECORDING_FAILED", "Черновик голосового сообщения недоступен.")
          return
        }
      startedAtMs = voiceRecordingStartedAtMs
      voiceRecorder = null
      voiceRecordingFile = null
      voiceRecordingStartedAtMs = 0L
    }

    try {
      recorder.stop()
      val durationSeconds = max(
        1,
        ((SystemClock.elapsedRealtime() - startedAtMs + MILLIS_PER_SECOND / 2) / MILLIS_PER_SECOND).toInt(),
      )
      promise.resolve(recordedAttachment(target, "voice-${System.currentTimeMillis()}.m4a", "audio/mp4", durationSeconds))
    } catch (_: Exception) {
      target.delete()
      promise.reject("VOICE_RECORDING_FAILED", "Не удалось сохранить голосовое сообщение.")
    } finally {
      recorder.release()
    }
  }

  @ReactMethod
  fun cancelVoiceRecording(promise: Promise) {
    cancelVoiceRecordingInternal()
    promise.resolve(null)
  }

  @ReactMethod
  fun recordVideoNote(promise: Promise) {
    if (pendingPicker != null || pendingVideoNote != null) {
      promise.reject("PICKER_IN_PROGRESS", "Другая запись или выбор вложения уже открыт.")
      return
    }

    if (ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("CAMERA_PERMISSION_DENIED", "Для записи видеосообщения нужен доступ к камере.")
      return
    }
    if (ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      promise.reject("VIDEO_NOTE_AUDIO_PERMISSION_DENIED", "Для записи видеосообщения нужен доступ к микрофону.")
      return
    }

    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_UNAVAILABLE", "Невозможно открыть камеру без активного экрана.")
      return
    }

    val target = File(draftsDirectory(), "video-note-${UUID.randomUUID()}.mp4")
    try {
      pendingVideoNote = PendingVideoNote(promise = promise, target = target)
      activity.startActivityForResult(
        VideoNoteCameraActivity.createIntent(activity, target),
        VIDEO_NOTE_RECORDING_REQUEST_CODE,
      )
    } catch (error: ActivityNotFoundException) {
      Log.w(LOG_TAG, "Unable to launch the internal camera for a video note.", error)
      pendingVideoNote = null
      target.delete()
      promise.reject("VIDEO_NOTE_UNAVAILABLE", "Камера для видеосообщений недоступна на этом устройстве.")
    } catch (error: Exception) {
      Log.e(LOG_TAG, "Unable to launch the internal camera for a video note.", error)
      pendingVideoNote = null
      target.delete()
      promise.reject("VIDEO_NOTE_UNAVAILABLE", "Не удалось открыть камеру для видеосообщения.")
    }
  }

  @ReactMethod
  fun downloadPrivateMedia(
    mediaPath: String,
    apiBaseUrl: String,
    accessToken: String,
    mimeType: String,
    promise: Promise,
  ) {
    Thread {
      try {
        val mediaUrl = privateMediaUrl(apiBaseUrl, mediaPath)
        if (accessToken.isBlank()) {
          throw MediaModuleException("MEDIA_UNAUTHORIZED", "Сессия для загрузки вложения недоступна.")
        }

        val cacheGeneration = synchronized(mediaCacheLock) { mediaCacheGeneration }
        val target = File(downloadDirectory(), "${sha256(mediaPath)}${extensionForMime(mimeType)}")
        val hasCachedMedia = synchronized(mediaCacheLock) {
          cacheGeneration == mediaCacheGeneration && target.isFile && target.length() > 0L
        }
        if (!hasCachedMedia) {
          downloadToCache(mediaUrl, accessToken, target, cacheGeneration)
        }
        promise.resolve(Uri.fromFile(target).toString())
      } catch (error: MediaModuleException) {
        promise.reject(error.code, error.message)
      } catch (_: Exception) {
        promise.reject("MEDIA_DOWNLOAD_FAILED", "Не удалось загрузить вложение.")
      }
    }.start()
  }

  @ReactMethod
  fun openCachedMedia(fileUri: String, mimeType: String, promise: Promise) {
    try {
      val target = cachedMediaFile(fileUri)
      val activity = reactApplicationContext.currentActivity
        ?: throw MediaModuleException("ACTIVITY_UNAVAILABLE", "Невозможно открыть файл без активного экрана.")
      val contentUri = FileProvider.getUriForFile(
        reactApplicationContext,
        "${reactApplicationContext.packageName}.media",
        target,
      )
      val viewIntent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(contentUri, normalizedMimeType(mimeType))
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        clipData = ClipData.newRawUri("attachment", contentUri)
      }

      activity.startActivity(Intent.createChooser(viewIntent, null))
      promise.resolve(null)
    } catch (_: ActivityNotFoundException) {
      promise.reject("MEDIA_VIEWER_UNAVAILABLE", "На устройстве нет приложения для открытия этого файла.")
    } catch (error: MediaModuleException) {
      promise.reject(error.code, error.message)
    } catch (_: Exception) {
      promise.reject("MEDIA_OPEN_FAILED", "Не удалось открыть вложение.")
    }
  }

  @ReactMethod
  fun playCachedVideo(fileUri: String, mimeType: String, promise: Promise) {
    try {
      val videoMimeType = normalizedMimeType(mimeType)
      if (videoMimeType !in VIDEO_MIME_TYPES) {
        throw MediaModuleException("INVALID_VIDEO_FILE", "Файл видео недоступен.")
      }

      val target = cachedMediaFile(fileUri)
      val activity = reactApplicationContext.currentActivity
        ?: throw MediaModuleException("ACTIVITY_UNAVAILABLE", "Невозможно воспроизвести видео без активного экрана.")
      val contentUri = FileProvider.getUriForFile(
        reactApplicationContext,
        "${reactApplicationContext.packageName}.media",
        target,
      )
      val playerIntent = Intent(activity, VideoPlayerActivity::class.java).apply {
        setDataAndType(contentUri, videoMimeType)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        clipData = ClipData.newRawUri("video", contentUri)
      }

      activity.startActivity(playerIntent)
      promise.resolve(null)
    } catch (error: MediaModuleException) {
      promise.reject(error.code, error.message)
    } catch (_: Exception) {
      promise.reject("VIDEO_PLAYBACK_FAILED", "Не удалось воспроизвести видео.")
    }
  }

  @ReactMethod
  fun playCachedVideoNote(fileUri: String, mimeType: String, promise: Promise) {
    try {
      val videoMimeType = normalizedMimeType(mimeType)
      if (videoMimeType !in VIDEO_MIME_TYPES) {
        throw MediaModuleException("INVALID_VIDEO_FILE", "Файл видеосообщения недоступен.")
      }

      val target = cachedMediaFile(fileUri)
      val activity = reactApplicationContext.currentActivity
        ?: throw MediaModuleException("ACTIVITY_UNAVAILABLE", "Невозможно воспроизвести видеосообщение без активного экрана.")
      val contentUri = FileProvider.getUriForFile(
        reactApplicationContext,
        "${reactApplicationContext.packageName}.media",
        target,
      )
      val playerIntent = Intent(activity, VideoNotePlayerActivity::class.java).apply {
        setDataAndType(contentUri, videoMimeType)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        clipData = ClipData.newRawUri("video-note", contentUri)
      }

      activity.startActivity(playerIntent)
      promise.resolve(null)
    } catch (error: MediaModuleException) {
      promise.reject(error.code, error.message)
    } catch (_: Exception) {
      promise.reject("VIDEO_NOTE_PLAYBACK_FAILED", "Не удалось воспроизвести видеосообщение.")
    }
  }

  @ReactMethod
  fun toggleCachedAudioPlayback(fileUri: String, mimeType: String, promise: Promise) {
    var playerForRequest: MediaPlayer? = null
    try {
      val audioMimeType = normalizedMimeType(mimeType)
      if (audioMimeType !in AUDIO_MIME_TYPES) {
        throw MediaModuleException("INVALID_AUDIO_FILE", "Файл голосового сообщения недоступен.")
      }

      val target = cachedMediaFile(fileUri)
      synchronized(audioPlaybackLock) {
        val currentPlayer = audioPlayer
        if (currentPlayer != null && audioPlaybackUri == fileUri) {
          if (!audioPlayerPrepared) {
            promise.reject("AUDIO_PLAYBACK_PREPARING", "Голосовое сообщение ещё готовится к воспроизведению.")
            return
          }
          if (currentPlayer.isPlaying) {
            currentPlayer.pause()
            abandonPlaybackAudioFocus()
          } else {
            if (audioPlaybackEnded) {
              currentPlayer.seekTo(0)
              audioPlaybackEnded = false
            }
            if (!requestPlaybackAudioFocus()) {
              throw MediaModuleException("AUDIO_FOCUS_UNAVAILABLE", "Не удалось начать воспроизведение голосового сообщения.")
            }
            currentPlayer.start()
          }
          promise.resolve(audioPlaybackState(fileUri))
          return
        }

        releaseAudioPlayer()
        val contentUri = FileProvider.getUriForFile(
          reactApplicationContext,
          "${reactApplicationContext.packageName}.media",
          target,
        )
        val player = MediaPlayer()
        playerForRequest = player
        audioPlayer = player
        audioPlaybackUri = fileUri
        audioPlayerPrepared = false
        audioPlaybackEnded = false
        player.setAudioAttributes(audioPlaybackAttributes)
        player.setDataSource(reactApplicationContext, contentUri)
        pendingAudioPlaybackPromise = promise
        pendingAudioPlaybackUri = fileUri
        player.setOnPreparedListener { preparedPlayer ->
          synchronized(audioPlaybackLock) {
            if (audioPlayer !== preparedPlayer || audioPlaybackUri != fileUri) {
              return@setOnPreparedListener
            }
            if (!requestPlaybackAudioFocus()) {
              releaseAudioPlayer(
                "AUDIO_FOCUS_UNAVAILABLE",
                "Не удалось начать воспроизведение голосового сообщения.",
              )
              return@setOnPreparedListener
            }
            audioPlayerPrepared = true
            preparedPlayer.start()
            if (pendingAudioPlaybackUri == fileUri) {
              val pendingPromise = pendingAudioPlaybackPromise
              pendingAudioPlaybackPromise = null
              pendingAudioPlaybackUri = null
              pendingPromise?.resolve(audioPlaybackState(fileUri))
            }
          }
        }
        player.setOnCompletionListener { completedPlayer ->
          synchronized(audioPlaybackLock) {
            if (audioPlayer === completedPlayer) {
              audioPlaybackEnded = true
              abandonPlaybackAudioFocus()
            }
          }
        }
        player.setOnErrorListener { failedPlayer, _, _ ->
          synchronized(audioPlaybackLock) {
            if (audioPlayer === failedPlayer) {
              releaseAudioPlayer(
                "AUDIO_PLAYBACK_FAILED",
                "Не удалось воспроизвести голосовое сообщение.",
              )
            }
          }
          true
        }
        player.prepareAsync()
      }
    } catch (error: MediaModuleException) {
      val releasedRequestPlayer = synchronized(audioPlaybackLock) {
        if (audioPlayer === playerForRequest) {
          releaseAudioPlayer(error.code, error.message)
        } else {
          false
        }
      }
      if (!releasedRequestPlayer) {
        promise.reject(error.code, error.message)
      }
    } catch (_: Exception) {
      val releasedRequestPlayer = synchronized(audioPlaybackLock) {
        if (audioPlayer === playerForRequest) {
          releaseAudioPlayer("AUDIO_PLAYBACK_FAILED", "Не удалось воспроизвести голосовое сообщение.")
        } else {
          false
        }
      }
      if (!releasedRequestPlayer) {
        promise.reject("AUDIO_PLAYBACK_FAILED", "Не удалось воспроизвести голосовое сообщение.")
      }
    }
  }

  @ReactMethod
  fun getCachedAudioPlaybackState(fileUri: String, promise: Promise) {
    synchronized(audioPlaybackLock) {
      promise.resolve(audioPlaybackState(fileUri))
    }
  }

  @ReactMethod
  fun stopCachedAudioPlayback(fileUri: String, promise: Promise) {
    synchronized(audioPlaybackLock) {
      if (audioPlaybackUri == fileUri) {
        releaseAudioPlayer()
      }
    }
    promise.resolve(null)
  }

  @ReactMethod
  fun discardDraft(fileUri: String, promise: Promise) {
    try {
      val uri = Uri.parse(fileUri)
      val path = uri.path ?: throw MediaModuleException("INVALID_DRAFT", "Черновик вложения недоступен.")
      val root = draftsDirectory().canonicalFile
      val target = File(path).canonicalFile
      if (!target.path.startsWith("${root.path}${File.separator}")) {
        throw MediaModuleException("INVALID_DRAFT", "Черновик вложения недоступен.")
      }
      target.delete()
      promise.resolve(null)
    } catch (error: MediaModuleException) {
      promise.reject(error.code, error.message)
    } catch (_: Exception) {
      promise.reject("INVALID_DRAFT", "Черновик вложения недоступен.")
    }
  }

  @ReactMethod
  fun clearPrivateMediaCache(promise: Promise) {
    synchronized(mediaCacheLock) {
      mediaCacheGeneration += 1
    }
    releaseAudioPlayer()
    Thread {
      try {
        synchronized(mediaCacheLock) {
          mediaRoot().deleteRecursively()
        }
        promise.resolve(null)
      } catch (_: Exception) {
        promise.resolve(null)
      }
    }.start()
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode == VIDEO_NOTE_RECORDING_REQUEST_CODE) {
      val pending = pendingVideoNote ?: return
      pendingVideoNote = null
      if (resultCode != Activity.RESULT_OK) {
        pending.target.delete()
        val errorCode = data?.getStringExtra(VideoNoteCameraActivity.EXTRA_ERROR_CODE)
        if (errorCode.isNullOrBlank()) {
          pending.promise.resolve(null)
        } else {
          pending.promise.reject(errorCode, "Не удалось сохранить видеосообщение.")
        }
        return
      }

      Thread {
        try {
          pending.promise.resolve(recordedAttachment(
            pending.target,
            "video-note-${System.currentTimeMillis()}.mp4",
            "video/mp4",
            recordedDurationSeconds(pending.target),
          ))
        } catch (error: MediaModuleException) {
          Log.w(LOG_TAG, "Video note recording failed: ${error.code}.", error)
          pending.target.delete()
          pending.promise.reject(error.code, error.message)
        } catch (error: Exception) {
          Log.e(LOG_TAG, "Video note recording failed unexpectedly.", error)
          pending.target.delete()
          pending.promise.reject("VIDEO_NOTE_RECORDING_FAILED", "Не удалось сохранить видеосообщение.")
        }
      }.start()
      return
    }

    val pending = pendingPicker
    if (
      pending == null ||
      (
        requestCode != PHOTO_PICKER_REQUEST_CODE &&
          requestCode != DOCUMENT_PICKER_REQUEST_CODE &&
          requestCode != VIDEO_PICKER_REQUEST_CODE
      )
    ) {
      return
    }
    pendingPicker = null

    val selectedUri = data?.data
      ?: data?.clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri
    if (resultCode != Activity.RESULT_OK || selectedUri == null) {
      pending.promise.resolve(null)
      return
    }

    Thread {
      try {
        pending.promise.resolve(copySelectedAttachment(selectedUri, pending.attachmentKind))
      } catch (error: MediaModuleException) {
        pending.promise.reject(error.code, error.message)
      } catch (_: Exception) {
        pending.promise.reject("ATTACHMENT_READ_FAILED", "Не удалось прочитать выбранный файл.")
      }
    }.start()
  }

  override fun onNewIntent(intent: Intent) = Unit

  override fun invalidate() {
    reactApplicationContext.removeActivityEventListener(this)
    reactApplicationContext.removeLifecycleEventListener(this)
    pendingPicker?.promise?.reject("PICKER_CANCELLED", "Выбор вложения был отменён.")
    pendingPicker = null
    pendingVideoNote?.let { pending ->
      pending.target.delete()
      pending.promise.reject("VIDEO_NOTE_CANCELLED", "Запись видеосообщения была отменена.")
    }
    pendingVideoNote = null
    cancelVoiceRecordingInternal()
    releaseAudioPlayer()
    super.invalidate()
  }

  override fun onHostResume() = Unit

  override fun onHostPause() {
    cancelVoiceRecordingInternal()
    pauseAudioPlayback()
  }

  override fun onHostDestroy() {
    cancelVoiceRecordingInternal()
    releaseAudioPlayer()
  }

  private fun launchPicker(
    intent: Intent,
    requestCode: Int,
    attachmentKind: AttachmentKind,
    promise: Promise,
  ) {
    if (pendingPicker != null || pendingVideoNote != null) {
      promise.reject("PICKER_IN_PROGRESS", "Выбор вложения уже открыт.")
      return
    }

    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("ACTIVITY_UNAVAILABLE", "Невозможно выбрать вложение без активного экрана.")
      return
    }

    pendingPicker = PendingPicker(promise = promise, attachmentKind = attachmentKind)
    try {
      activity.startActivityForResult(intent, requestCode)
    } catch (_: ActivityNotFoundException) {
      pendingPicker = null
      promise.reject("PICKER_UNAVAILABLE", "Системный выбор файлов недоступен на этом устройстве.")
    } catch (_: Exception) {
      pendingPicker = null
      promise.reject("PICKER_UNAVAILABLE", "Не удалось открыть системный выбор файлов.")
    }
  }

  private fun copySelectedAttachment(source: Uri, attachmentKind: AttachmentKind) = Arguments.createMap().apply {
    val mimeType = resolvedMimeType(source, attachmentKind)
    if (mimeType !in attachmentKind.supportedMimeTypes) {
      throw MediaModuleException("UNSUPPORTED_ATTACHMENT_TYPE", "Этот формат вложения пока не поддерживается.")
    }

    val name = displayName(source)
    val target = File(draftsDirectory(), "${UUID.randomUUID()}${extensionForMime(mimeType)}")
    val sizeBytes = copyUriToDraft(source, target)

    putString("uri", Uri.fromFile(target).toString())
    putString("name", name)
    putString("mimeType", mimeType)
    putDouble("sizeBytes", sizeBytes.toDouble())
  }

  private fun copyUriToDraft(source: Uri, target: File): Long {
    var sizeBytes = 0L
    try {
      reactApplicationContext.contentResolver.openInputStream(source)?.use { input ->
        FileOutputStream(target).use { output ->
          val buffer = ByteArray(BUFFER_SIZE)
          while (true) {
            val read = input.read(buffer)
            if (read < 0) {
              break
            }
            if (read == 0) {
              throw MediaModuleException("ATTACHMENT_READ_FAILED", "Не удалось прочитать выбранный файл.")
            }
            sizeBytes += read
            if (sizeBytes > MAX_ATTACHMENT_BYTES) {
              throw MediaModuleException("ATTACHMENT_TOO_LARGE", "Размер вложения не должен превышать 30 МБ.")
            }
            output.write(buffer, 0, read)
          }
        }
      } ?: throw MediaModuleException("ATTACHMENT_READ_FAILED", "Не удалось прочитать выбранный файл.")

      if (sizeBytes == 0L) {
        throw MediaModuleException("ATTACHMENT_EMPTY", "Нельзя отправить пустой файл.")
      }
      return sizeBytes
    } catch (error: Exception) {
      target.delete()
      throw error
    }
  }

  private fun recordedAttachment(
    target: File,
    name: String,
    mimeType: String,
    durationSeconds: Int,
  ) = Arguments.createMap().apply {
    if (!target.isFile || target.length() <= 0L) {
      throw MediaModuleException("ATTACHMENT_EMPTY", "Нельзя отправить пустое сообщение.")
    }
    if (target.length() > MAX_ATTACHMENT_BYTES) {
      throw MediaModuleException("ATTACHMENT_TOO_LARGE", "Размер вложения не должен превышать 30 МБ.")
    }
    if (durationSeconds <= 0) {
      throw MediaModuleException("INVALID_RECORDING_DURATION", "Не удалось определить длительность сообщения.")
    }

    putString("uri", Uri.fromFile(target).toString())
    putString("name", name)
    putString("mimeType", mimeType)
    putDouble("sizeBytes", target.length().toDouble())
    putString("messageType", if (mimeType.startsWith("audio/")) "voice" else "video_note")
    putInt("durationSeconds", durationSeconds)
  }

  private fun recordedDurationSeconds(target: File): Int {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(target.absolutePath)
      val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
        ?.toLongOrNull()
        ?: throw MediaModuleException("INVALID_RECORDING_DURATION", "Не удалось определить длительность сообщения.")
      if (durationMs <= 0L) {
        throw MediaModuleException("INVALID_RECORDING_DURATION", "Не удалось определить длительность сообщения.")
      }
      return max(1, ((durationMs + MILLIS_PER_SECOND / 2) / MILLIS_PER_SECOND).toInt())
    } finally {
      retriever.release()
    }
  }

  private fun cancelVoiceRecordingInternal() {
    val recorder: MediaRecorder?
    val target: File?
    synchronized(voiceRecordingLock) {
      recorder = voiceRecorder
      target = voiceRecordingFile
      voiceRecorder = null
      voiceRecordingFile = null
      voiceRecordingStartedAtMs = 0L
    }
    try {
      recorder?.reset()
    } catch (_: Exception) {
      // The unfinished draft is discarded below regardless of recorder state.
    } finally {
      recorder?.release()
      target?.delete()
    }
  }

  private fun audioPlaybackState(fileUri: String) = Arguments.createMap().apply {
    val player = audioPlayer
    val isCurrentPlayer = player != null && audioPlaybackUri == fileUri && audioPlayerPrepared
    val durationMs = if (isCurrentPlayer) runCatching { player?.duration ?: 0 }.getOrDefault(0) else 0
    val positionMs = if (isCurrentPlayer && !audioPlaybackEnded) {
      runCatching { player?.currentPosition ?: 0 }.getOrDefault(0)
    } else {
      0
    }
    putBoolean("isPlaying", isCurrentPlayer && !audioPlaybackEnded && (player?.isPlaying == true))
    putDouble("positionSeconds", positionMs.toDouble() / MILLIS_PER_SECOND)
    putDouble("durationSeconds", durationMs.toDouble() / MILLIS_PER_SECOND)
  }

  private fun requestPlaybackAudioFocus(): Boolean =
    audioManager.requestAudioFocus(audioFocusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED

  private fun abandonPlaybackAudioFocus() {
    audioManager.abandonAudioFocusRequest(audioFocusRequest)
  }

  private fun pauseAudioPlayback() {
    synchronized(audioPlaybackLock) {
      if (audioPlayerPrepared && audioPlayer?.isPlaying == true) {
        audioPlayer?.pause()
        abandonPlaybackAudioFocus()
      } else if (audioPlayer != null) {
        releaseAudioPlayer()
      }
    }
  }

  private fun releaseAudioPlayer(
    pendingCode: String = "AUDIO_PLAYBACK_CANCELLED",
    pendingMessage: String = "Воспроизведение голосового сообщения было остановлено.",
  ): Boolean {
    synchronized(audioPlaybackLock) {
      val player = audioPlayer
      val pendingPromise = pendingAudioPlaybackPromise
      audioPlayer = null
      audioPlaybackUri = null
      audioPlayerPrepared = false
      audioPlaybackEnded = false
      pendingAudioPlaybackPromise = null
      pendingAudioPlaybackUri = null
      try {
        player?.release()
      } catch (_: Exception) {
        // A failed player has no reusable state and is discarded.
      }
      abandonPlaybackAudioFocus()
      pendingPromise?.reject(pendingCode, pendingMessage)
      return pendingPromise != null
    }
  }

  private fun handleAudioFocusChange(focusChange: Int) {
    if (pausesVoicePlaybackForAudioFocusChange(focusChange)) {
      pauseAudioPlayback()
    }
  }

  private fun downloadToCache(
    mediaUrl: URL,
    accessToken: String,
    target: File,
    cacheGeneration: Long,
  ) {
    val temporary = File(target.parentFile, "${target.name}.${UUID.randomUUID()}.part")
    val connection = (mediaUrl.openConnection() as HttpsURLConnection).apply {
      instanceFollowRedirects = false
      requestMethod = "GET"
      connectTimeout = NETWORK_TIMEOUT_MS
      readTimeout = NETWORK_TIMEOUT_MS
      setRequestProperty("Accept", "*/*")
      setRequestProperty("Authorization", "Bearer $accessToken")
    }

    try {
      val status = connection.responseCode
      if (status == 401) {
        throw MediaModuleException("MEDIA_UNAUTHORIZED", "Сессия для загрузки вложения истекла.")
      }
      if (status !in 200..299) {
        throw MediaModuleException("MEDIA_DOWNLOAD_FAILED", "Не удалось загрузить вложение.")
      }

      connection.inputStream.use { input ->
        FileOutputStream(temporary).use { output ->
          val buffer = ByteArray(BUFFER_SIZE)
          while (true) {
            val read = input.read(buffer)
            if (read <= 0) {
              break
            }
            output.write(buffer, 0, read)
          }
        }
      }
      synchronized(mediaCacheLock) {
        if (cacheGeneration != mediaCacheGeneration) {
          throw MediaModuleException("MEDIA_CACHE_CLEARED", "Кэш вложений был очищен.")
        }
        if (!temporary.renameTo(target)) {
          throw MediaModuleException("MEDIA_DOWNLOAD_FAILED", "Не удалось сохранить вложение в защищённый кэш.")
        }
      }
    } finally {
      temporary.delete()
      connection.disconnect()
    }
  }

  private fun privateMediaUrl(apiBaseUrl: String, mediaPath: String): URL {
    if (!PRIVATE_MEDIA_PATH.matches(mediaPath)) {
      throw MediaModuleException("INVALID_MEDIA_PATH", "Адрес вложения недействителен.")
    }

    val base = try {
      URI(apiBaseUrl)
    } catch (_: Exception) {
      throw MediaModuleException("INVALID_MEDIA_PATH", "Адрес API недействителен.")
    }
    if (
      base.scheme != "https" ||
      base.host.isNullOrBlank() ||
      base.query != null ||
      base.fragment != null
    ) {
      throw MediaModuleException("INVALID_MEDIA_PATH", "Адрес API недействителен.")
    }

    return URL("${apiBaseUrl.trimEnd('/')}$mediaPath")
  }

  private fun cachedMediaFile(fileUri: String): File {
    val uri = Uri.parse(fileUri)
    if (uri.scheme != "file" || uri.path.isNullOrBlank()) {
      throw MediaModuleException("INVALID_MEDIA_FILE", "Файл вложения недоступен.")
    }

    val root = downloadDirectory().canonicalFile
    val target = File(uri.path!!).canonicalFile
    if (!target.isFile || !target.path.startsWith("${root.path}${File.separator}")) {
      throw MediaModuleException("INVALID_MEDIA_FILE", "Файл вложения недоступен.")
    }
    return target
  }

  private fun displayName(uri: Uri): String {
    val fallback = uri.lastPathSegment
      ?.substringAfterLast('/')
      ?.let(Uri::decode)
      ?.let { File(it).name }
      ?.takeIf { it.isNotBlank() }
      ?.take(MAX_FILENAME_LENGTH)
      ?: "attachment"
    val resolver = reactApplicationContext.contentResolver
    return try {
      resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        val columnIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (columnIndex >= 0 && cursor.moveToFirst()) {
          cursor.getString(columnIndex)
            ?.let { File(it).name }
            ?.takeIf { it.isNotBlank() }
            ?.take(MAX_FILENAME_LENGTH)
        } else {
          null
        }
      } ?: fallback
    } catch (_: Exception) {
      fallback
    }
  }

  private fun normalizedMimeType(value: String?): String = value
    ?.substringBefore(';')
    ?.trim()
    ?.lowercase()
    .orEmpty()
    .ifBlank { "application/octet-stream" }

  private fun resolvedMimeType(source: Uri, attachmentKind: AttachmentKind): String {
    val declaredMimeType = normalizedMimeType(reactApplicationContext.contentResolver.getType(source))
    if (declaredMimeType in attachmentKind.supportedMimeTypes) {
      return declaredMimeType
    }

    val name = displayName(source).lowercase()
    return when {
      attachmentKind == AttachmentKind.PHOTO && (name.endsWith(".jpg") || name.endsWith(".jpeg")) -> "image/jpeg"
      attachmentKind == AttachmentKind.PHOTO && name.endsWith(".png") -> "image/png"
      attachmentKind == AttachmentKind.PHOTO && name.endsWith(".gif") -> "image/gif"
      attachmentKind == AttachmentKind.PHOTO && name.endsWith(".webp") -> "image/webp"
      attachmentKind == AttachmentKind.PHOTO && name.endsWith(".heic") -> "image/heic"
      attachmentKind == AttachmentKind.PHOTO && name.endsWith(".heif") -> "image/heif"
      attachmentKind == AttachmentKind.PHOTO && name.endsWith(".avif") -> "image/avif"
      attachmentKind == AttachmentKind.DOCUMENT && name.endsWith(".pdf") -> "application/pdf"
      attachmentKind == AttachmentKind.DOCUMENT && name.endsWith(".txt") -> "text/plain"
      attachmentKind == AttachmentKind.VIDEO && name.endsWith(".mp4") -> "video/mp4"
      attachmentKind == AttachmentKind.VIDEO && name.endsWith(".webm") -> "video/webm"
      attachmentKind == AttachmentKind.VIDEO && (name.endsWith(".mov") || name.endsWith(".qt")) -> "video/quicktime"
      else -> declaredMimeType
    }
  }

  private fun extensionForMime(mimeType: String): String = EXTENSIONS_BY_MIME_TYPE[normalizedMimeType(mimeType)] ?: ""

  private fun hasMediaLibraryPermission(): Boolean =
    ContextCompat.checkSelfPermission(
      reactApplicationContext,
      Manifest.permission.READ_MEDIA_IMAGES,
    ) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(
        reactApplicationContext,
        Manifest.permission.READ_MEDIA_VIDEO,
      ) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(
        reactApplicationContext,
        Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED,
      ) == PackageManager.PERMISSION_GRANTED

  private fun mediaRoot(): File = File(reactApplicationContext.cacheDir, MEDIA_CACHE_DIRECTORY)

  private fun draftsDirectory(): File = File(mediaRoot(), DRAFTS_DIRECTORY).apply { mkdirs() }

  private fun downloadDirectory(): File = File(mediaRoot(), DOWNLOADS_DIRECTORY).apply { mkdirs() }

  private fun sha256(value: String): String = MessageDigest
    .getInstance("SHA-256")
    .digest(value.toByteArray(Charsets.UTF_8))
    .joinToString("") { byte -> "%02x".format(byte) }

  private enum class AttachmentKind(val supportedMimeTypes: Set<String>) {
    PHOTO(PHOTO_MIME_TYPES),
    DOCUMENT(DOCUMENT_MIME_TYPES),
    VIDEO(VIDEO_MIME_TYPES),
  }

  private data class PendingPicker(val promise: Promise, val attachmentKind: AttachmentKind)

  private data class PendingVideoNote(
    val promise: Promise,
    val target: File,
  )

  private class MediaModuleException(val code: String, override val message: String) : Exception(message)

  companion object {
    const val NAME = "AraChatMedia"
    private const val LOG_TAG = "AraChatMedia"
    private const val PHOTO_PICKER_REQUEST_CODE = 8111
    private const val DOCUMENT_PICKER_REQUEST_CODE = 8112
    private const val VIDEO_PICKER_REQUEST_CODE = 8113
    private const val VIDEO_NOTE_RECORDING_REQUEST_CODE = 8114
    private const val MEDIA_CACHE_DIRECTORY = "arachat-media"
    private const val DRAFTS_DIRECTORY = "drafts"
    private const val DOWNLOADS_DIRECTORY = "downloads"
    private const val MAX_ATTACHMENT_BYTES = 30L * 1024 * 1024
    private const val MAX_MEDIA_LIBRARY_ITEMS = 100
    private const val MAX_FILENAME_LENGTH = 255
    private const val BUFFER_SIZE = 64 * 1024
    private const val NETWORK_TIMEOUT_MS = 30_000
    private const val MILLIS_PER_SECOND = 1_000.0
    private val PRIVATE_MEDIA_PATH = Regex(
      "^/api/media/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
    )
    private val PHOTO_MIME_TYPES = setOf(
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/heic",
      "image/heif",
      "image/avif",
    )
    private val DOCUMENT_MIME_TYPES = setOf(
      "application/pdf",
      "text/plain",
    )
    private val VIDEO_MIME_TYPES = setOf(
      "video/mp4",
      "video/webm",
      "video/quicktime",
    )
    private val AUDIO_MIME_TYPES = setOf(
      "audio/aac",
      "audio/mp4",
      "audio/mpeg",
      "audio/ogg",
      "audio/wav",
      "audio/webm",
    )
    private val EXTENSIONS_BY_MIME_TYPE = mapOf(
      "image/jpeg" to ".jpg",
      "image/png" to ".png",
      "image/gif" to ".gif",
      "image/webp" to ".webp",
      "image/heic" to ".heic",
      "image/heif" to ".heif",
      "image/avif" to ".avif",
      "application/pdf" to ".pdf",
      "text/plain" to ".txt",
      "video/mp4" to ".mp4",
      "video/webm" to ".webm",
      "video/quicktime" to ".mov",
      "audio/aac" to ".aac",
      "audio/mp4" to ".m4a",
      "audio/mpeg" to ".mp3",
      "audio/ogg" to ".ogg",
      "audio/wav" to ".wav",
      "audio/webm" to ".webm",
    )
  }
}
