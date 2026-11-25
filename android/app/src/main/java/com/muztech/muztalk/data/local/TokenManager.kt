package com.muztech.muztalk.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.muztech.muztalk.BuildConfig

class TokenManager(context: Context) {
    private val prefs: SharedPreferences = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "muztalk_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (_: Exception) {
        context.getSharedPreferences("muztalk_fallback_prefs", Context.MODE_PRIVATE)
    }

    fun getAccessToken(): String? = prefs.getString(KEY_ACCESS, null)
    fun getRefreshToken(): String? = prefs.getString(KEY_REFRESH, null)

    fun saveTokens(access: String, refresh: String) {
        prefs.edit().putString(KEY_ACCESS, access).putString(KEY_REFRESH, refresh).apply()
    }

    fun clearTokens() {
        prefs.edit().remove(KEY_ACCESS).remove(KEY_REFRESH).apply()
    }

    // The server address is built into the app; users never configure it.
    fun getBaseUrl(): String = normalize(null)

    fun setBaseUrl(url: String) {
        prefs.edit().putString(KEY_BASE_URL, normalize(url)).apply()
    }

    /**
     * Fixes the classic cause of "Use JsonReader.setLenient(true)...":
     * http:// on a public domain gets redirected to https://, OkHttp turns the POST
     * into a GET and the server answers with HTML instead of JSON.
     * So remote hosts are always forced to https://.
     */
    private fun normalize(raw: String?): String {
        var u = raw?.trim().orEmpty()
        if (u.isEmpty()) u = BuildConfig.DEFAULT_BASE_URL
        if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://$u"
        val host = u.substringAfter("://").substringBefore("/").substringBefore(":")
        val isLocal = host == "localhost" || host == "10.0.2.2" || host.startsWith("192.168.") || host.startsWith("127.")
        if (!isLocal && u.startsWith("http://")) u = "https://" + u.removePrefix("http://")
        return if (u.endsWith("/")) u else "$u/"
    }

    companion object {
        private const val KEY_ACCESS = "access_token"
        private const val KEY_REFRESH = "refresh_token"
        private const val KEY_BASE_URL = "base_url"
    }
}
