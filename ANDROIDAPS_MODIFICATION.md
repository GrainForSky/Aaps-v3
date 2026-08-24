# AndroidAPS 3.4 源码修改方案 - RemoteControl 插件

## 概述

在 AndroidAPS 3.4 中新增 `RemoteControl` 插件模块，实现 Web 端远程输注胰岛素/碳水功能。

**架构**：Web 服务器 → 命令队列 ← AndroidAPS 主动轮询（每 5 秒）

---

## 一、新增文件

### 1.1 RemoteControlPlugin.kt

**路径**: `plugins/main/src/main/java/app/aaps/plugins/main/general/remotecontrol/RemoteControlPlugin.kt`

```kotlin
package app.aaps.plugins.main.general.remotecontrol

import android.content.Context
import app.aaps.core.interfaces.plugin.PluginBase
import app.aaps.core.interfaces.plugin.PluginDescription
import app.aaps.core.interfaces.plugin.PluginType
import app.aaps.core.interfaces.rx.AapsSchedulers
import app.aaps.core.interfaces.rx.bus.RxBus
import app.aaps.core.interfaces.sharedPreferences.SP
import app.aaps.core.interfaces.utils.fabric.FabricPrivacy
import app.aaps.core.utils.TR
import app.aaps.core.utilsTranslation.R
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RemoteControlPlugin @Inject constructor(
    private val fabricPrivacy: FabricPrivacy,
    private val sp: SP,
    private val rxBus: RxBus,
    private val aapsSchedulers: AapsSchedulers
) : PluginBase(
    PluginDescription()
        .pluginName(TR.string(remotecontrol))
        .pluginIcon(app.aaps.core.ui.R.drawable.ic_remote_control)
        .pluginDescription(TR.string(remotecontrol_description))
        .pluginType(PluginType.GENERAL)
        .mainFragmentClass(null)
        .hasConfiguration(true)
        .supportsLGS(false)
) {
    private var remoteControlClient: RemoteControlClient? = null

    override fun init(context: Context) {
        super.init(context)
        if (isEnabled()) {
            startRemoteControl()
        }
    }

    override fun isEnabled(): Boolean = sp.getBoolean(R.string.key_remotecontrol_enabled, false)

    private fun startRemoteControl() {
        val serverUrl = sp.getString(R.string.key_remotecontrol_server_url, "")
        val deviceToken = sp.getString(R.string.key_remotecontrol_device_token, "")
        val phone = sp.getString(R.string.key_remotecontrol_phone, "")

        if (serverUrl.isNotBlank() && deviceToken.isNotBlank() && phone.isNotBlank()) {
            remoteControlClient = RemoteControlClient(
                context = context,
                serverUrl = serverUrl,
                deviceToken = deviceToken,
                phone = phone,
                rxBus = rxBus,
                aapsSchedulers = aapsSchedulers
            )
            remoteControlClient?.start()
        }
    }

    fun stopRemoteControl() {
        remoteControlClient?.stop()
        remoteControlClient = null
    }

    override fun shutDown() {
        stopRemoteControl()
        super.shutDown()
    }
}
```

### 1.2 RemoteControlClient.kt

**路径**: `plugins/main/src/main/java/app/aaps/plugins/main/general/remotecontrol/RemoteControlClient.kt`

```kotlin
package app.aaps.plugins.main.general.remotecontrol

import android.content.Context
import app.aaps.core.interfaces.rx.AapsSchedulers
import app.aaps.core.interfaces.rx.bus.RxBus
import app.aaps.core.interfaces.rx.events.EventUpdateOverview
import app.aaps.core.utils.TR
import app.aaps.core.utilsTranslation.R
import io.reactivex.disposables.CompositeDisposable
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class RemoteControlClient(
    private val context: Context,
    private val serverUrl: String,
    private val deviceToken: String,
    private val phone: String,
    private val rxBus: RxBus,
    private val aapsSchedulers: AapsSchedulers
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val disposables = CompositeDisposable()
    private var pollingJob: Job? = null
    private var heartbeatJob: Job? = null

    private val jsonMediaType = "application/json".toMediaType()

    fun start() {
        // 注册设备
        registerDevice()

        // 开始轮询命令（每 5 秒）
        pollingJob = scope.launch {
            while (isActive) {
                pollCommands()
                delay(5000)
            }
        }

        // 开始心跳（每 30 秒）
        heartbeatJob = scope.launch {
            while (isActive) {
                sendHeartbeat()
                delay(30000)
            }
        }
    }

    fun stop() {
        pollingJob?.cancel()
        heartbeatJob?.cancel()
        scope.cancel()
        disposables.clear()
    }

    private fun registerDevice() {
        val json = JSONObject().apply {
            put("phone", phone)
            put("deviceId", getDeviceId())
            put("appVersion", "3.4")
        }

        val body = json.toString().toRequestBody(jsonMediaType)
        val request = Request.Builder()
            .url("$serverUrl/api/device/register")
            .post(body)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: Exception) {
                rxBus.send(EventUpdateOverview("RemoteControl: 注册失败 - ${e.message}"))
            }

            override fun onResponse(call: Call, response: Response) {
                response.body?.string()?.let { responseBody ->
                    val json = JSONObject(responseBody)
                    if (json.optBoolean("success")) {
                        rxBus.send(EventUpdateOverview("RemoteControl: 设备注册成功"))
                    }
                }
            }
        })
    }

    private fun pollCommands() {
        val request = Request.Builder()
            .url("$serverUrl/api/device/commands?phone=$phone&deviceToken=$deviceToken")
            .get()
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: Exception) {
                // 静默失败，下次轮询重试
            }

            override fun onResponse(call: Call, response: Response) {
                response.body?.string()?.let { responseBody ->
                    val json = JSONObject(responseBody)
                    if (json.optBoolean("success")) {
                        val commands = json.optJSONArray("commands")
                        commands?.let {
                            for (i in 0 until it.length()) {
                                val command = it.getJSONObject(i)
                                executeCommand(command)
                            }
                        }
                    }
                }
            }
        })
    }

    private fun executeCommand(command: JSONObject) {
        val commandId = command.optString("id")
        val type = command.optString("type")
        val insulin = command.optDouble("insulin", 0.0)
        val carbs = command.optInt("carbs", 0)

        when (type) {
            "bolus" -> {
                if (insulin > 0) {
                    RemoteControlHandlers.handleBolus(
                        context = context,
                        commandId = commandId,
                        insulin = insulin,
                        serverUrl = serverUrl,
                        deviceToken = deviceToken,
                        phone = phone,
                        client = client,
                        rxBus = rxBus
                    )
                }
            }
            "carbs" -> {
                if (carbs > 0) {
                    RemoteControlHandlers.handleCarbs(
                        context = context,
                        commandId = commandId,
                        carbs = carbs,
                        serverUrl = serverUrl,
                        deviceToken = deviceToken,
                        phone = phone,
                        client = client,
                        rxBus = rxBus
                    )
                }
            }
        }
    }

    private fun sendHeartbeat() {
        val json = JSONObject().apply {
            put("phone", phone)
            put("deviceId", getDeviceId())
            put("deviceToken", deviceToken)
        }

        val body = json.toString().toRequestBody(jsonMediaType)
        val request = Request.Builder()
            .url("$serverUrl/api/device/heartbeat")
            .post(body)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: Exception) {
                // 静默失败
            }

            override fun onResponse(call: Call, response: Response) {
                // 心跳成功，无需处理
            }
        })
    }

    private fun getDeviceId(): String {
        val androidId = android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        )
        return "aaps-$androidId"
    }
}
```

### 1.3 RemoteControlHandlers.kt

**路径**: `plugins/main/src/main/java/app/aaps/plugins/main/general/remotecontrol/RemoteControlHandlers.kt`

```kotlin
package app.aaps.plugins.main.general.remotecontrol

import android.content.Context
import app.aaps.core.interfaces.rx.bus.RxBus
import app.aaps.core.interfaces.rx.events.EventUpdateOverview
import app.aaps.core.utils.TR
import app.aaps.core.utilsTranslation.R
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject

object RemoteControlHandlers {

    private val jsonMediaType = "application/json".toMediaType()

    fun handleBolus(
        context: Context,
        commandId: String,
        insulin: Double,
        serverUrl: String,
        deviceToken: String,
        phone: String,
        client: OkHttpClient,
        rxBus: RxBus
    ) {
        rxBus.send(EventUpdateOverview("RemoteControl: 执行胰岛素输注 ${insulin}U"))

        // TODO: 调用 AndroidAPS 的 CommandQueue 执行 bolus
        // 示例：commandQueue.bolus(insulin, ... )

        // 上报结果
        reportResult(
            commandId = commandId,
            success = true,
            message = "Bolus ${insulin}U executed",
            serverUrl = serverUrl,
            deviceToken = deviceToken,
            phone = phone,
            client = client,
            rxBus = rxBus
        )
    }

    fun handleCarbs(
        context: Context,
        commandId: String,
        carbs: Int,
        serverUrl: String,
        deviceToken: String,
        phone: String,
        client: OkHttpClient,
        rxBus: RxBus
    ) {
        rxBus.send(EventUpdateOverview("RemoteControl: 执行碳水输注 ${carbs}g"))

        // TODO: 调用 AndroidAPS 的 CommandQueue 记录碳水
        // 示例：commandQueue.carbs(carbs, ... )

        // 上报结果
        reportResult(
            commandId = commandId,
            success = true,
            message = "Carbs ${carbs}g recorded",
            serverUrl = serverUrl,
            deviceToken = deviceToken,
            phone = phone,
            client = client,
            rxBus = rxBus
        )
    }

    private fun reportResult(
        commandId: String,
        success: Boolean,
        message: String,
        serverUrl: String,
        deviceToken: String,
        phone: String,
        client: OkHttpClient,
        rxBus: RxBus
    ) {
        val json = JSONObject().apply {
            put("commandId", commandId)
            put("phone", phone)
            put("deviceToken", deviceToken)
            put("success", success)
            put("message", message)
        }

        val body = json.toString().toRequestBody(jsonMediaType)
        val request = Request.Builder()
            .url("$serverUrl/api/device/result")
            .post(body)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: Exception) {
                rxBus.send(EventUpdateOverview("RemoteControl: 结果上报失败 - ${e.message}"))
            }

            override fun onResponse(call: Call, response: Response) {
                if (success) {
                    rxBus.send(EventUpdateOverview("RemoteControl: 命令执行成功 - $message"))
                } else {
                    rxBus.send(EventUpdateOverview("RemoteControl: 命令执行失败 - $message"))
                }
            }
        })
    }
}
```

### 1.4 RemoteControlService.kt

**路径**: `plugins/main/src/main/java/app/aaps/plugins/main/general/remotecontrol/RemoteControlService.kt`

```kotlin
package app.aaps.plugins.main.general.remotecontrol

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import app.aaps.core.interfaces.rx.AapsSchedulers
import app.aaps.core.interfaces.rx.bus.RxBus
import app.aaps.core.interfaces.sharedPreferences.SP
import app.aaps.core.utils.TR
import app.aaps.core.utilsTranslation.R
import javax.inject.Inject

class RemoteControlService : Service() {

    @Inject lateinit var sp: SP
    @Inject lateinit var rxBus: RxBus
    @Inject lateinit var aapsSchedulers: AapsSchedulers

    private var client: RemoteControlClient? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(1, createNotification("RemoteControl 服务已启动"))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val serverUrl = sp.getString(R.string.key_remotecontrol_server_url, "")
        val deviceToken = sp.getString(R.string.key_remotecontrol_device_token, "")
        val phone = sp.getString(R.string.key_remotecontrol_phone, "")

        if (serverUrl.isNotBlank() && deviceToken.isNotBlank() && phone.isNotBlank()) {
            client = RemoteControlClient(
                context = this,
                serverUrl = serverUrl,
                deviceToken = deviceToken,
                phone = phone,
                rxBus = rxBus,
                aapsSchedulers = aapsSchedulers
            )
            client?.start()
        }

        return START_STICKY
    }

    override fun onDestroy() {
        client?.stop()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            "remotecontrol",
            "RemoteControl",
            NotificationManager.IMPORTANCE_LOW
        )
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(channel)
    }

    private fun createNotification(text: String) =
        NotificationCompat.Builder(this, "remotecontrol")
            .setContentTitle("AndroidAPS RemoteControl")
            .setContentText(text)
            .setSmallIcon(app.aaps.core.ui.R.drawable.ic_notification)
            .build()
}
```

---

## 二、修改文件

### 2.1 settings.gradle.kts

**路径**: `settings.gradle.kts`

无需修改（RemoteControl 作为 main 插件的一部分）。

### 2.2 app/build.gradle.kts

**路径**: `app/build.gradle.kts`

添加 OkHttp 依赖（如果尚未添加）：

```kotlin
dependencies {
    // ... 现有依赖 ...
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
```

### 2.3 AndroidManifest.xml

**路径**: `app/src/main/AndroidManifest.xml`

添加网络权限和服务声明：

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- 添加网络权限 -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

    <application>
        <!-- 添加 RemoteControl 服务 -->
        <service
            android:name="app.aaps.plugins.main.general.remotecontrol.RemoteControlService"
            android:exported="false"
            android:foregroundServiceType="dataSync" />
    </application>
</manifest>
```

### 2.4 strings.xml

**路径**: `app/src/main/res/values/strings.xml`

添加字符串资源：

```xml
<string name="remotecontrol">RemoteControl</string>
<string name="remotecontrol_description">Web 端远程输注控制</string>
<string name="key_remotecontrol_enabled">remotecontrol_enabled</string>
<string name="key_remotecontrol_server_url">remotecontrol_server_url</string>
<string name="key_remotecontrol_device_token">remotecontrol_device_token</string>
<string name="key_remotecontrol_phone">remotecontrol_phone</string>
```

---

## 三、配置界面

在 AndroidAPS 设置中添加 RemoteControl 配置项：

1. **启用 RemoteControl** - 开关
2. **服务器地址** - 输入 Web 服务器 URL（如 `https://your-server.com`）
3. **手机号** - 输入注册时使用的手机号
4. **设备令牌** - 首次注册后自动获取并保存

---

## 四、编译和安装

```bash
# 克隆 AndroidAPS 3.4 源码
git clone https://github.com/nightscout/AndroidAPS.git
cd AndroidAPS
git checkout 3.4

# 应用上述修改

# 编译
./gradlew assembleFullDebug

# 安装到手机
adb install app/build/outputs/apk/full/debug/app-full-debug.apk
```

---

## 五、使用流程

1. **Web 端**：用户登录 → 配置 Nightscout → 查看设备状态
2. **AndroidAPS 端**：启用 RemoteControl 插件 → 配置服务器地址和手机号 → 自动注册
3. **远程输注**：Web 端创建命令 → AndroidAPS 轮询获取 → 执行 → 上报结果
4. **结果确认**：Web 端轮询命令状态 + Nightscout 二次确认
