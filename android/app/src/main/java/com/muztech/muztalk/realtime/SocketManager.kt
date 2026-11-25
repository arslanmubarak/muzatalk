package com.muztech.muztalk.realtime

import com.google.gson.Gson
import com.muztech.muztalk.data.model.MessageDto
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject

object SocketManager {
    private var socket: Socket? = null
    private val gson = Gson()

    interface Listener {
        fun onConnectionChanged(connected: Boolean)
        fun onNewMessage(message: MessageDto)
        fun onTyping(conversationId: String, userId: String, typing: Boolean)
        fun onIncomingCall(callId: String, fromUserId: String, fromName: String, type: String)
        fun onCallAccepted(callId: String)
        fun onCallEnded(callId: String)
        fun onCallOffer(callId: String, fromUserId: String, sdpJson: JSONObject)
        fun onCallAnswer(callId: String, sdpJson: JSONObject)
        fun onIceCandidate(callId: String, candidateJson: JSONObject)
        fun onSecurityPolicyUpdated(blockScreenCapture: Boolean)
    }

    fun connect(baseUrl: String, accessToken: String, listener: Listener) {
        disconnect()
        val cleanUrl = baseUrl.trimEnd('/')
        val opts = IO.Options().apply {
            auth = mapOf("token" to accessToken)
            transports = arrayOf("websocket", "polling")
            reconnection = true
        }
        val s = IO.socket(cleanUrl, opts)
        socket = s

        s.on(Socket.EVENT_CONNECT) { listener.onConnectionChanged(true) }
        s.on(Socket.EVENT_DISCONNECT) { listener.onConnectionChanged(false) }

        s.on("message:new") { args ->
            if (args.isNotEmpty()) {
                val msg = gson.fromJson(args[0].toString(), MessageDto::class.java)
                listener.onNewMessage(msg)
            }
        }

        s.on("user:typing") { args ->
            if (args.isNotEmpty()) {
                val obj = args[0] as JSONObject
                listener.onTyping(obj.optString("conversationId"), obj.optString("userId"), true)
            }
        }

        s.on("user:stop_typing") { args ->
            if (args.isNotEmpty()) {
                val obj = args[0] as JSONObject
                listener.onTyping(obj.optString("conversationId"), obj.optString("userId"), false)
            }
        }

        s.on("call:incoming") { args ->
            if (args.isNotEmpty()) {
                val obj = args[0] as JSONObject
                listener.onIncomingCall(
                    obj.optString("callId"),
                    obj.optString("fromUserId"),
                    obj.optString("fromName", "MuzTalk User"),
                    obj.optString("type", "AUDIO")
                )
            }
        }

        s.on("call:accept") { args ->
            if (args.isNotEmpty()) {
                val obj = args[0] as JSONObject
                listener.onCallAccepted(obj.optString("callId"))
            }
        }

        s.on("call:reject") { args ->
            if (args.isNotEmpty()) {
                val obj = args[0] as JSONObject
                listener.onCallEnded(obj.optString("callId"))
            }
        }

        s.on("call:end") { args ->
            if (args.isNotEmpty()) {
                val obj = args[0] as JSONObject
                listener.onCallEnded(obj.optString("callId"))
            }
        }

        s.on("call:offer") { args ->
            if (args.isNotEmpty()) {
                val obj = args[0] as JSONObject
                obj.optJSONObject("sdp")?.let { sdp ->
                    listener.onCallOffer(obj.optString("callId"), obj.optString("fromUserId"), sdp)
                }
            }
        }

        s.on("call:answer") { args ->
            if (args.isNotEmpty()) {
                val obj = args[0] as JSONObject
                obj.optJSONObject("sdp")?.let { sdp ->
                    listener.onCallAnswer(obj.optString("callId"), sdp)
                }
            }
        }

        s.on("call:ice_candidate") { args ->
            if (args.isNotEmpty()) {
                val obj = args[0] as JSONObject
                obj.optJSONObject("candidate")?.let { cand ->
                    listener.onIceCandidate(obj.optString("callId"), cand)
                }
            }
        }

        s.on("security:policy_updated") { args ->
            if (args.isNotEmpty()) {
                val obj = args[0] as JSONObject
                listener.onSecurityPolicyUpdated(obj.optBoolean("blockScreenCapture", false))
            }
        }

        s.connect()
    }

    fun sendMessage(
        clientMessageId: String,
        conversationId: String,
        text: String,
        type: String = "TEXT",
        attachments: List<com.muztech.muztalk.data.model.MessageAttachmentDto> = emptyList()
    ) {
        val payload = JSONObject().apply {
            put("clientMessageId", clientMessageId)
            put("conversationId", conversationId)
            put("type", type)
            put("text", text)
            put("isEncrypted", true)
            if (attachments.isNotEmpty()) {
                val arr = org.json.JSONArray()
                attachments.forEach { att ->
                    arr.put(JSONObject().apply {
                        put("id", att.id)
                        put("mediaFileId", att.mediaFileId)
                        put("url", att.url)
                        put("originalName", att.originalName)
                        put("mimeType", att.mimeType)
                        put("sizeBytes", att.sizeBytes)
                    })
                }
                put("attachments", arr)
            }
        }
        socket?.emit("message:send", payload)
    }

    fun emitTyping(conversationId: String, typing: Boolean) {
        val payload = JSONObject().apply { put("conversationId", conversationId) }
        socket?.emit(if (typing) "user:typing" else "user:stop_typing", payload)
    }

    fun emitRead(conversationId: String) {
        val payload = JSONObject().apply { put("conversationId", conversationId) }
        socket?.emit("message:read", payload)
    }

    fun emitCallSignal(event: String, payload: JSONObject) {
        socket?.emit(event, payload)
    }

    fun disconnect() {
        socket?.disconnect()
        socket?.off()
        socket = null
    }
}
