package com.muztech.muztalk.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.muztech.muztalk.data.model.*
import com.muztech.muztalk.ui.theme.MuzBrandGradient
import com.muztech.muztalk.ui.theme.MuzDanger
import com.muztech.muztalk.ui.theme.MuzMint
import com.muztech.muztalk.ui.theme.MuzNavy
import com.muztech.muztalk.ui.theme.MuzTeal
import com.muztech.muztalk.ui.viewmodel.ActiveCallUiState
import com.muztech.muztalk.ui.viewmodel.CallPhase
import com.muztech.muztalk.ui.viewmodel.MuzTalkViewModel
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainHomeScreen(viewModel: MuzTalkViewModel) {
    val currentUser by viewModel.currentUser.collectAsState()
    val selectedChat by viewModel.selectedChat.collectAsState()
    val activeCall by viewModel.activeCall.collectAsState()
    val banner by viewModel.statusBanner.collectAsState()

    var selectedTab by remember { mutableIntStateOf(0) }
    var showNewChatSheet by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
        if (selectedChat != null) {
            ChatThreadScreen(
                chat = selectedChat!!,
                viewModel = viewModel
            )
        } else {
            Scaffold(
                topBar = {
                    TopAppBar(
                        colors = TopAppBarDefaults.topAppBarColors(
                            containerColor = MaterialTheme.colorScheme.background,
                            titleContentColor = MaterialTheme.colorScheme.onBackground,
                            actionIconContentColor = MuzTeal
                        ),
                        title = {
                            Column {
                                Text("MuzTalk", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
                                Text(
                                    text = currentUser?.displayName ?: "Welcome",
                                    fontSize = 12.sp,
                                    color = MuzTeal,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        },
                        actions = {
                            IconButton(onClick = { viewModel.refreshAllData() }) {
                                Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                            }
                        }
                    )
                },
                floatingActionButton = {
                    if (selectedTab == 0) {
                        FloatingActionButton(
                            onClick = { showNewChatSheet = true },
                            containerColor = MuzTeal,
                            contentColor = Color.White,
                            shape = RoundedCornerShape(18.dp)
                        ) {
                            Icon(Icons.Default.Chat, contentDescription = "New Chat")
                        }
                    }
                },
                bottomBar = {
                    val navColors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MuzTeal,
                        selectedTextColor = MuzTeal,
                        indicatorColor = MuzTeal.copy(alpha = 0.16f),
                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                        NavigationBarItem(
                            selected = selectedTab == 0,
                            onClick = { selectedTab = 0 },
                            colors = navColors,
                            icon = { Icon(Icons.Default.ChatBubble, contentDescription = null) },
                            label = { Text("Chats") }
                        )
                        NavigationBarItem(
                            selected = selectedTab == 1,
                            onClick = { selectedTab = 1 },
                            colors = navColors,
                            icon = { Icon(Icons.Default.AutoAwesome, contentDescription = null) },
                            label = { Text("Updates") }
                        )
                        NavigationBarItem(
                            selected = selectedTab == 2,
                            onClick = { selectedTab = 2 },
                            colors = navColors,
                            icon = { Icon(Icons.Default.Groups, contentDescription = null) },
                            label = { Text("Communities") }
                        )
                        NavigationBarItem(
                            selected = selectedTab == 3,
                            onClick = { selectedTab = 3 },
                            colors = navColors,
                            icon = { Icon(Icons.Default.Call, contentDescription = null) },
                            label = { Text("Calls") }
                        )
                        NavigationBarItem(
                            selected = selectedTab == 4,
                            onClick = { selectedTab = 4 },
                            colors = navColors,
                            icon = { Icon(Icons.Default.Settings, contentDescription = null) },
                            label = { Text("Settings") }
                        )
                    }
                }
            ) { innerPadding ->
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(innerPadding)
                ) {
                    when (selectedTab) {
                        0 -> ChatsTab(viewModel)
                        1 -> UpdatesTab(viewModel)
                        2 -> CommunitiesTab(viewModel)
                        3 -> CallsTab(viewModel)
                        4 -> SettingsTab(viewModel)
                    }
                }
            }
        }

        if (showNewChatSheet) {
            NewChatDialog(
                viewModel = viewModel,
                onDismiss = { showNewChatSheet = false }
            )
        }

        if (activeCall.phase != CallPhase.IDLE) {
            CallScreenOverlay(activeCall = activeCall, viewModel = viewModel)
        }

        if (!banner.isNullOrBlank()) {
            Snackbar(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(16.dp),
                containerColor = MuzNavy,
                contentColor = Color.White,
                shape = RoundedCornerShape(14.dp),
                action = {
                    TextButton(onClick = { viewModel.clearBanner() }) {
                        Text("OK", color = MuzMint)
                    }
                }
            ) {
                Text(banner ?: "")
            }
        }
    }
}

@Composable
private fun ChatsTab(viewModel: MuzTalkViewModel) {
    val chats by viewModel.chats.collectAsState()
    var query by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = query,
            onValueChange = {
                query = it
                viewModel.refreshChatsOnly(it)
            },
            placeholder = { Text("Search chats...") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            singleLine = true,
            shape = RoundedCornerShape(26.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = MuzTeal,
                unfocusedBorderColor = Color.Transparent,
                focusedContainerColor = MaterialTheme.colorScheme.surface,
                unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                cursorColor = MuzTeal
            ),
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
        )

        LazyColumn(modifier = Modifier.fillMaxSize()) {
            items(chats, key = { it.id }) { chat ->
                ListItem(
                    modifier = Modifier.clickable { viewModel.openChat(chat) },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    leadingContent = {
                        Box(
                            modifier = Modifier
                                .size(50.dp)
                                .clip(CircleShape)
                                .background(MuzBrandGradient),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = chat.title.take(1).uppercase(),
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp
                            )
                        }
                    },
                    headlineContent = {
                        Text(chat.title, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    },
                    supportingContent = {
                        Text(
                            text = chat.lastMessage?.text ?: chat.subtitle ?: "No messages yet",
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    },
                    trailingContent = {
                        Column(horizontalAlignment = Alignment.End) {
                            if (chat.isOnline == true) {
                                Text("Online", fontSize = 11.sp, color = MuzTeal, fontWeight = FontWeight.Medium)
                            }
                            if (chat.unreadCount > 0) {
                                Spacer(modifier = Modifier.height(4.dp))
                                Badge(containerColor = MuzTeal, contentColor = Color.White) {
                                    Text(chat.unreadCount.toString())
                                }
                            }
                        }
                    }
                )
                HorizontalDivider(thickness = 0.5.dp, color = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.padding(start = 82.dp))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChatThreadScreen(chat: ChatListItemDto, viewModel: MuzTalkViewModel) {
    val currentUser by viewModel.currentUser.collectAsState()
    val messages by viewModel.messages.collectAsState()
    val typingMap by viewModel.typingByChat.collectAsState()
    val isRecording by viewModel.isRecordingVoiceNote.collectAsState()

    var inputText by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    actionIconContentColor = MuzTeal,
                    navigationIconContentColor = MaterialTheme.colorScheme.onSurface
                ),
                navigationIcon = {
                    IconButton(onClick = { viewModel.closeChat() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                title = {
                    Column {
                        Text(chat.title, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val isTyping = typingMap[chat.id] == true
                        Text(
                            text = if (isTyping) "typing..." else if (chat.isOnline == true) "online" else "end-to-end encrypted",
                            fontSize = 12.sp,
                            color = if (isTyping || chat.isOnline == true) MuzTeal else Color.Gray
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = { viewModel.startCall(chat.peerUserId, chat.title, chat.id, isVideo = false) }
                    ) {
                        Icon(Icons.Default.Call, contentDescription = "Audio Call")
                    }
                    IconButton(
                        onClick = { viewModel.startCall(chat.peerUserId, chat.title, chat.id, isVideo = true) }
                    ) {
                        Icon(Icons.Default.Videocam, contentDescription = "Video Call")
                    }
                }
            )
        },
        bottomBar = {
            Surface(tonalElevation = 3.dp) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 10.dp, vertical = 8.dp)
                        .navigationBarsPadding(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = inputText,
                        onValueChange = {
                            inputText = it
                            viewModel.notifyTyping(it.isNotBlank())
                        },
                        placeholder = { Text(if (isRecording) "Recording voice note..." else "Message...") },
                        singleLine = true,
                        shape = RoundedCornerShape(24.dp),
                        modifier = Modifier.weight(1f)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    if (inputText.isBlank()) {
                        FilledIconButton(
                            onClick = {
                                if (isRecording) viewModel.stopAndSendVoiceNote()
                                else viewModel.startVoiceNoteRecording()
                            },
                            colors = IconButtonDefaults.filledIconButtonColors(
                                containerColor = if (isRecording) Color(0xFFEF4444) else MuzNavy
                            )
                        ) {
                            Icon(
                                imageVector = if (isRecording) Icons.Default.Stop else Icons.Default.Mic,
                                contentDescription = "Voice Note",
                                tint = Color.White
                            )
                        }
                    } else {
                        FilledIconButton(
                            onClick = {
                                viewModel.sendTextMessage(inputText)
                                inputText = ""
                            },
                            colors = IconButtonDefaults.filledIconButtonColors(containerColor = MuzTeal)
                        ) {
                            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send", tint = Color.White)
                        }
                    }
                }
            }
        }
    ) { padding ->
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .padding(padding)
                .padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item { Spacer(modifier = Modifier.height(6.dp)) }
            items(messages, key = { it.id }) { msg ->
                val mine = msg.senderId == currentUser?.id
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = if (mine) Alignment.End else Alignment.Start
                ) {
                    Surface(
                        color = if (mine) MuzTeal else MaterialTheme.colorScheme.surface,
                        shadowElevation = if (mine) 0.dp else 1.dp,
                        shape = RoundedCornerShape(
                            topStart = 18.dp,
                            topEnd = 18.dp,
                            bottomStart = if (mine) 18.dp else 4.dp,
                            bottomEnd = if (mine) 4.dp else 18.dp
                        ),
                        modifier = Modifier.widthIn(max = 290.dp)
                    ) {
                        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 9.dp)) {
                            if (!mine && !msg.senderName.isNullOrBlank() && chat.type != "DIRECT") {
                                Text(
                                    text = msg.senderName,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MuzTeal
                                )
                            }
                            if (msg.type == "VOICE_NOTE") {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(
                                        Icons.Default.GraphicEq,
                                        contentDescription = null,
                                        tint = if (mine) Color.White else MuzTeal,
                                        modifier = Modifier.size(18.dp)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "Voice message",
                                        color = if (mine) Color.White else MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            } else {
                                Text(
                                    text = msg.text,
                                    color = if (mine) Color.White else MaterialTheme.colorScheme.onSurface
                                )
                            }
                            if (mine) {
                                Text(
                                    text = when (msg.receiptStatus) {
                                        "READ" -> "✓✓ Read"
                                        "DELIVERED" -> "✓✓"
                                        else -> "✓"
                                    },
                                    fontSize = 10.sp,
                                    color = Color.White.copy(alpha = 0.85f),
                                    modifier = Modifier.align(Alignment.End)
                                )
                            }
                        }
                    }
                }
            }
            item { Spacer(modifier = Modifier.height(6.dp)) }
        }
    }
}

@Composable
private fun UpdatesTab(viewModel: MuzTalkViewModel) {
    val statuses by viewModel.statuses.collectAsState()
    var newStatusText by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Updates", fontWeight = FontWeight.Bold, fontSize = 22.sp)
        Text("Share what you are up to. Disappears in 24 hours.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(modifier = Modifier.height(10.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = newStatusText,
                onValueChange = { newStatusText = it },
                placeholder = { Text("Share an update...") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            Button(
                onClick = {
                    viewModel.postTextStatus(newStatusText)
                    newStatusText = ""
                },
                colors = ButtonDefaults.buttonColors(containerColor = MuzTeal)
            ) {
                Text("Post")
            }
        }

        Spacer(modifier = Modifier.height(14.dp))
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(statuses, key = { it.id }) { status ->
                Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(status.userName, fontWeight = FontWeight.Bold)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(status.contentText ?: "Media Update")
                        Spacer(modifier = Modifier.height(6.dp))
                        Text("${status.viewsCount} views", fontSize = 12.sp, color = Color.Gray)
                    }
                }
            }
        }
    }
}

@Composable
private fun CommunitiesTab(viewModel: MuzTalkViewModel) {
    val communities by viewModel.communities.collectAsState()

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(communities, key = { it.id }) { community ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(community.name, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(community.description, fontSize = 13.sp, color = Color.Gray)
                    Spacer(modifier = Modifier.height(8.dp))
                    community.groups.forEach { grp ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = if (grp.isAnnouncement) "Announcements: ${grp.name}" else grp.name,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium
                            )
                            Text("${grp.memberCount} members", fontSize = 12.sp, color = MuzTeal)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CallsTab(viewModel: MuzTalkViewModel) {
    val calls by viewModel.callsHistory.collectAsState()

    LazyColumn(modifier = Modifier.fillMaxSize()) {
        items(calls, key = { it.id }) { call ->
            ListItem(
                leadingContent = {
                    Icon(
                        imageVector = if (call.type.contains("VIDEO")) Icons.Default.Videocam else Icons.Default.Call,
                        contentDescription = null,
                        tint = MuzTeal
                    )
                },
                headlineContent = { Text(call.peerName, fontWeight = FontWeight.SemiBold) },
                supportingContent = { Text("${call.type.lowercase().replaceFirstChar { it.uppercase() }} • ${call.status.lowercase().replaceFirstChar { it.uppercase() }} • ${call.durationSec}s") },
                trailingContent = {
                    IconButton(onClick = {
                        viewModel.startCall(
                            peerUserId = call.peerId,
                            peerName = call.peerName,
                            conversationId = call.conversationId,
                            isVideo = call.type.contains("VIDEO")
                        )
                    }) {
                        Icon(Icons.Default.Call, contentDescription = "Redial", tint = MuzTeal)
                    }
                }
            )
            HorizontalDivider(thickness = 0.5.dp)
        }
    }
}

@Composable
private fun SettingsTab(viewModel: MuzTalkViewModel) {
    val user by viewModel.currentUser.collectAsState()
    val darkTheme by viewModel.darkTheme.collectAsState()
    val isSocketConnected by viewModel.isSocketConnected.collectAsState()
    val vaultSummary by viewModel.vaultSummary.collectAsState()

    LaunchedEffect(Unit) {
        viewModel.refreshVaultSummary()
    }

    var name by remember(user?.id) { mutableStateOf(user?.displayName ?: "") }
    var about by remember(user?.id) { mutableStateOf(user?.about ?: "") }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Profile", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    OutlinedTextField(
                        value = name,
                        onValueChange = { name = it },
                        label = { Text("Display Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = about,
                        onValueChange = { about = it },
                        label = { Text("About") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Button(
                        onClick = { viewModel.updateProfile(name, about) },
                        colors = ButtonDefaults.buttonColors(containerColor = MuzTeal),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Save Profile")
                    }
                }
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Secure Storage", fontWeight = FontWeight.Bold)
                    Text(
                        text = "Your files are encrypted on this device.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = "${vaultSummary.encryptedFileCount} encrypted files (${vaultSummary.totalEncryptedBytes / 1024} KB)",
                        fontSize = 13.sp,
                        color = MuzTeal,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("End-to-End Encryption", fontWeight = FontWeight.Bold)
                    Text(
                        text = "Safety code:\n${user?.encryptionFingerprint ?: "Not ready yet"}",
                        fontSize = 13.sp,
                        color = MuzTeal
                    )
                    OutlinedButton(onClick = { viewModel.syncEncryptionKeys() }) {
                        Text("Refresh security keys")
                    }
                }
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Dark mode")
                        Switch(checked = darkTheme, onCheckedChange = { viewModel.toggleDarkTheme() })
                    }
                    Text(
                        text = if (isSocketConnected) "You are online" else "Reconnecting...",
                        fontSize = 12.sp,
                        color = if (isSocketConnected) MuzTeal else Color.Gray
                    )
                    Button(
                        onClick = { viewModel.logout() },
                        colors = ButtonDefaults.buttonColors(containerColor = MuzDanger),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth().height(48.dp)
                    ) {
                        Text("Log Out")
                    }
                }
            }
        }
    }
}

@Composable
private fun NewChatDialog(viewModel: MuzTalkViewModel, onDismiss: () -> Unit) {
    val users by viewModel.directoryUsers.collectAsState()
    val me by viewModel.currentUser.collectAsState()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Start New Chat") },
        text = {
            LazyColumn(modifier = Modifier.heightIn(max = 320.dp)) {
                items(users.filter { it.id != me?.id }, key = { it.id }) { user ->
                    ListItem(
                        modifier = Modifier.clickable {
                            viewModel.startDirectChat(user.id)
                            onDismiss()
                        },
                        headlineContent = { Text(user.displayName, fontWeight = FontWeight.SemiBold) },
                        supportingContent = { Text(user.phoneNumber) }
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}

@Composable
private fun CallScreenOverlay(activeCall: ActiveCallUiState, viewModel: MuzTalkViewModel) {
    var offsetX by remember { mutableFloatStateOf(32f) }
    var offsetY by remember { mutableFloatStateOf(160f) }
    var remoteRendererRef by remember { mutableStateOf<SurfaceViewRenderer?>(null) }
    var localRendererRef by remember { mutableStateOf<SurfaceViewRenderer?>(null) }

    val showVideoViews = activeCall.isVideo &&
        (activeCall.phase == CallPhase.ACTIVE || activeCall.phase == CallPhase.OUTGOING)

    DisposableEffect(showVideoViews) {
        onDispose {
            viewModel.setRemoteRenderer(null)
            viewModel.setLocalRenderer(null)
            runCatching { remoteRendererRef?.release() }
            runCatching { localRendererRef?.release() }
            remoteRendererRef = null
            localRendererRef = null
        }
    }

    val containerModifier = if (activeCall.isFloating) {
        Modifier
            .offset { IntOffset(offsetX.roundToInt(), offsetY.roundToInt()) }
            .size(width = 180.dp, height = 256.dp)
            .pointerInput(Unit) {
                detectDragGestures { change, dragAmount ->
                    change.consume()
                    offsetX += dragAmount.x
                    offsetY += dragAmount.y
                }
            }
    } else {
        Modifier.fillMaxSize()
    }

    Surface(
        modifier = containerModifier,
        shape = if (activeCall.isFloating) RoundedCornerShape(20.dp) else RoundedCornerShape(0.dp),
        color = MuzNavy,
        shadowElevation = if (activeCall.isFloating) 16.dp else 0.dp,
        border = if (activeCall.isFloating) BorderStroke(1.5.dp, MuzMint.copy(alpha = 0.65f)) else null
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            if (showVideoViews) {
                AndroidView(
                    factory = { ctx ->
                        SurfaceViewRenderer(ctx).apply {
                            init(viewModel.webRTCManager.eglContext, null)
                            setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                            setEnableHardwareScaler(true)
                            remoteRendererRef = this
                            viewModel.setRemoteRenderer(this)
                        }
                    },
                    update = { renderer ->
                        viewModel.setRemoteRenderer(renderer)
                    },
                    modifier = Modifier.fillMaxSize()
                )
                AndroidView(
                    factory = { ctx ->
                        SurfaceViewRenderer(ctx).apply {
                            init(viewModel.webRTCManager.eglContext, null)
                            setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                            setMirror(true)
                            setZOrderMediaOverlay(true)
                            localRendererRef = this
                            viewModel.setLocalRenderer(this)
                        }
                    },
                    update = { renderer ->
                        viewModel.setLocalRenderer(renderer)
                    },
                    modifier = if (activeCall.isFloating) {
                        Modifier
                            .align(Alignment.TopEnd)
                            .padding(top = 34.dp, end = 8.dp)
                            .size(width = 54.dp, height = 78.dp)
                            .clip(RoundedCornerShape(10.dp))
                    } else {
                        Modifier
                            .align(Alignment.TopEnd)
                            .statusBarsPadding()
                            .padding(top = 16.dp, end = 16.dp)
                            .size(width = 110.dp, height = 160.dp)
                            .clip(RoundedCornerShape(14.dp))
                    }
                )
            }

            if (activeCall.isFloating) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.TopCenter)
                        .background(Color.Black.copy(alpha = 0.55f))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = activeCall.peerName,
                        color = Color.White,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    IconButton(
                        onClick = { viewModel.setFloatingCall(false) },
                        modifier = Modifier.size(26.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.OpenInFull,
                            contentDescription = "Expand Call",
                            tint = MuzMint,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }

                if (!showVideoViews) {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Default.Call,
                            contentDescription = null,
                            tint = MuzMint,
                            modifier = Modifier.size(30.dp)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = if (activeCall.phase == CallPhase.ACTIVE) "Connected" else "Ringing...",
                            color = MuzMint,
                            fontSize = 11.sp
                        )
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter)
                        .background(Color.Black.copy(alpha = 0.6f))
                        .padding(horizontal = 8.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = { viewModel.toggleMuteCall() },
                        modifier = Modifier
                            .size(34.dp)
                            .clip(CircleShape)
                            .background(if (activeCall.isMuted) MuzTeal else Color.White.copy(alpha = 0.2f))
                    ) {
                        Icon(
                            imageVector = if (activeCall.isMuted) Icons.Default.MicOff else Icons.Default.Mic,
                            contentDescription = "Mute",
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    IconButton(
                        onClick = { viewModel.setFloatingCall(false) },
                        modifier = Modifier
                            .size(34.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = 0.2f))
                    ) {
                        Icon(
                            imageVector = Icons.Default.OpenInFull,
                            contentDescription = "Expand",
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    IconButton(
                        onClick = { viewModel.hangupActiveCall() },
                        modifier = Modifier
                            .size(34.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFEF4444))
                    ) {
                        Icon(
                            imageVector = Icons.Default.CallEnd,
                            contentDescription = "Hang Up",
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            } else {
                if (activeCall.phase != CallPhase.INCOMING) {
                    IconButton(
                        onClick = { viewModel.setFloatingCall(true) },
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .statusBarsPadding()
                            .padding(16.dp)
                            .clip(CircleShape)
                            .background(Color.Black.copy(alpha = 0.45f))
                    ) {
                        Icon(
                            imageVector = Icons.Default.PictureInPictureAlt,
                            contentDescription = "Float Call Window",
                            tint = Color.White
                        )
                    }
                }

                Column(
                    modifier = Modifier
                        .align(Alignment.TopCenter)
                        .statusBarsPadding()
                        .padding(top = 64.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(activeCall.peerName, color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = when (activeCall.phase) {
                            CallPhase.INCOMING -> if (activeCall.isVideo) "Incoming Video Call..." else "Incoming Audio Call..."
                            CallPhase.OUTGOING -> "Calling..."
                            CallPhase.ACTIVE -> if (activeCall.isVideo) "Video Call Connected" else "Audio Call Connected"
                            CallPhase.IDLE -> ""
                        },
                        color = MuzMint,
                        fontSize = 15.sp
                    )
                }

                Row(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .navigationBarsPadding()
                        .padding(bottom = 36.dp),
                    horizontalArrangement = Arrangement.spacedBy(24.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (activeCall.phase == CallPhase.INCOMING) {
                        FloatingActionButton(
                            onClick = { viewModel.rejectIncomingCall() },
                            containerColor = Color(0xFFEF4444),
                            contentColor = Color.White
                        ) {
                            Icon(Icons.Default.CallEnd, contentDescription = "Decline")
                        }
                        FloatingActionButton(
                            onClick = { viewModel.acceptIncomingCall() },
                            containerColor = MuzTeal,
                            contentColor = Color.White
                        ) {
                            Icon(Icons.Default.Call, contentDescription = "Accept")
                        }
                    } else {
                        FloatingActionButton(
                            onClick = { viewModel.toggleMuteCall() },
                            containerColor = if (activeCall.isMuted) MuzTeal else Color.White.copy(alpha = 0.2f),
                            contentColor = Color.White
                        ) {
                            Icon(
                                imageVector = if (activeCall.isMuted) Icons.Default.MicOff else Icons.Default.Mic,
                                contentDescription = "Mute"
                            )
                        }
                        if (activeCall.isVideo) {
                            FloatingActionButton(
                                onClick = { viewModel.switchCallCamera() },
                                containerColor = Color.White.copy(alpha = 0.2f),
                                contentColor = Color.White
                            ) {
                                Icon(Icons.Default.Cameraswitch, contentDescription = "Switch Camera")
                            }
                        }
                        FloatingActionButton(
                            onClick = { viewModel.hangupActiveCall() },
                            containerColor = Color(0xFFEF4444),
                            contentColor = Color.White
                        ) {
                            Icon(Icons.Default.CallEnd, contentDescription = "Hang Up")
                        }
                    }
                }
            }
        }
    }
}
