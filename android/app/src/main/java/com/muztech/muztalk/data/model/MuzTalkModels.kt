package com.muztech.muztalk.data.model

data class UserDto(
    val id: String,
    val phoneNumber: String,
    val countryCode: String,
    val email: String? = null,
    val username: String?,
    val displayName: String,
    val about: String?,
    val avatarUrl: String?,
    val status: String,
    val isOnline: Boolean,
    val lastSeenAt: String?,
    val encryptionFingerprint: String?,
    val blockScreenCapture: Boolean = false
)

data class SendEmailOtpRequest(
    val email: String,
    val username: String? = null
)

data class SendEmailOtpResponse(
    val sent: Boolean,
    val email: String,
    val expiresInSeconds: Int,
    val provider: String? = null,
    val devOtpPreview: String? = null
)

data class VerifyEmailOtpRequest(
    val email: String,
    val otp: String,
    val username: String? = null,
    val displayName: String? = null,
    val password: String? = null,
    val deviceName: String = "MuzTalk Android SDK 36",
    val platform: String = "Android"
)

data class PasswordLoginRequest(
    val identifier: String,
    val password: String,
    val deviceName: String = "MuzTalk Android SDK 36",
    val platform: String = "Android"
)

data class PasswordLoginResponse(
    val requiresOtp: Boolean = true,
    val email: String,
    val expiresInSeconds: Int = 600,
    val provider: String? = null,
    val devOtpPreview: String? = null
)

data class SecurityPolicyDto(
    val blockScreenCapture: Boolean = false,
    val globalBlockScreenCapture: Boolean = false
)

data class SendOtpRequest(
    val countryCode: String,
    val phoneNumber: String
)

data class SendOtpResponse(
    val sent: Boolean,
    val phoneNumber: String,
    val expiresInSeconds: Int,
    val devOtpPreview: String?
)

data class VerifyOtpRequest(
    val phoneNumber: String,
    val otp: String,
    val displayName: String? = null,
    val deviceName: String = "MuzTalk Android SDK 36",
    val platform: String = "Android"
)

data class AuthResponse(
    val user: UserDto,
    val deviceId: String,
    val accessToken: String,
    val refreshToken: String
)

data class RefreshRequest(val refreshToken: String)
data class RefreshResponse(val accessToken: String, val refreshToken: String)

data class MessageReactionDto(
    val id: String,
    val messageId: String,
    val userId: String,
    val emoji: String
)

data class MessageAttachmentDto(
    val id: String,
    val mediaFileId: String,
    val url: String,
    val originalName: String,
    val mimeType: String,
    val sizeBytes: Long
)

data class MessageDto(
    val id: String,
    val clientMessageId: String?,
    val conversationId: String,
    val senderId: String,
    val senderName: String?,
    val type: String,
    val text: String,
    val isStarred: Boolean,
    val isPinned: Boolean,
    val isEdited: Boolean,
    val receiptStatus: String,
    val reactions: List<MessageReactionDto> = emptyList(),
    val attachments: List<MessageAttachmentDto> = emptyList(),
    val createdAt: String
)

data class ChatListItemDto(
    val id: String,
    val type: String,
    val title: String,
    val subtitle: String?,
    val avatarUrl: String?,
    val peerUserId: String?,
    val isOnline: Boolean?,
    val isPinned: Boolean,
    val isArchived: Boolean,
    val isMuted: Boolean,
    val unreadCount: Int,
    val lastMessage: MessageDto?,
    val lastMessageAt: String?
)

data class ChatsResponse(val chats: List<ChatListItemDto>)
data class MessagesResponse(val messages: List<MessageDto>)
data class UsersResponse(val users: List<UserDto>)
data class UserMeResponse(
    val user: UserDto,
    val securityPolicy: SecurityPolicyDto? = null
)

data class StatusDto(
    val id: String,
    val userId: String,
    val userName: String,
    val type: String,
    val contentText: String?,
    val mediaUrl: String?,
    val bgColor: String?,
    val viewsCount: Int,
    val viewedByMe: Boolean,
    val createdAt: String
)

data class StatusesResponse(val statuses: List<StatusDto>)

data class CreateStatusRequest(
    val type: String = "TEXT",
    val contentText: String?,
    val bgColor: String? = "#101C35"
)

data class CommunityGroupDto(
    val groupId: String,
    val conversationId: String,
    val name: String,
    val memberCount: Int,
    val isAnnouncement: Boolean
)

data class CommunityDto(
    val id: String,
    val name: String,
    val description: String,
    val inviteCode: String,
    val groups: List<CommunityGroupDto>
)

data class CommunitiesResponse(val communities: List<CommunityDto>)

data class CallDto(
    val id: String,
    val conversationId: String?,
    val initiatorId: String,
    val initiatorName: String,
    val peerId: String?,
    val peerName: String,
    val type: String,
    val status: String,
    val startedAt: String,
    val durationSec: Int
)

data class CallsHistoryResponse(val calls: List<CallDto>)
data class StartCallRequest(val peerId: String?, val conversationId: String?, val type: String)
data class StartCallResponse(val call: CallDto)

data class IceServerDto(
    val urls: String,
    val username: String? = null,
    val credential: String? = null
)

data class IceConfigResponse(val iceServers: List<IceServerDto>)

data class RegisterKeysRequest(
    val identityKeyPub: String,
    val signedPreKeyPub: String,
    val signedPreKeySig: String,
    val fingerprint: String
)

data class RegisterFcmRequest(val fcmToken: String, val platform: String = "android")
data class CreateDirectChatRequest(val peerUserId: String)
data class CreateDirectChatResponse(val chat: ChatListItemDto)
data class UpdateProfileRequest(val displayName: String, val about: String)
