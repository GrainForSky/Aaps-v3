package app.aaps.plugins.main.general.remotecontrol

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import app.aaps.core.data.plugin.PluginType
import app.aaps.core.interfaces.plugin.ActivePlugin
import app.aaps.core.interfaces.rx.AapsSchedulers
import app.aaps.core.interfaces.rx.bus.RxBus
import app.aaps.core.interfaces.utils.DateUtil
import app.aaps.core.interfaces.utils.fabric.FabricPrivacy
import app.aaps.core.keys.interfaces.Preferences
import app.aaps.plugins.main.R
import app.aaps.plugins.main.databinding.RemotecontrolFragmentBinding
import app.aaps.plugins.main.general.remotecontrol.events.EventRemoteControlUpdateGui
import app.aaps.plugins.main.general.remotecontrol.keys.RemoteControlStringKey
import dagger.android.support.DaggerFragment
import io.reactivex.rxjava3.disposables.CompositeDisposable
import io.reactivex.rxjava3.kotlin.plusAssign
import javax.inject.Inject

class RemoteControlFragment : DaggerFragment() {

    @Inject lateinit var aapsSchedulers: AapsSchedulers
    @Inject lateinit var rxBus: RxBus
    @Inject lateinit var preferences: Preferences
    @Inject lateinit var dateUtil: DateUtil
    @Inject lateinit var fabricPrivacy: FabricPrivacy
    @Inject lateinit var activePlugin: ActivePlugin
    @Inject lateinit var remoteControl: RemoteControl

    private val disposable = CompositeDisposable()

    private var _binding: RemotecontrolFragmentBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = RemotecontrolFragmentBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.inputServerUrl.setText(preferences.get(RemoteControlStringKey.ServerUrl))
        binding.inputPhone.setText(preferences.get(RemoteControlStringKey.Phone))
        binding.buttonSave.setOnClickListener { save() }
    }

    @Synchronized
    override fun onResume() {
        super.onResume()
        disposable += rxBus
            .toObservable(EventRemoteControlUpdateGui::class.java)
            .observeOn(aapsSchedulers.main)
            .subscribe({ updateGui() }, fabricPrivacy::logException)
        updateGui()
    }

    @Synchronized
    override fun onPause() {
        super.onPause()
        disposable.clear()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    private fun save() {
        val url = binding.inputServerUrl.text.toString().trim()
        val phone = binding.inputPhone.text.toString().trim()

        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            binding.inputServerUrl.error = getString(R.string.remotecontrol_invalid_url)
            return
        }
        if (phone.isBlank()) {
            binding.inputPhone.error = getString(R.string.remotecontrol_invalid_phone)
            return
        }

        preferences.put(RemoteControlStringKey.ServerUrl, url)
        preferences.put(RemoteControlStringKey.Phone, phone)

        // setPluginEnabled 内部会在状态变为 ENABLED 时自动调用插件 onStart()；
        // 若插件本来就已启用（仅改了配置），再显式 restart() 重启轮询。
        val plugin = activePlugin.getPluginsList().firstOrNull { it is RemoteControlPlugin }
        val wasEnabled = plugin?.isEnabled() == true
        plugin?.setPluginEnabled(PluginType.GENERAL, true)
        if (wasEnabled) remoteControl.restart()

        binding.statusMessage.text = getString(R.string.remotecontrol_saved)
        updateGui()
    }

    private fun updateGui() {
        val binding = _binding ?: return
        val enabled = remoteControl.isEnabled()
        val token = preferences.get(RemoteControlStringKey.DeviceToken)

        binding.statusEnabled.text = getString(
            if (enabled) R.string.remotecontrol_status_enabled
            else R.string.remotecontrol_status_disabled
        )
        binding.statusToken.text = getString(
            if (token.isNotBlank()) R.string.remotecontrol_token_registered
            else R.string.remotecontrol_token_pending
        )
        binding.statusHeartbeat.text = dateUtil.timeString(dateUtil.now())
        if (remoteControl.lastMessage.isNotBlank()) {
            binding.statusMessage.text = remoteControl.lastMessage
        }
    }
}
