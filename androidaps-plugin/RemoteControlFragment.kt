package app.aaps.plugins.main.general.remotecontrol

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import app.aaps.core.interfaces.rx.AapsSchedulers
import app.aaps.core.interfaces.rx.bus.RxBus
import app.aaps.core.interfaces.utils.DateUtil
import app.aaps.core.interfaces.utils.fabric.FabricPrivacy
import app.aaps.core.keys.StringKey
import app.aaps.core.keys.interfaces.Preferences
import app.aaps.plugins.main.R
import app.aaps.plugins.main.general.remotecontrol.events.EventRemoteControlUpdateGui
import app.aaps.plugins.main.databinding.RemotecontrolFragmentBinding
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

    private fun updateGui() {
        val enabled = remoteControl.isEnabled()
        val url = preferences.get(StringKey.RemoteControlServerUrl)
        val phone = preferences.get(StringKey.RemoteControlPhone)
        val token = preferences.get(StringKey.RemoteControlDeviceToken)

        binding.statusEnabled.text = getString(
            if (enabled) R.string.remotecontrol_status_enabled
            else R.string.remotecontrol_status_disabled
        )
        binding.statusUrl.text = if (url.isNotBlank()) url else getString(R.string.remotecontrol_not_configured)
        binding.statusPhone.text = phone.ifBlank { getString(R.string.remotecontrol_not_configured) }
        binding.statusToken.text = if (token.isNotBlank())
            getString(R.string.remotecontrol_token_registered)
        else
            getString(R.string.remotecontrol_token_pending)
        binding.statusHeartbeat.text = dateUtil.timeString(dateUtil.now())
    }
}
