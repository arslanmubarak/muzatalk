package com.muztech.muztalk.data.remote

import com.muztech.muztalk.data.model.*
import okhttp3.MultipartBody
import retrofit2.http.*

interface MuzTalkApiService {
    @POST("api/auth/send-email-otp")
    suspend fun sendEmailOtp(@Body body: SendEmailOtpRequest): SendEmailOtpResponse

    @POST("api/auth/verify-email-otp")
    suspend fun verifyEmailOtp(@Body body: VerifyEmailOtpRequest): AuthResponse

    @POST("api/auth/login-password")
    suspend fun loginWithPassword(@Body body: PasswordLoginRequest): PasswordLoginResponse

    @POST("api/auth/send-otp")
    suspend fun sendOtp(@Body body: SendOtpRequest): SendOtpResponse

    @POST("api/auth/verify-otp")
    suspend fun verifyOtp(@Body body: VerifyOtpRequest): AuthResponse

    @POST("api/auth/refresh")
    suspend fun refreshToken(@Body body: RefreshRequest): RefreshResponse

    @POST("api/auth/logout")
    suspend fun logout(@Body body: RefreshRequest): Map<String, Boolean>

    @GET("api/security-policy")
    suspend fun getSecurityPolicy(): SecurityPolicyDto

    @GET("api/users/me")
    suspend fun getMe(): UserMeResponse

    @PUT("api/users/me")
    suspend fun updateMe(@Body body: UpdateProfileRequest): UserMeResponse

    @GET("api/users/search")
    suspend fun searchUsers(@Query("q") query: String = ""): UsersResponse

    @POST("api/users/me/keys")
    suspend fun registerKeys(@Body body: RegisterKeysRequest): Map<String, Any>

    @GET("api/chats")
    suspend fun getChats(@Query("q") query: String = ""): ChatsResponse

    @POST("api/chats")
    suspend fun createDirectChat(@Body body: CreateDirectChatRequest): CreateDirectChatResponse

    @GET("api/chats/{id}/messages")
    suspend fun getMessages(@Path("id") chatId: String): MessagesResponse

    @GET("api/status")
    suspend fun getStatuses(): StatusesResponse

    @POST("api/status")
    suspend fun createStatus(@Body body: CreateStatusRequest): Map<String, Any>

    @GET("api/communities")
    suspend fun getCommunities(): CommunitiesResponse

    @GET("api/calls/history")
    suspend fun getCallsHistory(): CallsHistoryResponse

    @POST("api/calls")
    suspend fun startCall(@Body body: StartCallRequest): StartCallResponse

    @POST("api/calls/{id}/end")
    suspend fun endCall(@Path("id") callId: String): Map<String, Any>

    @GET("api/calls/ice-config")
    suspend fun getIceConfig(): IceConfigResponse

    @POST("api/devices/register")
    suspend fun registerFcmDevice(@Body body: RegisterFcmRequest): Map<String, Any>

    @Multipart
    @POST("api/media/upload")
    suspend fun uploadMedia(@Part file: MultipartBody.Part): Map<String, Any>
}
