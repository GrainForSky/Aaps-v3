package app.aaps.plugins.main.general.remotecontrol

import app.aaps.core.data.plugin.PluginType
import app.aaps.core.data.ue.Action
import app.aaps.core.data.ue.Sources
import app.aaps.core.interfaces.queue.CommandQueue
import app.aaps.core.interfaces.logging.AAPSLogger
import app.aaps.core.interfaces.logging.LTag
import app.aaps.core.interfaces.logging.UserEntryLogger
import app.aaps.core.interfaces.plugin.PluginBase
import app.aaps.core.interfaces.plugin.PluginDescription
import app.aaps.core.interfaces.resources.ResourceHelper
import app.aaps.core.interfaces.rx.bus.RxBus
import app.aaps.plugins.main.general.remotecontrol.events.EventRemoteControlUpdateGui
import app.aaps.core.objects.R as CoreObjectsR
import app.aaps.plugins.main.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton

/**
 * RemoteControl 插件。
 *
 * 架构：AndroidAPS 主动轮询 Web 服务端命令队列，拿到 BOLUS/CARBS 命令后
 * 通过 CommandQueue 执行，并把结果上报回服务端。
 */
@Singleton
class RemoteControlPlugin @Inject constructor(
    aapsLogger: AAPSLogger,
    rh: ResourceHelper,
    private val commandQueue: CommandQueue,
    private val uel: UserEntryLogger,
    private val rxBus: RxBus,
    private val api: RemoteControlApi
) : PluginBase(
    PluginDescription()
        .mainType(PluginType.GENERAL)
        .fragmentClass(RemoteControlFragment::class.java.name)
        .pluginIcon(CoreObjectsR.drawable.ic_sms)
        .pluginName(R.string.remotecontrol)
        .shortName(R.string.remotecontrol_shortname)
        .description(R.string.description_remote_control)
        .enableByDefault(false),
    aapsLogger, rh
), RemoteControl {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var pollJob: Job? = null
    private var heartbeatJob: Job? = null

    @Volatile override var lastMessage: String = ""
        private set(value) {
            field = value
            // 通知 Fragment 刷新界面
            rxBus.send(EventRemoteControlUpdateGui())
        }

    private fun updateMessage(msg: String) {
        lastMessage = msg
    }

    // 命令队列回调在主线程（CommandQueue 内部线程）被调用，这里仅做结果上报
    override fun onStart() {
        super.onStart()
        registerAndStart()
    }

    override fun onStop() {
        // 取消轮询/心跳协程；保留 scope 本身以便 onStart 时重启
        pollJob?.cancel()
        heartbeatJob?.cancel()
        pollJob = null
        heartbeatJob = null
        super.onStop()
    }

    private fun registerAndStart() {
        scope.launch {
            try {
                api.register { msg -> updateMessage(msg) }
                startPolling()
                startHeartbeat()
            } catch (e: Exception) {
                aapsLogger.error(LTag.CORE, "RemoteControl register failed", e)
                // 注册失败也启动轮询，下一轮会重试
                startPolling()
                startHeartbeat()
            }
        }
    }

    private fun startPolling() {
        if (pollJob?.isActive == true) return
        pollJob = scope.launch {
            while (isActive) {
                try {
                    val commands = api.fetchCommands()
                    for (cmd in commands) handleCommand(cmd)
                } catch (e: Exception) {
                    aapsLogger.debug(LTag.CORE, "RemoteControl poll failed: ${e.message}")
                }
                delay(POLL_INTERVAL_MS)
            }
        }
    }

    private fun startHeartbeat() {
        if (heartbeatJob?.isActive == true) return
        heartbeatJob = scope.launch {
            while (isActive) {
                try {
                    api.heartbeat()
                } catch (e: Exception) {
                    aapsLogger.debug(LTag.CORE, "RemoteControl heartbeat failed: ${e.message}")
                }
                delay(HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    private fun handleCommand(cmd: JSONObject) {
        val commandId = cmd.optString("id")
        if (commandId.isEmpty()) return
        when (cmd.optString("type")) {
            "bolus" -> executeBolus(commandId, cmd.optDouble("insulin", 0.0))
            "carbs" -> executeCarbs(commandId, cmd.optInt("carbs", 0))
            else -> scope.launch { api.reportResult(commandId, success = false, message = "Unknown command type") }
        }
    }

    private fun executeBolus(commandId: String, insulin: Double) {
        if (insulin <= 0.0) {
            scope.launch { api.reportResult(commandId, false, "Invalid insulin amount") }
            return
        }
        updateMessage(rh.gs(R.string.remotecontrol_executing_bolus, insulin))
        // CommandQueue.bolus 为阻塞回调模型，在其回调中上报结果
        val info = app.aaps.core.interfaces.pump.DetailedBolusInfo()
        info.insulin = insulin
        commandQueue.bolus(info, object : app.aaps.core.interfaces.queue.Callback() {
            override fun run() {
                val ok = result.success
                if (ok) {
                    uel.log(Action.BOLUS, Sources.SMS, "RemoteControl bolus $insulin U")
                    updateMessage(rh.gs(R.string.remotecontrol_bolus_done, result.bolusDelivered))
                } else {
                    updateMessage(rh.gs(R.string.remotecontrol_bolus_failed))
                }
                // 回调可能在泵/主线程，网络上报放到 IO 线程
                scope.launch { api.reportResult(commandId, ok, if (ok) "Bolus ${result.bolusDelivered}U delivered" else "Bolus failed") }
            }
        })
    }

    private fun executeCarbs(commandId: String, carbs: Int) {
        if (carbs <= 0) {
            scope.launch { api.reportResult(commandId, false, "Invalid carbs amount") }
            return
        }
        updateMessage(rh.gs(R.string.remotecontrol_executing_carbs, carbs))
        val info = app.aaps.core.interfaces.pump.DetailedBolusInfo()
        info.carbs = carbs.toDouble()
        commandQueue.bolus(info, object : app.aaps.core.interfaces.queue.Callback() {
            override fun run() {
                val ok = result.success
                if (ok) {
                    uel.log(Action.CARBS, Sources.SMS, "RemoteControl carbs $carbs g")
                    updateMessage(rh.gs(R.string.remotecontrol_carbs_done, carbs))
                } else {
                    updateMessage(rh.gs(R.string.remotecontrol_carbs_failed))
                }
                scope.launch { api.reportResult(commandId, ok, if (ok) "Carbs ${carbs}g recorded" else "Carbs failed") }
            }
        })
    }

    companion object {
        private const val POLL_INTERVAL_MS = 5_000L
        private const val HEARTBEAT_INTERVAL_MS = 30_000L
    }
}
