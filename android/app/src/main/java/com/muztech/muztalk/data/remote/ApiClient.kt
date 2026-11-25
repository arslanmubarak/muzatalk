package com.muztech.muztalk.data.remote

import com.muztech.muztalk.data.local.TokenManager
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import org.json.JSONObject
import retrofit2.HttpException
import java.io.IOException
import java.util.concurrent.TimeUnit

object ApiClient {
    @Volatile
    private var cachedBaseUrl: String? = null
    @Volatile
    private var cachedService: MuzTalkApiService? = null

    fun getService(tokenManager: TokenManager): MuzTalkApiService {
        val currentBaseUrl = tokenManager.getBaseUrl()
        val existing = cachedService
        if (existing != null && cachedBaseUrl == currentBaseUrl) {
            return existing
        }

        val authInterceptor = Interceptor { chain ->
            val reqBuilder = chain.request().newBuilder()
            tokenManager.getAccessToken()?.let { token ->
                reqBuilder.addHeader("Authorization", "Bearer $token")
            }
            chain.proceed(reqBuilder.build())
        }

        // Fail with a readable message when the server answers with HTML / non-JSON
        val jsonGuard = Interceptor { chain ->
            val req = chain.request()
            val res = chain.proceed(req)
            val type = res.header("Content-Type").orEmpty()
            if (res.isSuccessful && res.code != 204 && !type.contains("json", ignoreCase = true)) {
                res.close()
                throw IOException("Unable to connect right now. Please try again in a moment.")
            }
            res
        }

        val logger = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        val client = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(jsonGuard)
            .addInterceptor(logger)
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()

        val retrofit = Retrofit.Builder()
            .baseUrl(currentBaseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        val service = retrofit.create(MuzTalkApiService::class.java)
        cachedBaseUrl = currentBaseUrl
        cachedService = service
        return service
    }

    fun reset() {
        cachedBaseUrl = null
        cachedService = null
    }
}

/** Turns any network/API exception into a short, user-friendly message (never technical details). */
fun Throwable.toUserMessage(fallback: String = "Something went wrong"): String {
    if (this is HttpException) {
        val body = runCatching { response()?.errorBody()?.string() }.getOrNull()
        val serverMsg = runCatching { JSONObject(body ?: "").optString("error") }.getOrNull()
        if (!serverMsg.isNullOrBlank()) return serverMsg
        return if (code() >= 500) "Service is busy. Please try again shortly." else fallback
    }
    val technical = this is com.google.gson.JsonParseException ||
        this is java.net.UnknownHostException ||
        this is java.net.SocketTimeoutException ||
        this is java.net.ConnectException ||
        this is javax.net.ssl.SSLException ||
        (message?.contains("JsonReader", true) == true)
    if (technical) return "Unable to connect right now. Check your internet and try again."
    val msg = message.orEmpty()
    val looksTechnical = listOf("http", "json", "api", "backend", "smtp", "server").any { msg.contains(it, true) }
    return if (msg.isBlank() || looksTechnical) fallback else msg
}
