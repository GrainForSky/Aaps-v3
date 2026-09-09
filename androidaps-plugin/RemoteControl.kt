package app.aaps.plugins.main.general.remotecontrol

/**
 * RemoteControl 对外暴露接口（供 Fragment 查询状态）。
 */
interface RemoteControl {
    /** 最近一条状态信息（注册/执行/上报结果），用于界面展示。 */
    val lastMessage: String

    /** 插件是否已启用（由 ConfigBuilder 管理）。 */
    fun isEnabled(): Boolean
}
