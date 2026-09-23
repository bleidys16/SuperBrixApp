package com.superbrix.app

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Módulo nativo mínimo, propio, sin ninguna librería de terceros: expone el
 * acelerómetro real de Android directo a JS. Se escribió a mano porque la
 * librería de terceros que existe para esto (react-native-sensors) está
 * abandonada — su build.gradle usa jcenter() (repositorio cerrado hace años)
 * y solo compila para armeabi-v7a/x86, sin arm64-v8a (el de la mayoría de
 * celulares reales, incluido el usado en la demo). Al compilar esto como
 * parte de la propia app en vez de como librería aparte, no hereda ninguno
 * de esos dos problemas.
 */
class AcelerometroModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), SensorEventListener {

  private val sensorManager =
    reactContext.getSystemService(Context.SENSOR_SERVICE) as SensorManager
  private val acelerometro: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

  override fun getName() = "AcelerometroModule"

  @ReactMethod
  fun iniciar() {
    acelerometro?.let {
      // SENSOR_DELAY_GAME (~20 ms) da suficiente resolución para detectar
      // vibración sin gastar batería de más ni saturar el puente de JS.
      sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
    }
  }

  @ReactMethod
  fun detener() {
    sensorManager.unregisterListener(this)
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Requerido por NativeEventEmitter en el lado de JS; no hace falta lógica
    // propia porque el registro real ocurre en iniciar()/detener().
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Idem — requerido por el contrato de NativeEventEmitter.
  }

  override fun onSensorChanged(event: SensorEvent) {
    val mapa = Arguments.createMap()
    mapa.putDouble("x", event.values[0].toDouble())
    mapa.putDouble("y", event.values[1].toDouble())
    mapa.putDouble("z", event.values[2].toDouble())
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("AcelerometroLectura", mapa)
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
}
