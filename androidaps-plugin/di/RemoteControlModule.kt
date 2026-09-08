package app.aaps.plugins.main.di

import app.aaps.core.interfaces.plugin.PluginBase
import app.aaps.plugins.main.general.remotecontrol.RemoteControl
import app.aaps.plugins.main.general.remotecontrol.RemoteControlFragment
import app.aaps.plugins.main.general.remotecontrol.RemoteControlPlugin
import dagger.Binds
import dagger.Module
import dagger.android.ContributesAndroidInjector

/**
 * RemoteControl 插件 Dagger 模块。
 *
 * 使用方式：在 app.aaps.plugins.main.di.PluginsModule 的
 * @Module(includes = [...]) 列表中加入 RemoteControlModule::class。
 *
 * 写法与 SMSCommunicatorModule 保持一致：
 *  - 把 RemoteControlPlugin 绑定为 PluginBase，插件列表才能发现并加载它；
 *  - 同时绑定 RemoteControl 接口，供 Fragment 注入查询状态；
 *  - @ContributesAndroidInjector 注册 Fragment。
 */
@Module
@Suppress("unused")
abstract class RemoteControlModule {

    @ContributesAndroidInjector
    abstract fun contributesRemoteControlFragment(): RemoteControlFragment

    @Binds
    abstract fun bindPlugin(plugin: RemoteControlPlugin): PluginBase

    @Binds
    abstract fun bindRemoteControl(plugin: RemoteControlPlugin): RemoteControl
}
