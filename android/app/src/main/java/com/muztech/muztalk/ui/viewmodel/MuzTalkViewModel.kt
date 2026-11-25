package com.muztech.muztalk.ui.viewmodel

import android.app.Application
import android.media.MediaRecorder
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import com.muztech.muztalk.calling.WebRTCManager
import com.muztech.muztalk.crypto.E2EEKeyHelper
import com.muztech.muztalk.crypto.EncryptedFileVault
import com.muztech.muztalk.data.local.LocalStorageManager
import com.muztech.muztalk.data.local.TokenManager
import com.muztech.muztalk.data.model.*
import com.muztech.muztalk.data.remote.ApiClient
import com.muztech.muztalk.data.remote.toUserMessage
import com.muztech.muztalk.realtime.SocketManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import org.json.JSONObject
import org.webrtc.SurfaceViewRenderer
import java.io.File
import java.util.UUID

enum class CallPhase {
    IDLE, INCOMING, OUTGOING, ACTIVE
}

data class ActiveCallUiState(
    val phase: CallPhase = CallPhase.IDLE,
    val callId: String = "",
    val peerUserId: String = "",
    val peerName: String = "",
    val isVideo: Boolean = false,
    val isMuted: Boolean = false,
    val isFloating: Boolean = false
)

class MuzTalkViewModel(application: Application) : AndroidViewModel(application) {

    private val tokenManager = TokenManager(application.applicationContext)
    private val localStorage = LocalStorageManager(application.applicationContext)
    val webRTCManager = WebRTCManager(application.applicationContext)

    private val _currentUser = MutableStateFlow<UserDto?>(null)
    val currentUser: StateFlow<UserDto?> = _currentUser.asStateFlow()

    private val _serverUrl = MutableStateFlow(tokenManager.getBaseUrl())
    val serverUrl: StateFlow<String> = _serverUrl.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _statusBanner = MutableStateFlow<String?>(null)
    val statusBanner: StateFlow<String?> = _statusBanner.asStateFlow()

    private val _devOtpPreview = MutableStateFlow<String?>(null)
    val devOtpPreview: StateFlow<String?> = _devOtpPreview.asStateFlow()

    private val _otpSentEmail = MutableStateFlow<String?>(null)
    val otpSentEmail: StateFlow<String?> = _otpSentEmail.asStateFlow()

    private val _isSocketConnected = MutableStateFlow(false)
    val isSocketConnected: StateFlow<Boolean> = _isSocketConnected.asStateFlow()

    private val _chats = MutableStateFlow<List<ChatListItemDto>>(emptyList())
    val chats: StateFlow<List<ChatListItemDto>> = _chats.asStateFlow()

    private val _selectedChat = MutableStateFlow<ChatListItemDto?>(null)
    val selectedChat: StateFlow<ChatListItemDto?> = _selectedChat.asStateFlow()

    private val _messages = MutableStateFlow<List<MessageDto>>(emptyList())
    val messages: StateFlow<List<MessageDto>> = _messages.asStateFlow()

    private val _typingByChat = MutableStateFlow<Map<String, Boolean>>(emptyMap())
    val typingByChat: StateFlow<Map<String, Boolean>> = _typingByChat.asStateFlow()

    private val _statuses = MutableStateFlow<List<StatusDto>>(emptyList())
    val statuses: StateFlow<List<StatusDto>> = _statuses.asStateFlow()

    private val _communities = MutableStateFlow<List<CommunityDto>>(emptyList())
    val communities: StateFlow<List<CommunityDto>> = _communities.asStateFlow()

    private val _callsHistory = MutableStateFlow<List<CallDto>>(emptyList())
    val callsHistory: StateFlow<List<CallDto>> = _callsHistory.asStateFlow()

    private val _directoryUsers = MutableStateFlow<List<UserDto>>(emptyList())
    val directoryUsers: StateFlow<List<UserDto>> = _directoryUsers.asStateFlow()

    private val _activeCall = MutableStateFlow(ActiveCallUiState())
    val activeCall: StateFlow<ActiveCallUiState> = _activeCall.asStateFlow()

    private val _isRecordingVoiceNote = MutableStateFlow(false)
    val isRecordingVoiceNote: StateFlow<Boolean> = _isRecordingVoiceNote.asStateFlow()

    private val _darkTheme = MutableStateFlow(false)
    val darkTheme: StateFlow<Boolean> = _darkTheme.asStateFlow()

    private val _vaultSummary = MutableStateFlow(localStorage.getVaultSummary())
    val vaultSummary: StateFlow<EncryptedFileVault.VaultSummary> = _vaultSummary.asStateFlow()

    private val _blockScreenCapture = MutableStateFlow(false)
    val blockScreenCapture: StateFlow<Boolean> = _blockScreenCapture.asStateFlow()

    private var mediaRecorder: MediaRecorder? = null
    private var voiceNoteFile: File? = null
    private var pendingLocalRenderer: SurfaceViewRenderer? = null
    private var pendingRemoteRenderer: SurfaceViewRenderer? = null
    private var pendingOfferCallId: String? = null
    private var pendingOfferFromUserId: String? = null
    private var pendingOfferSdp: JSONObject? = null

    init {
        // Preload locally stored encrypted chats/statuses/calls from MuzTalk/ mobile vault
        _chats.value = localStorage.loadChats()
        _statuses.value = localStorage.loadStatuses()
        _callsHistory.value = localStorage.loadCalls()
        refreshVaultSummary()
        restoreSession()
    }

    fun refreshVaultSummary() {
        _vaultSummary.value = localStorage.getVaultSummary()
    }

    fun clearBanner() {
        _statusBanner.value = null
    }

    fun toggleDarkTheme() {
        _darkTheme.value = !_darkTheme.value
    }

    fun updateServerUrl(newUrl: String) {
        if (newUrl.isBlank()) return
        tokenManager.setBaseUrl(newUrl)
        ApiClient.reset()
        _serverUrl.value = tokenManager.getBaseUrl()
    }

    private fun restoreSession() {
        val token = tokenManager.getAccessToken() ?: return
        viewModelScope.launch {
            runCatching {
                val api = ApiClient.getService(tokenManager)
                val meRes = api.getMe()
                _currentUser.value = meRes.user
                _blockScreenCapture.value = meRes.securityPolicy?.blockScreenCapture ?: meRes.user.blockScreenCapture
                connectRealtime(token)
                registerFirebasePushToken()
                refreshAllData()
            }.onFailure {
                val refresh = tokenManager.getRefreshToken()
                if (refresh != null) {
                    runCatching {
                        val api = ApiClient.getService(tokenManager)
                        val refreshed = api.refreshToken(RefreshRequest(refresh))
                        tokenManager.saveTokens(refreshed.accessToken, refreshed.refreshToken)
                        val meRes = api.getMe()
                        _currentUser.value = meRes.user
                        _blockScreenCapture.value = meRes.securityPolicy?.blockScreenCapture ?: meRes.user.blockScreenCapture
                        connectRealtime(refreshed.accessToken)
                        registerFirebasePushToken()
                        refreshAllData()
                    }.onFailure {
                        tokenManager.clearTokens()
                    }
                }
            }
        }
    }

    fun sendEmailOtp(email: String, username: String?) {
        viewModelScope.launch {
            _isLoading.value = true
            runCatching {
                val res = ApiClient.getService(tokenManager).sendEmailOtp(
                    SendEmailOtpRequest(
                        email = email.trim(),
                        username = username?.trim()?.takeIf { it.isNotEmpty() }
                    )
                )
                _otpSentEmail.value = res.email
                _devOtpPreview.value = res.devOtpPreview
            }.onFailure { err ->
                _statusBanner.value = err.toUserMessage("Failed to send email OTP")
            }
            _isLoading.value = false
        }
    }

    fun verifyEmailOtp(otp: String, username: String?, displayName: String?, password: String?) {
        val email = _otpSentEmail.value ?: return
        viewModelScope.launch {
            _isLoading.value = true
            runCatching {
                val res = ApiClient.getService(tokenManager).verifyEmailOtp(
                    VerifyEmailOtpRequest(
                        email = email,
                        otp = otp.trim(),
                        username = username?.trim()?.takeIf { it.isNotEmpty() },
                        displayName = displayName?.trim()?.takeIf { it.isNotEmpty() },
                        password = password?.trim()?.takeIf { it.length >= 6 }
                    )
                )
                onAuthenticated(res)
            }.onFailure { err ->
                _statusBanner.value = err.toUserMessage("Email OTP verification failed")
            }
            _isLoading.value = false
        }
    }

    fun loginWithPassword(identifier: String, password: String) {
        viewModelScope.launch {
            _isLoading.value = true
            runCatching {
                val res = ApiClient.getService(tokenManager).loginWithPassword(
                    PasswordLoginRequest(identifier = identifier.trim(), password = password)
                )
                _otpSentEmail.value = res.email
                _devOtpPreview.value = res.devOtpPreview
            }.onFailure { err ->
                _statusBanner.value = err.toUserMessage("Sign in failed")
            }
            _isLoading.value = false
        }
    }

    fun resetOtpStep() {
        _otpSentEmail.value = null
        _devOtpPreview.value = null
    }

    private suspend fun onAuthenticated(auth: AuthResponse) {
        tokenManager.saveTokens(auth.accessToken, auth.refreshToken)
        _currentUser.value = auth.user
        _blockScreenCapture.value = auth.user.blockScreenCapture
        _otpSentEmail.value = null
        _devOtpPreview.value = null
        connectRealtime(auth.accessToken)
        registerFirebasePushToken()
        syncEncryptionKeys()
        refreshAllData()
    }

    private fun registerFirebasePushToken() {
        runCatching {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { fcmToken ->
                if (!fcmToken.isNullOrBlank()) {
                    viewModelScope.launch(Dispatchers.IO) {
                        runCatching {
                            ApiClient.getService(tokenManager)
                                .registerFcmDevice(RegisterFcmRequest(fcmToken = fcmToken, platform = "android"))
                        }
                    }
                }
            }
        }
    }

    fun syncEncryptionKeys() {
        viewModelScope.launch(Dispatchers.IO) {
            runCatching {
                val bundle = E2EEKeyHelper.generateKeyBundle()
                ApiClient.getService(tokenManager).registerKeys(
                    RegisterKeysRequest(
                        identityKeyPub = bundle.identityKeyPub,
                        signedPreKeyPub = bundle.signedPreKeyPub,
                        signedPreKeySig = bundle.signedPreKeySig,
                        fingerprint = bundle.fingerprint
                    )
                )
                val updated = ApiClient.getService(tokenManager).getMe().user
                _currentUser.value = updated
                _statusBanner.value = "Security keys updated"
            }.onFailure { err ->
                _statusBanner.value = err.toUserMessage("Key sync failed")
            }
        }
    }

    private fun connectRealtime(accessToken: String) {
        SocketManager.connect(
            baseUrl = tokenManager.getBaseUrl(),
            accessToken = accessToken,
            listener = object : SocketManager.Listener {
                override fun onConnectionChanged(connected: Boolean) {
                    _isSocketConnected.value = connected
                }

                override fun onNewMessage(message: MessageDto) {
                    val active = _selectedChat.value
                    if (active != null && active.id == message.conversationId) {
                        val list = _messages.value.toMutableList()
                        if (list.none { it.id == message.id }) {
                            list.add(message)
                            _messages.value = list
                            localStorage.saveMessages(active.id, list)
                        }
                        if (message.senderId != _currentUser.value?.id) {
                            SocketManager.emitRead(active.id)
                        }
                    } else {
                        val cached = localStorage.loadMessages(message.conversationId).toMutableList()
                        if (cached.none { it.id == message.id }) {
                            cached.add(message)
                            localStorage.saveMessages(message.conversationId, cached)
                        }
                    }
                    refreshChatsOnly()
                }

                override fun onTyping(conversationId: String, userId: String, typing: Boolean) {
                    if (userId == _currentUser.value?.id) return
                    val next = _typingByChat.value.toMutableMap()
                    next[conversationId] = typing
                    _typingByChat.value = next
                }

                override fun onIncomingCall(callId: String, fromUserId: String, fromName: String, type: String) {
                    _activeCall.value = ActiveCallUiState(
                        phase = CallPhase.INCOMING,
                        callId = callId,
                        peerUserId = fromUserId,
                        peerName = fromName,
                        isVideo = type.contains("VIDEO", ignoreCase = true)
                    )
                }

                override fun onCallAccepted(callId: String) {
                    val state = _activeCall.value
                    if (state.callId == callId) {
                        _activeCall.value = state.copy(phase = CallPhase.ACTIVE)
                        viewModelScope.launch {
                            runCatching {
                                val ice = ApiClient.getService(tokenManager).getIceConfig().iceServers
                                webRTCManager.startPeerConnection(
                                    callId = callId,
                                    peerUserId = state.peerUserId,
                                    iceServersDto = ice,
                                    isVideo = state.isVideo,
                                    localRenderer = pendingLocalRenderer,
                                    remoteRenderer = pendingRemoteRenderer
                                )
                                webRTCManager.createAndSendOffer(callId, state.peerUserId)
                            }
                        }
                    }
                }

                override fun onCallEnded(callId: String) {
                    if (_activeCall.value.callId == callId) {
                        pendingOfferCallId = null
                        pendingOfferFromUserId = null
                        pendingOfferSdp = null
                        webRTCManager.close()
                        _activeCall.value = ActiveCallUiState(phase = CallPhase.IDLE)
                        refreshCallsOnly()
                    }
                }

                override fun onCallOffer(callId: String, fromUserId: String, sdpJson: JSONObject) {
                    val state = _activeCall.value
                    if (state.phase == CallPhase.INCOMING && state.callId == callId) {
                        pendingOfferCallId = callId
                        pendingOfferFromUserId = fromUserId
                        pendingOfferSdp = sdpJson
                        return
                    }
                    viewModelScope.launch {
                        runCatching {
                            val ice = ApiClient.getService(tokenManager).getIceConfig().iceServers
                            webRTCManager.startPeerConnection(
                                callId = callId,
                                peerUserId = fromUserId,
                                iceServersDto = ice,
                                isVideo = state.isVideo,
                                localRenderer = pendingLocalRenderer,
                                remoteRenderer = pendingRemoteRenderer
                            )
                            webRTCManager.handleRemoteOffer(callId, fromUserId, sdpJson)
                        }
                    }
                }

                override fun onCallAnswer(callId: String, sdpJson: JSONObject) {
                    webRTCManager.handleRemoteAnswer(sdpJson)
                }

                override fun onIceCandidate(callId: String, candidateJson: JSONObject) {
                    webRTCManager.addIceCandidate(candidateJson)
                }

                override fun onSecurityPolicyUpdated(blockScreenCapture: Boolean) {
                    _blockScreenCapture.value = blockScreenCapture
                    _statusBanner.value = if (blockScreenCapture) {
                        "Screenshots & screen recording disabled by Admin"
                    } else {
                        "Screen capture protection updated by Admin"
                    }
                }
            }
        )
    }

    fun setLocalRenderer(local: SurfaceViewRenderer?) {
        pendingLocalRenderer = local
        webRTCManager.attachLocalRenderer(local)
    }

    fun setRemoteRenderer(remote: SurfaceViewRenderer?) {
        pendingRemoteRenderer = remote
        webRTCManager.attachRemoteRenderer(remote)
    }

    fun toggleFloatingCall() {
        val cur = _activeCall.value
        if (cur.phase != CallPhase.IDLE) {
            _activeCall.value = cur.copy(isFloating = !cur.isFloating)
        }
    }

    fun setFloatingCall(floating: Boolean) {
        val cur = _activeCall.value
        if (cur.phase != CallPhase.IDLE) {
            _activeCall.value = cur.copy(isFloating = floating)
        }
    }

    fun refreshAllData(query: String = "") {
        viewModelScope.launch {
            val api = ApiClient.getService(tokenManager)
            runCatching {
                val list = api.getChats(query).chats
                _chats.value = list
                if (query.isBlank()) localStorage.saveChats(list)
            }
            runCatching {
                val sts = api.getStatuses().statuses
                _statuses.value = sts
                localStorage.saveStatuses(sts)
            }
            runCatching { _communities.value = api.getCommunities().communities }
            runCatching {
                val calls = api.getCallsHistory().calls
                _callsHistory.value = calls
                localStorage.saveCalls(calls)
            }
            runCatching { _directoryUsers.value = api.searchUsers("").users }
            runCatching {
                val meRes = api.getMe()
                _currentUser.value = meRes.user
                _blockScreenCapture.value = meRes.securityPolicy?.blockScreenCapture ?: meRes.user.blockScreenCapture
            }
        }
    }

    fun refreshChatsOnly(query: String = "") {
        viewModelScope.launch {
            runCatching {
                val list = ApiClient.getService(tokenManager).getChats(query).chats
                _chats.value = list
                if (query.isBlank()) localStorage.saveChats(list)
            }
        }
    }

    private fun refreshCallsOnly() {
        viewModelScope.launch {
            runCatching {
                val calls = ApiClient.getService(tokenManager).getCallsHistory().calls
                _callsHistory.value = calls
                localStorage.saveCalls(calls)
            }
        }
    }

    fun openChat(chat: ChatListItemDto) {
        _selectedChat.value = chat
        // Load mobile-cached messages instantly, then sync fresh messages from server
        _messages.value = localStorage.loadMessages(chat.id)
        viewModelScope.launch {
            runCatching {
                val msgs = ApiClient.getService(tokenManager).getMessages(chat.id).messages
                _messages.value = msgs
                localStorage.saveMessages(chat.id, msgs)
                SocketManager.emitRead(chat.id)
                refreshChatsOnly()
            }.onFailure { err ->
                if (_messages.value.isEmpty()) {
                    _statusBanner.value = err.toUserMessage("Unable to load messages")
                }
            }
        }
    }

    fun closeChat() {
        _selectedChat.value = null
        _messages.value = emptyList()
    }

    fun sendTextMessage(text: String) {
        val chat = _selectedChat.value ?: return
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        SocketManager.sendMessage(
            clientMessageId = "and-${UUID.randomUUID()}",
            conversationId = chat.id,
            text = trimmed,
            type = "TEXT"
        )
        SocketManager.emitTyping(chat.id, false)
    }

    fun notifyTyping(typing: Boolean) {
        val chat = _selectedChat.value ?: return
        SocketManager.emitTyping(chat.id, typing)
    }

    fun startVoiceNoteRecording() {
        if (_isRecordingVoiceNote.value) return
        runCatching {
            val outFile = localStorage.createTempCaptureFile("voice_${System.currentTimeMillis()}.m4a")
            voiceNoteFile = outFile
            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(getApplication())
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            recorder.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setOutputFile(outFile.absolutePath)
                prepare()
                start()
            }
            mediaRecorder = recorder
            _isRecordingVoiceNote.value = true
        }.onFailure { err ->
            _statusBanner.value = err.toUserMessage("Microphone unavailable")
            _isRecordingVoiceNote.value = false
        }
    }

    fun stopAndSendVoiceNote() {
        if (!_isRecordingVoiceNote.value) return
        val chat = _selectedChat.value
        val file = voiceNoteFile
        runCatching {
            mediaRecorder?.stop()
            mediaRecorder?.release()
        }
        mediaRecorder = null
        _isRecordingVoiceNote.value = false

        if (chat == null || file == null || !file.exists()) return
        viewModelScope.launch(Dispatchers.IO) {
            runCatching {
                val reqBody = file.asRequestBody("audio/mp4".toMediaTypeOrNull())
                val part = MultipartBody.Part.createFormData("file", file.name, reqBody)
                val uploaded = ApiClient.getService(tokenManager).uploadMedia(part)
                // Immediately encrypt and move voice note into user's MuzTalk/Media/VoiceNotes/ folder and delete plaintext temp
                localStorage.saveEncryptedVoiceNote(file, file.name)
                refreshVaultSummary()

                val mediaId = uploaded["id"]?.toString() ?: UUID.randomUUID().toString()
                val url = uploaded["url"]?.toString() ?: ""
                val origName = uploaded["originalName"]?.toString() ?: file.name
                val mimeType = uploaded["mimeType"]?.toString() ?: "audio/mp4"
                val sizeBytes = (uploaded["sizeBytes"] as? Number)?.toLong() ?: 0L
                val attachment = MessageAttachmentDto(
                    id = UUID.randomUUID().toString(),
                    mediaFileId = mediaId,
                    url = url,
                    originalName = origName,
                    mimeType = mimeType,
                    sizeBytes = sizeBytes
                )
                SocketManager.sendMessage(
                    clientMessageId = "voice-${UUID.randomUUID()}",
                    conversationId = chat.id,
                    text = "Voice note",
                    type = "VOICE_NOTE",
                    attachments = listOf(attachment)
                )
            }.onFailure { err ->
                // Even if offline, keep voice note encrypted in mobile folder
                runCatching {
                    localStorage.saveEncryptedVoiceNote(file, file.name)
                    refreshVaultSummary()
                }
                _statusBanner.value = err.toUserMessage("Voice message could not be sent")
            }
        }
    }

    fun startDirectChat(peerUserId: String) {
        viewModelScope.launch {
            runCatching {
                val chat = ApiClient.getService(tokenManager)
                    .createDirectChat(CreateDirectChatRequest(peerUserId)).chat
                refreshChatsOnly()
                openChat(chat)
            }.onFailure { err ->
                _statusBanner.value = err.toUserMessage("Could not start chat")
            }
        }
    }

    fun postTextStatus(contentText: String) {
        val trimmed = contentText.trim()
        if (trimmed.isEmpty()) return
        viewModelScope.launch {
            runCatching {
                ApiClient.getService(tokenManager).createStatus(
                    CreateStatusRequest(type = "TEXT", contentText = trimmed, bgColor = "#101C35")
                )
                val sts = ApiClient.getService(tokenManager).getStatuses().statuses
                _statuses.value = sts
                localStorage.saveStatuses(sts)
                _statusBanner.value = "Status update published"
            }.onFailure { err ->
                _statusBanner.value = err.toUserMessage("Failed to post status")
            }
        }
    }

    fun updateProfile(displayName: String, about: String) {
        viewModelScope.launch {
            runCatching {
                val updated = ApiClient.getService(tokenManager)
                    .updateMe(UpdateProfileRequest(displayName.trim(), about.trim())).user
                _currentUser.value = updated
                _statusBanner.value = "Profile saved"
            }.onFailure { err ->
                _statusBanner.value = err.toUserMessage("Failed to update profile")
            }
        }
    }

    fun startCall(peerUserId: String?, peerName: String, conversationId: String?, isVideo: Boolean) {
        viewModelScope.launch {
            runCatching {
                val type = if (isVideo) "VIDEO" else "AUDIO"
                val call = ApiClient.getService(tokenManager)
                    .startCall(StartCallRequest(peerUserId, conversationId, type)).call
                _activeCall.value = ActiveCallUiState(
                    phase = CallPhase.OUTGOING,
                    callId = call.id,
                    peerUserId = peerUserId ?: "",
                    peerName = peerName,
                    isVideo = isVideo
                )
            }.onFailure { err ->
                _statusBanner.value = err.toUserMessage("Failed to place call")
            }
        }
    }

    fun acceptIncomingCall() {
        val state = _activeCall.value
        if (state.phase != CallPhase.INCOMING) return
        _activeCall.value = state.copy(phase = CallPhase.ACTIVE)
        SocketManager.emitCallSignal(
            "call:accept",
            JSONObject().apply {
                put("callId", state.callId)
                put("toUserId", state.peerUserId)
            }
        )
        val offerSdp = pendingOfferSdp
        val offerFrom = pendingOfferFromUserId
        if (offerSdp != null && offerFrom != null && pendingOfferCallId == state.callId) {
            pendingOfferSdp = null
            pendingOfferFromUserId = null
            pendingOfferCallId = null
            viewModelScope.launch {
                runCatching {
                    val ice = ApiClient.getService(tokenManager).getIceConfig().iceServers
                    webRTCManager.startPeerConnection(
                        callId = state.callId,
                        peerUserId = offerFrom,
                        iceServersDto = ice,
                        isVideo = state.isVideo,
                        localRenderer = pendingLocalRenderer,
                        remoteRenderer = pendingRemoteRenderer
                    )
                    webRTCManager.handleRemoteOffer(state.callId, offerFrom, offerSdp)
                }
            }
        }
    }

    fun rejectIncomingCall() {
        val state = _activeCall.value
        SocketManager.emitCallSignal(
            "call:reject",
            JSONObject().apply {
                put("callId", state.callId)
                put("toUserId", state.peerUserId)
            }
        )
        webRTCManager.close()
        _activeCall.value = ActiveCallUiState(phase = CallPhase.IDLE)
    }

    fun hangupActiveCall() {
        val state = _activeCall.value
        if (state.phase == CallPhase.IDLE) return
        SocketManager.emitCallSignal(
            "call:end",
            JSONObject().apply {
                put("callId", state.callId)
                put("toUserId", state.peerUserId)
            }
        )
        viewModelScope.launch {
            runCatching { ApiClient.getService(tokenManager).endCall(state.callId) }
            refreshCallsOnly()
        }
        webRTCManager.close()
        _activeCall.value = ActiveCallUiState(phase = CallPhase.IDLE)
    }

    fun toggleMuteCall() {
        val state = _activeCall.value
        val next = !state.isMuted
        webRTCManager.setMuted(next)
        _activeCall.value = state.copy(isMuted = next)
    }

    fun switchCallCamera() {
        webRTCManager.switchCamera()
    }

    fun logout() {
        val refresh = tokenManager.getRefreshToken()
        viewModelScope.launch {
            if (refresh != null) {
                runCatching { ApiClient.getService(tokenManager).logout(RefreshRequest(refresh)) }
            }
            SocketManager.disconnect()
            webRTCManager.close()
            tokenManager.clearTokens()
            localStorage.clearAll()
            _currentUser.value = null
            _selectedChat.value = null
            _chats.value = emptyList()
            _messages.value = emptyList()
        }
    }

    override fun onCleared() {
        super.onCleared()
        SocketManager.disconnect()
        webRTCManager.close()
    }
}
