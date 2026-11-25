package com.muztech.muztalk.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Pin
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.muztech.muztalk.ui.theme.MuzDanger
import com.muztech.muztalk.ui.theme.MuzHeaderGradient
import com.muztech.muztalk.ui.theme.MuzMint
import com.muztech.muztalk.ui.theme.MuzNavy
import com.muztech.muztalk.ui.theme.MuzTeal
import com.muztech.muztalk.ui.viewmodel.MuzTalkViewModel

@Composable
fun AuthScreen(viewModel: MuzTalkViewModel) {
    val otpSentEmail by viewModel.otpSentEmail.collectAsState()
    val devOtpPreview by viewModel.devOtpPreview.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val banner by viewModel.statusBanner.collectAsState()

    var usePasswordMode by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var otpCode by remember { mutableStateOf("") }
    var identifier by remember { mutableStateOf("") }
    var loginPassword by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }

    LaunchedEffect(devOtpPreview) {
        if (!devOtpPreview.isNullOrBlank()) otpCode = devOtpPreview ?: ""
    }

    val fieldShape = RoundedCornerShape(14.dp)
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = MuzTeal,
        focusedLabelColor = MuzTeal,
        cursorColor = MuzTeal,
        unfocusedBorderColor = MaterialTheme.colorScheme.outline
    )
    val buttonColors = ButtonDefaults.buttonColors(
        containerColor = MuzTeal,
        contentColor = Color.White,
        disabledContainerColor = MuzTeal.copy(alpha = 0.35f),
        disabledContentColor = Color.White.copy(alpha = 0.8f)
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
    ) {
        // ---------- Branded header ----------
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    MuzHeaderGradient,
                    RoundedCornerShape(bottomStart = 36.dp, bottomEnd = 36.dp)
                )
                .statusBarsPadding()
                .padding(top = 28.dp, bottom = 56.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(76.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(Color.White.copy(alpha = 0.10f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text("MT", color = MuzMint, fontSize = 28.sp, fontWeight = FontWeight.ExtraBold)
                }
                Spacer(Modifier.height(14.dp))
                Text("MuzTalk", color = Color.White, fontSize = 30.sp, fontWeight = FontWeight.Bold)
                Text(
                    "Connect. Chat. Call.",
                    color = MuzMint,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }

        // ---------- Form card (overlaps header) ----------
        Column(
            modifier = Modifier
                .padding(horizontal = 20.dp)
                .offset(y = (-32).dp)
        ) {
            if (!banner.isNullOrBlank()) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(start = 16.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = banner ?: "",
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            modifier = Modifier.weight(1f),
                            fontSize = 13.sp
                        )
                        TextButton(onClick = { viewModel.clearBanner() }) {
                            Text("OK", color = MuzDanger, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }

            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(26.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
            ) {
                Column(modifier = Modifier.padding(22.dp)) {
                    if (otpSentEmail == null) {
                        // Mode switch
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(14.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant)
                                .padding(4.dp),
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            ModeTab("Sign up / Email", !usePasswordMode, Modifier.weight(1f)) { usePasswordMode = false }
                            ModeTab("Password", usePasswordMode, Modifier.weight(1f)) { usePasswordMode = true }
                        }
                        Spacer(Modifier.height(20.dp))
                    }

                    if (otpSentEmail == null && usePasswordMode) {
                        Text("Welcome back", fontSize = 22.sp, fontWeight = FontWeight.Bold)
                        Text(
                            "Sign in with your username or email.",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(18.dp))
                        OutlinedTextField(
                            value = identifier,
                            onValueChange = { identifier = it },
                            label = { Text("Username or Email") },
                            leadingIcon = { Icon(Icons.Default.AlternateEmail, contentDescription = null) },
                            singleLine = true,
                            shape = fieldShape,
                            colors = fieldColors,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(
                            value = loginPassword,
                            onValueChange = { loginPassword = it },
                            label = { Text("Password") },
                            leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                            trailingIcon = {
                                IconButton(onClick = { showPassword = !showPassword }) {
                                    Icon(
                                        if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                        contentDescription = null
                                    )
                                }
                            },
                            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                            singleLine = true,
                            shape = fieldShape,
                            colors = fieldColors,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(22.dp))
                        Button(
                            onClick = { viewModel.loginWithPassword(identifier, loginPassword) },
                            enabled = !isLoading && identifier.isNotBlank() && loginPassword.length >= 6,
                            colors = buttonColors,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth().height(52.dp)
                        ) {
                            Text(if (isLoading) "Please wait..." else "Sign In", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                        }
                    } else if (otpSentEmail == null) {
                        Text("Get started", fontSize = 22.sp, fontWeight = FontWeight.Bold)
                        Text(
                            "We'll email you a 6-digit code.",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(18.dp))
                        OutlinedTextField(
                            value = email,
                            onValueChange = { email = it },
                            label = { Text("Email Address") },
                            leadingIcon = { Icon(Icons.Default.Email, contentDescription = null) },
                            singleLine = true,
                            shape = fieldShape,
                            colors = fieldColors,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(
                            value = username,
                            onValueChange = { username = it },
                            label = { Text("Username") },
                            leadingIcon = { Icon(Icons.Default.AlternateEmail, contentDescription = null) },
                            singleLine = true,
                            shape = fieldShape,
                            colors = fieldColors,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(
                            value = displayName,
                            onValueChange = { displayName = it },
                            label = { Text("Display Name (optional)") },
                            leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                            singleLine = true,
                            shape = fieldShape,
                            colors = fieldColors,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(22.dp))
                        Button(
                            onClick = { viewModel.sendEmailOtp(email, username) },
                            enabled = !isLoading && email.contains("@"),
                            colors = buttonColors,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth().height(52.dp)
                        ) {
                            Text(if (isLoading) "Sending code..." else "Send Code", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                        }
                    } else {
                        Text("Check your email", fontSize = 22.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(4.dp))
                        Text(
                            "Enter the 6-digit code we sent to $otpSentEmail",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(18.dp))
                        OutlinedTextField(
                            value = otpCode,
                            onValueChange = { if (it.length <= 6) otpCode = it.filter(Char::isDigit) },
                            label = { Text("6-digit code") },
                            leadingIcon = { Icon(Icons.Default.Pin, contentDescription = null) },
                            singleLine = true,
                            shape = fieldShape,
                            colors = fieldColors,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(12.dp))
                        OutlinedTextField(
                            value = password,
                            onValueChange = { password = it },
                            label = { Text("Set a password (optional)") },
                            leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                            visualTransformation = PasswordVisualTransformation(),
                            singleLine = true,
                            shape = fieldShape,
                            colors = fieldColors,
                            modifier = Modifier.fillMaxWidth()
                        )
                        Spacer(Modifier.height(22.dp))
                        Button(
                            onClick = { viewModel.verifyEmailOtp(otpCode, username, displayName, password) },
                            enabled = !isLoading && otpCode.length == 6,
                            colors = buttonColors,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth().height(52.dp)
                        ) {
                            Text(if (isLoading) "Verifying..." else "Verify & Continue", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
                        }
                        TextButton(
                            onClick = { viewModel.resetOtpStep() },
                            modifier = Modifier.align(Alignment.CenterHorizontally)
                        ) {
                            Text("Use a different email", color = MuzTeal)
                        }
                    }
                }
            }

            Spacer(Modifier.height(20.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = MuzTeal, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    "End-to-end encrypted",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            }
            Spacer(Modifier.navigationBarsPadding().height(12.dp))
        }
    }
}

@Composable
private fun ModeTab(label: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(11.dp),
        color = if (selected) MaterialTheme.colorScheme.surface else Color.Transparent,
        shadowElevation = if (selected) 2.dp else 0.dp,
        modifier = modifier
    ) {
        Box(modifier = Modifier.padding(vertical = 10.dp), contentAlignment = Alignment.Center) {
            Text(
                label,
                fontSize = 13.sp,
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                color = if (selected) MuzTeal else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
