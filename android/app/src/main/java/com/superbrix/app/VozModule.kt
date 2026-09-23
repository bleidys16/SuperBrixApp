package com.superbrix.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class VozModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), ActivityEventListener {

  private var speechPromise: Promise? = null
  private val REQUEST_CODE_SPEECH = 1002

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName(): String = "VozModule"

  override fun onActivityResult(
    activity: Activity,
    requestCode: Int,
    resultCode: Int,
    data: Intent?
  ) {
    if (requestCode == REQUEST_CODE_SPEECH) {
      val promise = speechPromise
      speechPromise = null

      if (promise == null) return

      when (resultCode) {
        Activity.RESULT_OK -> {
          val resultados = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
          val texto = resultados?.firstOrNull() ?: ""
          promise.resolve(texto)
        }
        Activity.RESULT_CANCELED -> {
          promise.reject("CANCELADO", "Dictado por voz cancelado por el usuario")
        }
        else -> {
          promise.reject("ERROR", "No se reconoció audio o hubo un error en la captura")
        }
      }
    }
  }

  override fun onNewIntent(intent: Intent) {}

  @ReactMethod
  fun esDisponible(promise: Promise) {
    try {
      val pm = reactApplicationContext.packageManager
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      val actividades = pm.queryIntentActivities(intent, 0)
      promise.resolve(actividades.isNotEmpty())
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun iniciarReconocimiento(prompt: String?, promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("SIN_ACTIVIDAD", "No hay pantalla activa para iniciar el dictado por voz")
      return
    }

    if (speechPromise != null) {
      speechPromise?.reject("CANCELADO", "Se inició una nueva solicitud de voz")
      speechPromise = null
    }

    speechPromise = promise

    try {
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(
          RecognizerIntent.EXTRA_LANGUAGE_MODEL,
          RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
        )
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-CO")
        putExtra(RecognizerIntent.EXTRA_PROMPT, prompt ?: "Di el número de la orden de producción")
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
      }
      activity.startActivityForResult(intent, REQUEST_CODE_SPEECH)
    } catch (e: ActivityNotFoundException) {
      speechPromise = null
      promise.reject("NO_DISPONIBLE", "El servicio de reconocimiento de voz de Google no está disponible en este dispositivo")
    } catch (e: Exception) {
      speechPromise = null
      promise.reject("ERROR", e.message ?: "Error al iniciar el dictado por voz")
    }
  }
}
