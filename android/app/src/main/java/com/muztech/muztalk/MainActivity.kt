package com.muztech.muztalk

import android.Manifest
import android.app.PictureInPictureParams
import android.os.Build
import android.os.Bundle
import android.util.Rational
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.ViewModelProvider
import com.muztech.muztalk.ui.screens.AuthScreen
import com.muztech.muztalk.ui.screens.MainHomeScreen
import com.muztech.muztalk.ui.theme.MuzTalkTheme
import com.muztech.muztalk.ui.viewmodel.CallPhase
import com.muztech.muztalk.ui.viewmodel.MuzTalkViewModel

class MainActivity : ComponentActivity() {
    private lateinit var mainViewModel: MuzTalkViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        mainViewModel = ViewModelProvider(this)[MuzTalkViewModel::class.java]

        setContent {
            val currentUser by mainViewModel.currentUser.collectAsState()
            val darkTheme by mainViewModel.darkTheme.collectAsState()
            val blockScreenCapture by mainViewModel.blockScreenCapture.collectAsState()

            val permissionLauncher = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.RequestMultiplePermissions()
            ) { }

            LaunchedEffect(Unit) {
                val perms = mutableListOf(
                    Manifest.permission.CAMERA,
                    Manifest.permission.RECORD_AUDIO
                )
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    perms.add(Manifest.permission.POST_NOTIFICATIONS)
                }
                permissionLauncher.launch(perms.toTypedArray())
            }

            LaunchedEffect(blockScreenCapture) {
                if (blockScreenCapture) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                }
            }

            MuzTalkTheme(darkTheme = darkTheme) {
                if (currentUser == null) {
                    AuthScreen(viewModel = mainViewModel)
                } else {
                    MainHomeScreen(viewModel = mainViewModel)
                }
            }
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && ::mainViewModel.isInitialized) {
            val call = mainViewModel.activeCall.value
            if (call.phase == CallPhase.ACTIVE && call.isVideo) {
                mainViewModel.setFloatingCall(false)
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(9, 16))
                    .build()
                runCatching { enterPictureInPictureMode(params) }
            }
        }
    }
}
