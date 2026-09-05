package app.aaps.plugins.main.di

import app.aaps.plugins.main.general.remotecontrol.RemoteControl
import app.aaps.plugins.main.general.remotecontrol.RemoteControlFragment
import app.aaps.plugins.main.general.remotecontrol.RemoteControlPlugin
import dagger.Binds
import dagger.Module
import dagger.android.ContributesAndroidInjector

/**
 * RemoteControl 插件 Dagger 模块。
 *
 * 使用方式：在 app.aaps.plugins.main.di.PluginsModule 的 @Module(includes=[...])
 * 列表中加入 RemoteControlModule::class。
 */
@Module
@Suppress("unused")
abstract class RemoteControlModule {

    @ContributesAndroidInjector
    abstract fun contributesRemoteControlFragment(): RemoteControlFragment

    @Module
    interface Bindings {

        @Binds fun bindRemoteControl(remoteControlPlugin: RemoteControlPlugin): RemoteControl
    }
}
