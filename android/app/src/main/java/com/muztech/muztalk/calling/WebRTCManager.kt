package com.muztech.muztalk.calling

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.muztech.muztalk.data.model.IceServerDto
import com.muztech.muztalk.realtime.SocketManager
import org.json.JSONObject
import org.webrtc.*

class WebRTCManager(private val context: Context) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val eglBase: EglBase = EglBase.create()
    private var factory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var localAudioTrack: AudioTrack? = null
    private var localVideoTrack: VideoTrack? = null
    private var remoteVideoTrack: VideoTrack? = null
    private var videoCapturer: CameraVideoCapturer? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null

    private var attachedLocalRenderer: SurfaceViewRenderer? = null
    private var attachedRemoteRenderer: SurfaceViewRenderer? = null
    private val pendingIceCandidates = mutableListOf<IceCandidate>()
    private var remoteDescriptionSet = false

    val eglContext: EglBase.Context get() = eglBase.eglBaseContext

    fun initFactory() {
        if (factory != null) return
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context.applicationContext)
                .createInitializationOptions()
        )
        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
            .createPeerConnectionFactory()
    }

    fun attachLocalRenderer(renderer: SurfaceViewRenderer?) {
        mainHandler.post {
            val prev = attachedLocalRenderer
            if (prev != null && prev !== renderer) {
                runCatching { localVideoTrack?.removeSink(prev) }
            }
            attachedLocalRenderer = renderer
            if (renderer != null) {
                runCatching { localVideoTrack?.addSink(renderer) }
            }
        }
    }

    fun attachRemoteRenderer(renderer: SurfaceViewRenderer?) {
        mainHandler.post {
            val prev = attachedRemoteRenderer
            if (prev != null && prev !== renderer) {
                runCatching { remoteVideoTrack?.removeSink(prev) }
            }
            attachedRemoteRenderer = renderer
            if (renderer != null) {
                runCatching { remoteVideoTrack?.addSink(renderer) }
            }
        }
    }

    private fun handleRemoteVideoTrack(track: VideoTrack) {
        mainHandler.post {
            remoteVideoTrack = track
            track.setEnabled(true)
            attachedRemoteRenderer?.let { renderer ->
                runCatching { track.addSink(renderer) }
            }
        }
    }

    private fun flushPendingIceCandidates() {
        val pc = peerConnection ?: return
        val copy = synchronized(pendingIceCandidates) {
            val list = pendingIceCandidates.toList()
            pendingIceCandidates.clear()
            list
        }
        copy.forEach { cand ->
            pc.addIceCandidate(cand)
        }
    }

    fun startPeerConnection(
        callId: String,
        peerUserId: String,
        iceServersDto: List<IceServerDto>,
        isVideo: Boolean,
        localRenderer: SurfaceViewRenderer? = null,
        remoteRenderer: SurfaceViewRenderer? = null,
        onConnected: () -> Unit = {}
    ) {
        if (peerConnection != null) return
        initFactory()
        if (localRenderer != null) attachedLocalRenderer = localRenderer
        if (remoteRenderer != null) attachedRemoteRenderer = remoteRenderer
        remoteDescriptionSet = false
        synchronized(pendingIceCandidates) { pendingIceCandidates.clear() }

        val rtcServers = iceServersDto.map { dto ->
            val builder = PeerConnection.IceServer.builder(dto.urls)
            if (!dto.username.isNullOrBlank()) builder.setUsername(dto.username)
            if (!dto.credential.isNullOrBlank()) builder.setPassword(dto.credential)
            builder.createIceServer()
        }

        val rtcConfig = PeerConnection.RTCConfiguration(rtcServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        }

        peerConnection = factory?.createPeerConnection(rtcConfig, object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                val candJson = JSONObject().apply {
                    put("sdpMid", candidate.sdpMid)
                    put("sdpMLineIndex", candidate.sdpMLineIndex)
                    put("candidate", candidate.sdp)
                }
                SocketManager.emitCallSignal(
                    "call:ice_candidate",
                    JSONObject().apply {
                        put("callId", callId)
                        put("toUserId", peerUserId)
                        put("candidate", candJson)
                    }
                )
            }

            override fun onTrack(transceiver: RtpTransceiver?) {
                val track = transceiver?.receiver?.track()
                if (track is VideoTrack) {
                    handleRemoteVideoTrack(track)
                }
            }

            override fun onAddTrack(receiver: RtpReceiver?, mediaStreams: Array<out MediaStream>?) {
                val track = receiver?.track()
                if (track is VideoTrack) {
                    handleRemoteVideoTrack(track)
                }
                mediaStreams?.forEach { stream ->
                    stream.videoTracks?.firstOrNull()?.let { vt ->
                        handleRemoteVideoTrack(vt)
                    }
                }
            }

            override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
                if (newState == PeerConnection.PeerConnectionState.CONNECTED) {
                    onConnected()
                }
            }

            override fun onSignalingChange(p0: PeerConnection.SignalingState?) {}
            override fun onIceConnectionChange(p0: PeerConnection.IceConnectionState?) {}
            override fun onIceConnectionReceivingChange(p0: Boolean) {}
            override fun onIceGatheringChange(p0: PeerConnection.IceGatheringState?) {}
            override fun onIceCandidatesRemoved(p0: Array<out IceCandidate>?) {}
            override fun onAddStream(stream: MediaStream?) {
                stream?.videoTracks?.firstOrNull()?.let { vt ->
                    handleRemoteVideoTrack(vt)
                }
            }
            override fun onRemoveStream(p0: MediaStream?) {}
            override fun onDataChannel(p0: DataChannel?) {}
            override fun onRenegotiationNeeded() {}
        })

        // Audio Track
        val audioSource = factory?.createAudioSource(MediaConstraints())
        localAudioTrack = factory?.createAudioTrack("ARDAMSa0", audioSource)
        localAudioTrack?.let { peerConnection?.addTrack(it, listOf("ARDAMS")) }

        // Video Track (when video call)
        if (isVideo) {
            val enumerator = Camera2Enumerator(context)
            val camName = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
                ?: enumerator.deviceNames.firstOrNull()
            if (camName != null) {
                videoCapturer = enumerator.createCapturer(camName, null)
                surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", eglBase.eglBaseContext)
                val videoSource = factory?.createVideoSource(false)
                videoCapturer?.initialize(surfaceTextureHelper, context, videoSource?.capturerObserver)
                videoCapturer?.startCapture(720, 1280, 30)
                localVideoTrack = factory?.createVideoTrack("ARDAMSv0", videoSource)
                localVideoTrack?.let { vt ->
                    mainHandler.post {
                        attachedLocalRenderer?.let { r -> runCatching { vt.addSink(r) } }
                    }
                    peerConnection?.addTrack(vt, listOf("ARDAMS"))
                }
            }
        }
    }

    fun createAndSendOffer(callId: String, peerUserId: String) {
        val pc = peerConnection ?: return
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
        }
        pc.createOffer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription) {
                pc.setLocalDescription(SimpleSdpObserver(), sdp)
                val sdpJson = JSONObject().apply {
                    put("type", sdp.type.canonicalForm())
                    put("sdp", sdp.description)
                }
                SocketManager.emitCallSignal(
                    "call:offer",
                    JSONObject().apply {
                        put("callId", callId)
                        put("toUserId", peerUserId)
                        put("sdp", sdpJson)
                    }
                )
            }
            override fun onSetSuccess() {}
            override fun onCreateFailure(p0: String?) {}
            override fun onSetFailure(p0: String?) {}
        }, constraints)
    }

    fun handleRemoteOffer(callId: String, fromUserId: String, sdpJson: JSONObject) {
        val pc = peerConnection ?: return
        val sdp = SessionDescription(SessionDescription.Type.OFFER, sdpJson.optString("sdp"))
        pc.setRemoteDescription(object : SdpObserver {
            override fun onCreateSuccess(p0: SessionDescription?) {}
            override fun onSetSuccess() {
                remoteDescriptionSet = true
                flushPendingIceCandidates()
                pc.createAnswer(object : SdpObserver {
                    override fun onCreateSuccess(answer: SessionDescription) {
                        pc.setLocalDescription(SimpleSdpObserver(), answer)
                        val ansJson = JSONObject().apply {
                            put("type", answer.type.canonicalForm())
                            put("sdp", answer.description)
                        }
                        SocketManager.emitCallSignal(
                            "call:answer",
                            JSONObject().apply {
                                put("callId", callId)
                                put("toUserId", fromUserId)
                                put("sdp", ansJson)
                            }
                        )
                    }
                    override fun onSetSuccess() {}
                    override fun onCreateFailure(p0: String?) {}
                    override fun onSetFailure(p0: String?) {}
                }, MediaConstraints())
            }
            override fun onCreateFailure(p0: String?) {}
            override fun onSetFailure(p0: String?) {}
        }, sdp)
    }

    fun handleRemoteAnswer(sdpJson: JSONObject) {
        val sdp = SessionDescription(SessionDescription.Type.ANSWER, sdpJson.optString("sdp"))
        peerConnection?.setRemoteDescription(object : SdpObserver {
            override fun onCreateSuccess(p0: SessionDescription?) {}
            override fun onSetSuccess() {
                remoteDescriptionSet = true
                flushPendingIceCandidates()
            }
            override fun onCreateFailure(p0: String?) {}
            override fun onSetFailure(p0: String?) {}
        }, sdp)
    }

    fun addIceCandidate(candJson: JSONObject) {
        val candidate = IceCandidate(
            candJson.optString("sdpMid"),
            candJson.optInt("sdpMLineIndex"),
            candJson.optString("candidate")
        )
        val pc = peerConnection
        if (pc != null && remoteDescriptionSet) {
            pc.addIceCandidate(candidate)
        } else {
            synchronized(pendingIceCandidates) {
                pendingIceCandidates.add(candidate)
            }
        }
    }

    fun setMuted(muted: Boolean) {
        localAudioTrack?.setEnabled(!muted)
    }

    fun switchCamera() {
        videoCapturer?.switchCamera(null)
    }

    fun close() {
        mainHandler.post {
            attachedLocalRenderer?.let { r -> runCatching { localVideoTrack?.removeSink(r) } }
            attachedRemoteRenderer?.let { r -> runCatching { remoteVideoTrack?.removeSink(r) } }
            attachedLocalRenderer = null
            attachedRemoteRenderer = null
        }
        try {
            videoCapturer?.stopCapture()
            videoCapturer?.dispose()
        } catch (_: Exception) {}
        videoCapturer = null
        surfaceTextureHelper?.dispose()
        surfaceTextureHelper = null
        peerConnection?.close()
        peerConnection = null
        localAudioTrack = null
        localVideoTrack = null
        remoteVideoTrack = null
        remoteDescriptionSet = false
        synchronized(pendingIceCandidates) { pendingIceCandidates.clear() }
    }

    private class SimpleSdpObserver : SdpObserver {
        override fun onCreateSuccess(p0: SessionDescription?) {}
        override fun onSetSuccess() {}
        override fun onCreateFailure(p0: String?) {}
        override fun onSetFailure(p0: String?) {}
    }
}
