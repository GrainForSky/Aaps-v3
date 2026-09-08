# AndroidAPS 3.4 源码修改方案（设备轮询远程控制）

> 基于真实源码 https://github.com/GrainForSky/AndroidAPS.git（master 分支，包名 `app.aaps.*`）校准。
> 所有 import、类名、方法签名均与源码核对通过。

## 架构

```
Web 用户 → POST /api/command/create → 命令存入服务端 SQLite 队列
AndroidAPS → 每 5 秒 GET /api/device/commands（主动轮询）
AndroidAPS → 通过 CommandQueue 执行 bolus/carbs
AndroidAPS → POST /api/device/result 上报结果
AndroidAPS → 每 30 秒 POST /api/device/heartbeat 保活
```

设备身份三元组：`phone`（用户手机号）+ `deviceId`（`aaps-` + Android ID）+ `deviceToken`（注册时服务端下发，持久化保存）。

---

## 一、新增文件

所有 Kotlin 文件放到目录：
`plugins/main/src/main/kotlin/app/aaps/plugins/main/general/remotecontrol/`

完整可用源码见本项目 `androidaps-plugin/` 目录：

| 文件 | 作用 |
|------|------|
| `RemoteControlPlugin.kt` | 插件入口（GENERAL 类型），管理轮询/心跳协程，执行 bolus/carbs |
| `RemoteControl.kt` | 插件对外接口（Fragment 查询状态） |
| `RemoteControlApi.kt` | OkHttp 通信层：注册/心跳/拉命令/上报结果 |
| `RemoteControlFragment.kt` | 状态界面 |
| `events/EventRemoteControlUpdateGui.kt` | RxBus 界面刷新事件 |
| `di/RemoteControlModule.kt` | Dagger 模块（Fragment 注入 + 接口绑定） |

### 关键实现说明（与源码 API 对应）

1. **执行胰岛素/碳水**：统一走 `CommandQueue.bolus(DetailedBolusInfo, Callback)`
   - 胰岛素：`DetailedBolusInfo().apply { insulin = x }`
   - 碳水：`DetailedBolusInfo().apply { carbs = grams.toDouble() }`（`carbs` 字段是 `Double`）
   - 回调继承 `app.aaps.core.interfaces.queue.Callback`，在 `run()` 中读 `result.success` / `result.bolusDelivered`
   - 这与 SMS Communicator 插件 `processBOLUS`/`processCARBS` 的用法完全一致

2. **偏好存储**：使用 `Preferences` + 类型化 key（`StringKey.RemoteControlXxx`），
   读取 `preferences.get(StringKey.X)`，写入 `preferences.put(StringKey.X, value)`。

3. **插件声明**：继承 `PluginBase`，`PluginDescription().mainType(PluginType.GENERAL)...`，
   图标用 `app.aaps.core.objects.R.drawable.ic_sms`。

4. **日志**：注入 `AAPSLogger`，用 `aapsLogger.debug(LTag.CORE, msg)` / `warn` / `error`。

5. **用户操作审计**：注入 `UserEntryLogger`，执行成功后
   `uel.log(Action.BOLUS, Sources.SMS, note)` / `uel.log(Action.CARBS, Sources.SMS, note)`。

6. **OkHttp**：源码 `core:nssdk` 已依赖 okhttp3，`plugins/main` 可直接使用，无需新增依赖。

7. **无需前台 Service**：AndroidAPS 自身有 `DummyService` 常驻前台，插件随进程存活，
   轮询用 Kotlin 协程（`Dispatchers.IO`）即可，不需要单独的 Service。

---

## 二、需要修改的现有文件

### 2.1 新增偏好 Key

**文件**：`core/keys/src/main/kotlin/app/aaps/core/keys/StringKey.kt`

在 enum 中添加（与 `SmsAllowedNumbers` 同级）：

```kotlin
RemoteControlServerUrl("remotecontrol_server_url", ""),
RemoteControlPhone("remotecontrol_phone", ""),
RemoteControlDeviceToken("remotecontrol_device_token", "", isPassword = true),
```

> 插件启用开关由 `PluginBase`/ConfigBuilder 自动管理（`simple_mode` 下的插件 enable 状态），
> 无需自定义 BooleanKey。

### 2.2 注册 Dagger 模块

**文件**：`plugins/main/src/main/kotlin/app/aaps/plugins/main/di/PluginsModule.kt`

在 `@Module(includes = [...])` 列表中加入 `RemoteControlModule::class`：

```kotlin
@Module(
    includes = [
        PluginsModule.Bindings::class,
        FoodModule::class,
        SMSCommunicatorModule::class,
        RemoteControlModule::class,   // ← 新增
        ProfileModule::class,
        ProfileModule.Bindings::class,
        SkinsModule::class,
        ActionsModule::class,
        OverviewModule::class,
    ]
)
```

`RemoteControlModule` 内部已完成三项绑定（与 `SMSCommunicatorModule` 写法一致，均为抽象模块方法，不需要内部子 Module）：

- `@ContributesAndroidInjector abstract fun contributesRemoteControlFragment()` —— 注册 Fragment
- `@Binds abstract fun bindPlugin(plugin: RemoteControlPlugin): PluginBase` —— **关键**：绑定为 `PluginBase`，ConfigBuilder 的插件列表才能发现并加载该插件
- `@Binds abstract fun bindRemoteControl(plugin: RemoteControlPlugin): RemoteControl` —— 绑定对外接口，供 Fragment 注入查询状态

> 若缺少 `bindPlugin(...) : PluginBase` 这条绑定，插件永远不会出现在 AndroidAPS 的插件列表里（这是最常见的"插件不生效"原因）。

### 2.3 字符串资源

**文件**：`plugins/main/src/main/res/values/strings.xml`

把 `androidaps-plugin/res/strings-remotecontrol.xml` 中的 `<string>` 条目合并进去：

```xml
<string name="remotecontrol">RemoteControl</string>
<string name="remotecontrol_shortname">RemoteCtrl</string>
<string name="description_remote_control">通过 Web 服务端命令队列远程输注胰岛素/碳水（设备主动轮询）。</string>
<string name="remotecontrol_server_url">服务器地址</string>
<string name="remotecontrol_phone">手机号</string>
<string name="remotecontrol_device_token">设备令牌（自动填充）</string>
<string name="remotecontrol_executing_bolus">正在执行胰岛素输注 %.1f U</string>
<string name="remotecontrol_bolus_done">胰岛素输注完成 %.1f U</string>
<string name="remotecontrol_bolus_failed">胰岛素输注失败</string>
<string name="remotecontrol_executing_carbs">正在记录碳水 %d g</string>
<string name="remotecontrol_carbs_done">碳水已记录 %d g</string>
<string name="remotecontrol_carbs_failed">碳水记录失败</string>
<string name="remotecontrol_status">状态</string>
```

> 中文翻译可放到 `plugins/main/src/main/res/values-zh-rCN/strings.xml`。

### 2.4 Fragment 布局

把 `androidaps-plugin/res/remotecontrol_fragment.xml` 复制为：
`plugins/main/src/main/res/layout/remotecontrol_fragment.xml`

（ViewBinding 会据此生成 `RemotecontrolFragmentBinding`。）

### 2.5 权限与依赖

- **权限**：`INTERNET`、`ACCESS_NETWORK_STATE`、`FOREGROUND_SERVICE` 在
  `app/src/main/AndroidManifest.xml` 中已存在，无需新增。
- **依赖**：okhttp3 已由 `core:nssdk` 传递提供，无需改 gradle。

### 2.6 命令只下发一次（防重复输注）

服务端 `GET /api/device/commands` 在一个 SQLite 事务内完成「`pending` → `executing`」的原子领取，
并立即给命令打上 `delivered=1` 标记：

- 同一条命令**在整个生命周期内只会返回给设备一次**，后续轮询不再返回，从根本上杜绝重复胰岛素输注；
- 设备执行后通过 `POST /api/device/result` 上报，命令变为 `completed`/`failed`；
- 若结果上报丢失，命令停留在 `executing`（不会重发），Web 端靠命令状态查询 + 5 分钟过期兜底判定。

插件侧无需做去重，但 `CommandQueue` 回调里的结果上报放在 `Dispatchers.IO` 协程中执行，
避免网络请求阻塞泵线程。

---

## 三、配置界面（在 AAPS 内）

插件启用后，在 AAPS「配置」中会出现 RemoteControl  GENERAL 插件，勾选启用。
偏好项（服务器地址、手机号）通过标准偏好界面填写：

- 服务器地址：Web 服务端根地址，如 `https://your-domain.com`（不要带尾斜杠，代码会 trim）
- 手机号：与 Web 端登录一致的手机号
- 设备令牌：注册成功后自动写入，无需手填

首次启动插件会自动调用 `/api/device/register`，服务端返回 token 并持久化。

---

## 四、编译

```bash
git clone https://github.com/GrainForSky/AndroidAPS.git
cd AndroidAPS
# 按上述新增/修改文件后
./gradlew assembleFullDebug
adb install app/build/outputs/apk/full/debug/app-full-debug.apk
```

---

## 五、使用流程

1. Web 端：手机号 + PIN 登录 → 配置 Nightscout（可选，用于看数据）。
2. AAPS 端：启用 RemoteControl 插件 → 填服务器地址和手机号 → 自动注册（Web 端设备状态变在线）。
3. 远程输注：Web 端点输注 → 二次确认 → 命令入队 → AAPS 5 秒内拉取 → CommandQueue 执行 → 结果回传 → Web 端显示成功/失败。
4. 心跳：AAPS 每 30 秒上报，超过 60 秒无心跳 Web 端标记离线。

---

## 六、安全要点

- 所有医疗命令在 Web 端有二次确认 + 安全锁（胰岛素 15 分钟 / 碳水 1 分钟）。
- 剂量上限由 Web 端安全规则约束；AAPS 侧 CommandQueue 还会再走系统自身约束（ConstraintsChecker）。
- deviceToken 为服务端随机生成，仅保存在 AAPS 偏好中，网络传输随请求体。
- 命令 5 分钟有效期，超时服务端自动失效，防止过期命令被执行。
