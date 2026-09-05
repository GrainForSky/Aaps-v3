package app.aaps.plugins.main.general.remotecontrol

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import app.aaps.core.interfaces.rx.AapsSchedulers
import app.aaps.core.interfaces.rx.bus.RxBus
import app.aaps.core.interfaces.utils.fabric.FabricPrivacy
import app.aaps.plugins.main.databinding.RemotecontrolFragmentBinding
import app.aaps.plugins.main.general.remotecontrol.events.EventRemoteControlUpdateGui
import dagger.android.support.DaggerFragment
import io.reactivex.rxjava3.disposables.CompositeDisposable
import io.reactivex.rxjava3.kotlin.plusAssign
import javax.inject.Inject

/**
 * RemoteControl 状态界面：显示注册状态、最近消息。
 * 需要布局文件 res/layout/remotecontrol_fragment.xml（见文档）。
 */
class RemoteControlFragment : DaggerFragment() {

    @Inject lateinit var aapsSchedulers: AapsSchedulers
    @Inject lateinit var fabricPrivacy: FabricPrivacy
    @Inject lateinit var rxBus: RxBus
    @Inject lateinit var remoteControl: RemoteControl

    private val disposable = CompositeDisposable()
    private var _binding: RemotecontrolFragmentBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = RemotecontrolFragmentBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onResume() {
        super.onResume()
        disposable += rxBus
            .toObservable(EventRemoteControlUpdateGui::class.java)
            .observeOn(aapsSchedulers.main)
            .subscribe({ updateGui() }, fabricPrivacy::logException)
        updateGui()
    }

    override fun onPause() {
        super.onPause()
        disposable.clear()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    private fun updateGui() {
        if (_binding == null) return
        binding.remotecontrolStatus.text = remoteControl.lastMessage.ifEmpty { "-" }
    }
}
