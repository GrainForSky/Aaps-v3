package app.aaps.plugins.main.general.remotecontrol.keys

import app.aaps.core.keys.interfaces.StringNonPreferenceKey

/**
 * RemoteControl 插件自用的持久化 key。
 *
 * 不修改 core 的 StringKey 枚举，使用插件本地的 NonPreferenceKey，
 * 与 OverviewStringKey / AutomationStringKey 的做法保持一致。
 */
enum class RemoteControlStringKey(
    override val key: String,
    override val defaultValue: String,
    override val exportable: Boolean = false
) : StringNonPreferenceKey {

    ServerUrl("remotecontrol_server_url", ""),
    Phone("remotecontrol_phone", ""),
    DeviceToken("remotecontrol_device_token", "")
}
