# AndroidAPS 3.4 远程输注源码修改方案

## 架构概述

```
Web 用户 → POST /api/command/create → 命令存入队列
AndroidAPS 设备 → GET /api/device/commands?phone=xxx → 获取待执行命令
AndroidAPS 设备 → 执行命令 → POST /api/device/result → 上报结果
Web 用户 → GET /api/command/status?id=xxx → 查询命令状态
```

## 修改文件清单

### 1. 新增文件

```
app/src/main/java/app/aaps/plugins/general/remotecontrol/
├── RemoteControlPlugin.kt          # 插件主类
├── RemoteControlClient.kt          # HTTP 客户端
├── RemoteControlHandlers.kt        # 命令处理器
├── RemoteControlService.kt         # 后台服务
── data/
    ├── Command.kt                  # 命令数据类
    └── DeviceConfig.kt             # 设备配置
```

### 2. 修改文件

```
settings.gradle.kts                 # 添加插件模块
app/build.gradle.kts                # 添加依赖
AndroidManifest.xml                 # 添加服务声明
app/src/main/java/app/aaps/core/interfaces/plugin/PluginBase.kt  # 如需扩展接口
```

---

## 第一步：创建 RemoteControlPlugin.kt

**文件路径**: `app/src/main/java/app/aaps/plugins/general/remotecontrol/RemoteControlPlugin.kt`

```kotlin
package app.aaps.plugins.general.remotecontrol

import android.content.Context
import app.aaps.core.interfaces.plugin.PluginBase
import app.aaps.core.interfaces.plugin.PluginDescription
import app.aaps.core.interfaces.plugin.PluginType
import app.aaps.core.interfaces.logging.AAPSLogger
import app.aaps.core.interfaces.logging.LTag
import app.aaps.core.interfaces.queue.CommandQueue
import app.aaps.core.interfaces.utils.fabric.FabricPrivacy
import dagger.android.HasAndroidInjector
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RemoteControlPlugin @Inject constructor(
    androidInjector: HasAndroidInjector,
    aapsLogger: AAPSLogger,
    fabricPrivacy: FabricPrivacy,
    private val commandQueue: CommandQueue,
    private val context: Context
) : PluginBase(
    androidInjector,
    PluginDescription()
        .pluginName("Remote Control")
        .pluginDescription("Remote control insulin delivery via web interface")
        .pluginType(PluginType.GENERAL)
        .mainClass(RemoteControlPlugin::class.java.name),
    aapsLogger,
    fabricPrivacy
) {
    private var client: RemoteControlClient? = null
    private var service: RemoteControlService? = null

    override fun init() {
        super.init()
        aapsLogger.debug(LTag.REMOTECONTROL, "RemoteControlPlugin initialized")
        
        // 加载配置
        val config = DeviceConfig.load(context)
        if (config.enabled && config.serverUrl.isNotEmpty()) {
            startPolling(config)
        }
    }

    fun startPolling(config: DeviceConfig) {
        client = RemoteControlClient(
            serverUrl = config.serverUrl,
            phone = config.phone,
            deviceId = config.deviceId,
            deviceToken = config.deviceToken,
            aapsLogger = aapsLogger
        )
        
        service = RemoteControlService(
            client = client!!,
            commandQueue = commandQueue,
            aapsLogger = aapsLogger,
            context = context
        )
        
        service?.startPolling(intervalMs = 5000) // 每 5 秒轮询
        aapsLogger.info(LTag.REMOTECONTROL, "Remote control polling started")
    }

    fun stopPolling() {
        service?.stopPolling()
        aapsLogger.info(LTag.REMOTECONTROL, "Remote control polling stopped")
    }

    override fun getName(): String = "Remote Control"
    override fun shortName(): String = "RC"
}
```

---

## 第二步：创建数据类

**文件路径**: `app/src/main/java/app/aaps/plugins/general/remotecontrol/data/Command.kt`

```kotlin
package app.aaps.plugins.general.remotecontrol.data

import com.google.gson.annotations.SerializedName

data class Command(
    @SerializedName("id")
    val id: String,
    
    @SerializedName("phone")
    val phone: String,
    
    @SerializedName("type")
    val type: String, // "bolus" or "carbs"
    
    @SerializedName("insulin")
    val insulin: Double? = null,
    
    @SerializedName("carbs")
    val carbs: Double? = null,
    
    @SerializedName("status")
    val status: String = "pending", // pending, executing, completed, failed, expired
    
    @SerializedName("createdAt")
    val createdAt: Long,
    
    @SerializedName("expiresAt")
    val expiresAt: Long
)

data class CommandResponse(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("commands")
    val commands: List<Command>? = null,
    
    @SerializedName("message")
    val message: String? = null
)

data class ResultRequest(
    @SerializedName("commandId")
    val commandId: String,
    
    @SerializedName("phone")
    val phone: String,
    
    @SerializedName("deviceId")
    val deviceId: String,
    
    @SerializedName("deviceToken")
    val deviceToken: String,
    
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("message")
    val message: String
)
```

**文件路径**: `app/src/main/java/app/aaps/plugins/general/remotecontrol/data/DeviceConfig.kt`

```kotlin
package app.aaps.plugins.general.remotecontrol.data

import android.content.Context
import android.content.SharedPreferences
import com.google.gson.Gson

data class DeviceConfig(
    val enabled: Boolean = false,
    val serverUrl: String = "",
    val phone: String = "",
    val deviceId: String = "",
    val deviceToken: String = ""
) {
    companion object {
        private const val PREFS_NAME = "remote_control_prefs"
        private const val KEY_ENABLED = "enabled"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_PHONE = "phone"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_DEVICE_TOKEN = "device_token"

        fun load(context: Context): DeviceConfig {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            return DeviceConfig(
                enabled = prefs.getBoolean(KEY_ENABLED, false),
                serverUrl = prefs.getString(KEY_SERVER_URL, "") ?: "",
                phone = prefs.getString(KEY_PHONE, "") ?: "",
                deviceId = prefs.getString(KEY_DEVICE_ID, generateDeviceId()) ?: generateDeviceId(),
                deviceToken = prefs.getString(KEY_DEVICE_TOKEN, "") ?: ""
            )
        }

        fun save(context: Context, config: DeviceConfig) {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putBoolean(KEY_ENABLED, config.enabled)
                .putString(KEY_SERVER_URL, config.serverUrl)
                .putString(KEY_PHONE, config.phone)
                .putString(KEY_DEVICE_ID, config.deviceId)
                .putString(KEY_DEVICE_TOKEN, config.deviceToken)
                .apply()
        }

        private fun generateDeviceId(): String {
            return "aaps-${java.util.UUID.randomUUID().toString().substring(0, 8)}"
        }
    }
}
```

---

## 第三步：创建 HTTP 客户端

**文件路径**: `app/src/main/java/app/aaps/plugins/general/remotecontrol/RemoteControlClient.kt`

```kotlin
package app.aaps.plugins.general.remotecontrol

import app.aaps.core.interfaces.logging.AAPSLogger
import app.aaps.core.interfaces.logging.LTag
import app.aaps.plugins.general.remotecontrol.data.Command
import app.aaps.plugins.general.remotecontrol.data.CommandResponse
import app.aaps.plugins.general.remotecontrol.data.ResultRequest
import com.google.gson.Gson
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class RemoteControlClient(
    private val serverUrl: String,
    private val phone: String,
    private val deviceId: String,
    private val deviceToken: String,
    private val aapsLogger: AAPSLogger
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
    
    private val gson = Gson()
    private val JSON = "application/json; charset=utf-8".toMediaType()

    fun getPendingCommands(): List<Command>? {
        val url = "$serverUrl/api/device/commands?phone=$phone&deviceId=$deviceId&deviceToken=$deviceToken"
        
        val request = Request.Builder()
            .url(url)
            .get()
            .build()

        return try {
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                val body = response.body?.string()
                aapsLogger.debug(LTag.REMOTECONTROL, "Commands response: $body")
                val commandResponse = gson.fromJson(body, CommandResponse::class.java)
                if (commandResponse.success) {
                    commandResponse.commands
                } else {
                    aapsLogger.error(LTag.REMOTECONTROL, "Failed to get commands: ${commandResponse.message}")
                    null
                }
            } else {
                aapsLogger.error(LTag.REMOTECONTROL, "HTTP error: ${response.code}")
                null
            }
        } catch (e: IOException) {
            aapsLogger.error(LTag.REMOTECONTROL, "Network error: ${e.message}")
            null
        }
    }

    fun reportResult(commandId: String, success: Boolean, message: String): Boolean {
        val url = "$serverUrl/api/device/result"
        
        val resultRequest = ResultRequest(
            commandId = commandId,
            phone = phone,
            deviceId = deviceId,
            deviceToken = deviceToken,
            success = success,
            message = message
        )

        val json = gson.toJson(resultRequest)
        val body = json.toRequestBody(JSON)

        val request = Request.Builder()
            .url(url)
            .post(body)
            .build()

        return try {
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                aapsLogger.info(LTag.REMOTECONTROL, "Result reported for command $commandId")
                true
            } else {
                aapsLogger.error(LTag.REMOTECONTROL, "Failed to report result: ${response.code}")
                false
            }
        } catch (e: IOException) {
            aapsLogger.error(LTag.REMOTECONTROL, "Network error reporting result: ${e.message}")
            false
        }
    }

    fun sendHeartbeat(): Boolean {
        val url = "$serverUrl/api/device/heartbeat"
        
        val heartbeatData = mapOf(
            "phone" to phone,
            "deviceId" to deviceId,
            "deviceToken" to deviceToken
        )

        val json = gson.toJson(heartbeatData)
        val body = json.toRequestBody(JSON)

        val request = Request.Builder()
            .url(url)
            .post(body)
            .build()

        return try {
            val response = client.newCall(request).execute()
            response.isSuccessful
        } catch (e: IOException) {
            aapsLogger.error(LTag.REMOTECONTROL, "Heartbeat failed: ${e.message}")
            false
        }
    }
}
```

---

## 第四步：创建命令处理器

**文件路径**: `app/src/main/java/app/aaps/plugins/general/remotecontrol/RemoteControlHandlers.kt`

```kotlin
package app.aaps.plugins.general.remotecontrol

import app.aaps.core.interfaces.logging.AAPSLogger
import app.aaps.core.interfaces.logging.LTag
import app.aaps.core.interfaces.queue.CommandQueue
import app.aaps.core.interfaces.utils.fabric.FabricPrivacy
import app.aaps.plugins.general.remotecontrol.data.Command
import org.json.JSONObject
import java.util.Date

class RemoteControlHandlers(
    private val commandQueue: CommandQueue,
    private val aapsLogger: AAPSLogger,
    private val fabricPrivacy: FabricPrivacy
) {
    fun executeCommand(command: Command): CommandResult {
        return when (command.type.lowercase()) {
            "bolus" -> executeBolus(command)
            "carbs" -> executeCarbs(command)
            else -> CommandResult(false, "Unknown command type: ${command.type}")
        }
    }

    private fun executeBolus(command: Command): CommandResult {
        val insulin = command.insulin
        if (insulin == null || insulin <= 0) {
            return CommandResult(false, "Invalid insulin dose")
        }

        // 安全限制：最大 25U
        if (insulin > 25) {
            return CommandResult(false, "Insulin dose exceeds maximum (25U)")
        }

        aapsLogger.info(LTag.REMOTECONTROL, "Executing bolus: ${insulin}U")

        return try {
            // 调用 AndroidAPS 的 CommandQueue 执行 bolus
            commandQueue.bolus(
                insulin,
                0, // carbs
                0, // carbs time
                false, // isTemp
                0, // duration
                null, // profile
                true, // enforcement
                null, // callback
                Date(), // date
                fabricPrivacy
            )
            CommandResult(true, "Bolus ${insulin}U executed successfully")
        } catch (e: Exception) {
            aapsLogger.error(LTag.REMOTECONTROL, "Bolus execution failed: ${e.message}")
            CommandResult(false, "Bolus execution failed: ${e.message}")
        }
    }

    private fun executeCarbs(command: Command): CommandResult {
        val carbs = command.carbs
        if (carbs == null || carbs <= 0) {
            return CommandResult(false, "Invalid carbs amount")
        }

        // 安全限制：最大 150g
        if (carbs > 150) {
            return CommandResult(false, "Carbs amount exceeds maximum (150g)")
        }

        aapsLogger.info(LTag.REMOTECONTROL, "Executing carbs: ${carbs}g")

        return try {
            // 调用 AndroidAPS 的 CommandQueue 记录碳水
            commandQueue.bolus(
                0, // insulin
                carbs, // carbs
                0, // carbs time
                false, // isTemp
                0, // duration
                null, // profile
                true, // enforcement
                null, // callback
                Date(), // date
                fabricPrivacy
            )
            CommandResult(true, "Carbs ${carbs}g recorded successfully")
        } catch (e: Exception) {
            aapsLogger.error(LTag.REMOTECONTROL, "Carbs execution failed: ${e.message}")
            CommandResult(false, "Carbs execution failed: ${e.message}")
        }
    }
}

data class CommandResult(
    val success: Boolean,
    val message: String
)
```

---

## 第五步：创建后台服务

**文件路径**: `app/src/main/java/app/aaps/plugins/general/remotecontrol/RemoteControlService.kt`

```kotlin
package app.aaps.plugins.general.remotecontrol

import android.content.Context
import android.os.Handler
import android.os.Looper
import app.aaps.core.interfaces.logging.AAPSLogger
import app.aaps.core.interfaces.logging.LTag
import app.aaps.core.interfaces.queue.CommandQueue
import app.aaps.core.interfaces.utils.fabric.FabricPrivacy
import app.aaps.plugins.general.remotecontrol.data.Command
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class RemoteControlService(
    private val client: RemoteControlClient,
    private val commandQueue: CommandQueue,
    private val aapsLogger: AAPSLogger,
    private val context: Context
) {
    private val executor: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private val handlers = RemoteControlHandlers(commandQueue, aapsLogger, FabricPrivacy(null))
    private var isPolling = false

    fun startPolling(intervalMs: Long = 5000) {
        if (isPolling) {
            aapsLogger.warn(LTag.REMOTECONTROL, "Polling already started")
            return
        }

        isPolling = true
        aapsLogger.info(LTag.REMOTECONTROL, "Starting polling every ${intervalMs}ms")

        // 立即执行一次
        pollCommands()

        // 定时轮询
        executor.scheduleAtFixedRate({
            try {
                pollCommands()
                sendHeartbeat()
            } catch (e: Exception) {
                aapsLogger.error(LTag.REMOTECONTROL, "Polling error: ${e.message}")
            }
        }, intervalMs, intervalMs, TimeUnit.MILLISECONDS)
    }

    fun stopPolling() {
        isPolling = false
        executor.shutdown()
        aapsLogger.info(LTag.REMOTECONTROL, "Polling stopped")
    }

    private fun pollCommands() {
        val commands = client.getPendingCommands()
        if (commands.isNullOrEmpty()) {
            aapsLogger.debug(LTag.REMOTECONTROL, "No pending commands")
            return
        }

        aapsLogger.info(LTag.REMOTECONTROL, "Received ${commands.size} pending commands")

        for (command in commands) {
            executeAndReport(command)
        }
    }

    private fun executeAndReport(command: Command) {
        aapsLogger.info(LTag.REMOTECONTROL, "Executing command: ${command.id} (${command.type})")

        val result = handlers.executeCommand(command)
        
        val reported = client.reportResult(
            commandId = command.id,
            success = result.success,
            message = result.message
        )

        if (reported) {
            aapsLogger.info(LTag.REMOTECONTROL, "Result reported for command ${command.id}")
        } else {
            aapsLogger.error(LTag.REMOTECONTROL, "Failed to report result for command ${command.id}")
        }
    }

    private fun sendHeartbeat() {
        val success = client.sendHeartbeat()
        if (success) {
            aapsLogger.debug(LTag.REMOTECONTROL, "Heartbeat sent")
        } else {
            aapsLogger.warn(LTag.REMOTECONTROL, "Heartbeat failed")
        }
    }
}
```

---

## 第六步：修改 settings.gradle.kts

**文件路径**: `settings.gradle.kts`

在 `include` 语句中添加（如果需要单独模块）：

```kotlin
// 如果 RemoteControl 作为独立模块
include(":remotecontrol")
project(":remotecontrol").projectDir = file("app/src/main/java/app/aaps/plugins/general/remotecontrol")
```

**注意**: 如果直接放在 app 模块内，则不需要修改 settings.gradle.kts

---

## 第七步：修改 app/build.gradle.kts

**文件路径**: `app/build.gradle.kts`

添加 OkHttp 和 Gson 依赖（如果尚未添加）：

```kotlin
dependencies {
    // ... 现有依赖 ...
    
    // Remote Control 插件依赖
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.code.gson:gson:2.10.1")
}
```

---

## 第八步：修改 AndroidManifest.xml

**文件路径**: `app/src/main/AndroidManifest.xml`

添加网络权限（如果尚未添加）：

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- 现有权限 -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    
    <!-- 应用定义 -->
    <application
        android:name=".MainApp"
        ...>
        
        <!-- 现有服务和活动 -->
        
    </application>
</manifest>
```

---

## 第九步：注册插件

**文件路径**: `app/src/main/java/app/aaps/core/interfaces/plugin/PluginBase.kt`

在插件列表中注册 RemoteControlPlugin（具体位置取决于 AndroidAPS 的插件注册机制）：

```kotlin
// 在插件初始化列表中添加
RemoteControlPlugin::class.java
```

或者在 `MainApp.kt` 或插件管理器中注册。

---

## 第十步：创建设置界面（可选）

**文件路径**: `app/src/main/java/app/aaps/plugins/general/remotecontrol/RemoteControlFragment.kt`

```kotlin
package app.aaps.plugins.general.remotecontrol

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.Switch
import android.widget.Toast
import androidx.fragment.app.Fragment
import app.aaps.plugins.general.remotecontrol.data.DeviceConfig

class RemoteControlFragment : Fragment() {
    private lateinit var switchEnabled: Switch
    private lateinit var editServerUrl: EditText
    private lateinit var editPhone: EditText
    private lateinit var btnSave: Button

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        val view = inflater.inflate(R.layout.fragment_remote_control, container, false)
        
        switchEnabled = view.findViewById(R.id.switch_enabled)
        editServerUrl = view.findViewById(R.id.edit_server_url)
        editPhone = view.findViewById(R.id.edit_phone)
        btnSave = view.findViewById(R.id.btn_save)

        loadConfig()

        btnSave.setOnClickListener {
            saveConfig()
        }

        return view
    }

    private fun loadConfig() {
        val config = DeviceConfig.load(requireContext())
        switchEnabled.isChecked = config.enabled
        editServerUrl.setText(config.serverUrl)
        editPhone.setText(config.phone)
    }

    private fun saveConfig() {
        val config = DeviceConfig(
            enabled = switchEnabled.isChecked,
            serverUrl = editServerUrl.text.toString(),
            phone = editPhone.text.toString(),
            deviceId = DeviceConfig.load(requireContext()).deviceId,
            deviceToken = DeviceConfig.load(requireContext()).deviceToken
        )
        DeviceConfig.save(requireContext(), config)
        Toast.makeText(requireContext(), "配置已保存", Toast.LENGTH_SHORT).show()
    }
}
```

**布局文件**: `app/src/main/res/layout/fragment_remote_control.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16dp">

    <Switch
        android:id="@+id/switch_enabled"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="启用远程控制"
        android:layout_marginBottom="16dp" />

    <EditText
        android:id="@+id/edit_server_url"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="服务器地址 (https://your-server.com)"
        android:inputType="textUri"
        android:layout_marginBottom="16dp" />

    <EditText
        android:id="@+id/edit_phone"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="手机号"
        android:inputType="phone"
        android:layout_marginBottom="16dp" />

    <Button
        android:id="@+id/btn_save"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="保存配置" />

</LinearLayout>
```

---

## 编译和测试

### 1. 编译 AndroidAPS

```bash
cd AndroidAPS
./gradlew assembleDebug
```

### 2. 安装到设备

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

### 3. 配置远程控制

1. 打开 AndroidAPS
2. 进入设置 → 远程控制
3. 启用远程控制
4. 输入 Web 服务器地址和手机号
5. 保存配置

### 4. 测试流程

1. 在 Web 界面登录（使用与 AndroidAPS 相同的手机号）
2. 查看设备状态（应显示"在线"）
3. 发送胰岛素输注命令
4. 观察 AndroidAPS 执行命令
5. 查看命令状态变为"已完成"

---

## 安全注意事项

1. **HTTPS**: 生产环境必须使用 HTTPS
2. **设备认证**: 使用 deviceToken 进行设备认证
3. **命令有效期**: 命令 5 分钟后自动过期
4. **剂量限制**: 胰岛素最大 25U，碳水最大 150g
5. **手机号绑定**: 用户只能操作自己手机号的设备

---

## 故障排查

### 问题：设备显示离线

- 检查 AndroidAPS 是否启用远程控制
- 检查网络连接
- 查看 AndroidAPS 日志（Logcat 过滤 `REMOTECONTROL`）

### 问题：命令未执行

- 检查命令是否过期（5 分钟有效期）
- 检查剂量是否超出限制
- 查看 AndroidAPS 日志

### 问题：结果未上报

- 检查网络连接
- 查看 Web 服务器日志
- 检查 deviceToken 是否匹配

---

## 后续优化

1. 添加命令执行确认界面（AndroidAPS 端）
2. 添加推送通知（命令执行结果）
3. 添加命令历史记录
4. 添加多设备支持
5. 添加命令优先级
