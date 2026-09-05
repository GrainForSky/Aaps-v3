package app.aaps.plugins.main.general.remotecontrol

import android.content.Context
import android.provider.Settings
import app.aaps.core.interfaces.logging.AAPSLogger
import app.aaps.core.interfaces.logging.LTag
import app.aaps.core.keys.StringKey
import app.aaps.core.keys.interfaces.Preferences
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 与 Web 服务端通信的 HTTP 客户端（设备轮询架构）。
 *
 * - 设备身份：phone（用户手机号）+ deviceId（Android ID）+ deviceToken（注册后下发）
 * - deviceToken 保存到 SharedPreferences（通过 Preferences），后续请求携带做认证
 *
 * 服务端接口（与 Web 项目一致）：
 *   POST /api/device/register   { phone, deviceId, appVersion } -> { deviceToken }
 *   POST /api/device/heartbeat  { phone, deviceId, deviceToken }
 *   GET  /api/device/commands?phone=&deviceId=&deviceToken=      -> { commands: [] }
 *   POST /api/device/result     { commandId, phone, deviceId, deviceToken, success, message }
 */
@Singleton
class RemoteControlApi @Inject constructor(
    private val context: Context,
    private val preferences: Preferences,
    private val aapsLogger: AAPSLogger
) {
    private val jsonMediaType = "application/json".toMediaType()

    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private fun serverUrl(): String =
        preferences.get(StringKey.RemoteControlServerUrl).trimEnd('/')

    private fun phone(): String =
        preferences.get(StringKey.RemoteControlPhone)

    fun isConfigured(): Boolean {
        val url = preferences.get(StringKey.RemoteControlServerUrl)
        val phone = preferences.get(StringKey.RemoteControlPhone)
        return url.isNotBlank() && phone.isNotBlank()
    }

    private fun deviceId(): String {
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: ""
        return "aaps-$androidId"
    }

    private fun cachedToken(): String =
        preferences.get(StringKey.RemoteControlDeviceToken)

    private fun storeToken(token: String) {
        preferences.put(StringKey.RemoteControlDeviceToken, token)
    }

    /**
     * 注册设备。每次启动都重新注册（服务端返回新 token），保证 token 可用。
     * onMessage 用于把过程信息回传给插件做界面展示。
     */
    fun register(onMessage: (String) -> Unit) {
        if (!isConfigured()) {
            onMessage("未配置服务器地址或手机号")
            return
        }
        val payload = JSONObject().apply {
            put("phone", phone())
            put("deviceId", deviceId())
            put("appVersion", APP_VERSION)
        }
        val request = Request.Builder()
            .url("${serverUrl()}/api/device/register")
            .post(payload.toString().toRequestBody(jsonMediaType))
            .build()

        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            val json = JSONObject(body)
            if (json.optBoolean("success")) {
                val token = json.optString("deviceToken")
                if (token.isNotEmpty()) {
                    storeToken(token)
                    onMessage("设备注册成功")
                    aapsLogger.debug(LTag.CORE, "RemoteControl registered, token saved")
                } else {
                    onMessage("注册成功但未返回 deviceToken")
                }
            } else {
                onMessage("注册失败: ${json.optString("message")}")
                aapsLogger.warn(LTag.CORE, "RemoteControl register failed: ${json.optString("message")}")
            }
        }
    }

    /** 心跳：报告设备在线。失败由调用方捕获，静默等待下一轮。 */
    fun heartbeat() {
        if (!isConfigured() || cachedToken().isEmpty()) return
        val payload = JSONObject().apply {
            put("phone", phone())
            put("deviceId", deviceId())
            put("deviceToken", cachedToken())
        }
        val request = Request.Builder()
            .url("${serverUrl()}/api/device/heartbeat")
            .post(payload.toString().toRequestBody(jsonMediaType))
            .build()
        client.newCall(request).execute().close()
    }

    /**
     * 拉取待执行命令。返回服务端命令数组（可能为空）。
     * 命令在服务端被取出后即标记为"已下发"，不会重复返回。
     */
    fun fetchCommands(): List<JSONObject> {
        if (!isConfigured() || cachedToken().isEmpty()) return emptyList()
        val url = "${serverUrl()}/api/device/commands" +
            "?phone=${enc(phone())}" +
            "&deviceId=${enc(deviceId())}" +
            "&deviceToken=${enc(cachedToken())}"
        val request = Request.Builder().url(url).get().build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            val json = JSONObject(body)
            if (!json.optBoolean("success")) return emptyList()
            val array = json.optJSONArray("commands") ?: return emptyList()
            return (0 until array.length()).map { array.getJSONObject(it) }
        }
    }

    /** 上报命令执行结果。 */
    fun reportResult(commandId: String, success: Boolean, message: String) {
        if (!isConfigured() || cachedToken().isEmpty()) return
        val payload = JSONObject().apply {
            put("commandId", commandId)
            put("phone", phone())
            put("deviceId", deviceId())
            put("deviceToken", cachedToken())
            put("success", success)
            put("message", message)
        }
        val request = Request.Builder()
            .url("${serverUrl()}/api/device/result")
            .post(payload.toString().toRequestBody(jsonMediaType))
            .build()
        try {
            client.newCall(request).execute().close()
        } catch (e: Exception) {
            aapsLogger.warn(LTag.CORE, "RemoteControl reportResult failed: ${e.message}")
        }
    }

    private fun enc(s: String): String =
        java.net.URLEncoder.encode(s, "UTF-8")

    companion object {
        private const val APP_VERSION = "3.4-remotecontrol"
    }
}
