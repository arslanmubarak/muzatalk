package com.muztech.muztalk.data.local

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.muztech.muztalk.crypto.EncryptedFileVault
import com.muztech.muztalk.data.model.CallDto
import com.muztech.muztalk.data.model.ChatListItemDto
import com.muztech.muztalk.data.model.MessageDto
import com.muztech.muztalk.data.model.StatusDto
import java.io.File

/**
 * Encrypted mobile device storage manager.
 * Every chat, message history, status, call log, and voice-note/media file
 * is stored inside the user's dedicated MuzTalk/ mobile folder encrypted with AES-256-GCM.
 */
class LocalStorageManager(context: Context) {

    private val gson = Gson()
    private val vault = EncryptedFileVault(context)
    private val tempRecordDir = File(context.cacheDir, "muztalk_tmp_capture").apply { mkdirs() }

    fun createTempCaptureFile(filename: String): File = File(tempRecordDir, filename)

    fun saveEncryptedVoiceNote(tempPlainFile: File, encryptedFileName: String): File {
        val target = File(vault.voiceNotesDir, "$encryptedFileName.enc")
        vault.encryptFileAndDeleteSource(tempPlainFile, target)
        return target
    }

    fun decryptVoiceNoteToTemp(encryptedFile: File): File? {
        return runCatching {
            val plain = vault.readDecryptedBytes(encryptedFile)
            val tmp = File(tempRecordDir, "play_${System.currentTimeMillis()}.m4a")
            tmp.writeBytes(plain)
            tmp
        }.getOrNull()
    }

    fun saveChats(chats: List<ChatListItemDto>) {
        writeEncryptedJson("chats.enc", chats)
    }

    fun loadChats(): List<ChatListItemDto> {
        val type = object : TypeToken<List<ChatListItemDto>>() {}.type
        return readEncryptedJson("chats.enc", type) ?: emptyList()
    }

    fun saveMessages(conversationId: String, messages: List<MessageDto>) {
        val safeId = conversationId.replace(Regex("[^a-zA-Z0-9_-]"), "_")
        writeEncryptedJson("msgs_$safeId.enc", messages)
    }

    fun loadMessages(conversationId: String): List<MessageDto> {
        val safeId = conversationId.replace(Regex("[^a-zA-Z0-9_-]"), "_")
        val type = object : TypeToken<List<MessageDto>>() {}.type
        return readEncryptedJson("msgs_$safeId.enc", type) ?: emptyList()
    }

    fun saveStatuses(statuses: List<StatusDto>) {
        writeEncryptedJson("statuses.enc", statuses)
    }

    fun loadStatuses(): List<StatusDto> {
        val type = object : TypeToken<List<StatusDto>>() {}.type
        return readEncryptedJson("statuses.enc", type) ?: emptyList()
    }

    fun saveCalls(calls: List<CallDto>) {
        writeEncryptedJson("calls.enc", calls)
    }

    fun loadCalls(): List<CallDto> {
        val type = object : TypeToken<List<CallDto>>() {}.type
        return readEncryptedJson("calls.enc", type) ?: emptyList()
    }

    fun getVaultSummary(): EncryptedFileVault.VaultSummary = vault.getSummary()

    fun clearAll() {
        vault.clearAll()
        tempRecordDir.listFiles()?.forEach { it.delete() }
    }

    private fun writeEncryptedJson(filename: String, value: Any) {
        runCatching {
            val file = File(vault.chatsDir, filename)
            vault.writeEncryptedText(file, gson.toJson(value))
        }
    }

    private fun <T> readEncryptedJson(filename: String, type: java.lang.reflect.Type): T? {
        return runCatching {
            val file = File(vault.chatsDir, filename)
            if (!file.exists()) return null
            val json = vault.readDecryptedText(file)
            gson.fromJson<T>(json, type)
        }.getOrNull()
    }
}
