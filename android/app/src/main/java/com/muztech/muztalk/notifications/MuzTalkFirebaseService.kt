package com.muztech.muztalk.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.muztech.muztalk.MainActivity
import com.muztech.muztalk.R
import com.muztech.muztalk.data.local.TokenManager
import com.muztech.muztalk.data.model.RegisterFcmRequest
import com.muztech.muztalk.data.remote.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MuzTalkFirebaseService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val tokenManager = TokenManager(applicationContext)
        if (tokenManager.getAccessToken() != null) {
            CoroutineScope(Dispatchers.IO).launch {
                runCatching {
                    ApiClient.getService(tokenManager)
                        .registerFcmDevice(RegisterFcmRequest(fcmToken = token, platform = "android"))
                }
            }
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        val title = remoteMessage.notification?.title ?: remoteMessage.data["title"] ?: "MuzTalk"
        val body = remoteMessage.notification?.body ?: remoteMessage.data["body"] ?: "New activity"
        val isCall = remoteMessage.data["category"] == "call"
        showNotification(title, body, isCall)
    }

    private fun showNotification(title: String, body: String, isCall: Boolean) {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = if (isCall) CHANNEL_CALLS else CHANNEL_MESSAGES

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                if (isCall) "Incoming Calls" else "Messages",
                if (isCall) NotificationManager.IMPORTANCE_HIGH else NotificationManager.IMPORTANCE_DEFAULT
            )
            manager.createNotificationChannel(channel)
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(if (isCall) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
            .build()

        manager.notify((System.currentTimeMillis() % 10000).toInt(), notification)
    }

    companion object {
        const val CHANNEL_MESSAGES = "muztalk_messages"
        const val CHANNEL_CALLS = "muztalk_calls"
    }
}
