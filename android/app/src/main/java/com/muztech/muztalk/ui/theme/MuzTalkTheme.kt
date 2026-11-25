package com.muztech.muztalk.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

val MuzTeal = Color(0xFF14B8A6)
val MuzTealDark = Color(0xFF0D9488)
val MuzNavy = Color(0xFF0F1B33)
val MuzNavyLight = Color(0xFF1E3A5F)
val MuzMint = Color(0xFF5EEAD4)
val MuzLightBg = Color(0xFFF1F6F9)
val MuzDarkBg = Color(0xFF0B141E)
val MuzDarkSurface = Color(0xFF142230)
val MuzDanger = Color(0xFFEF4444)

/** Brand gradient used for headers, buttons and sent chat bubbles. */
val MuzBrandGradient = Brush.linearGradient(listOf(MuzTealDark, MuzTeal, Color(0xFF2DD4BF)))
val MuzHeaderGradient = Brush.verticalGradient(listOf(MuzNavy, MuzNavyLight))

private val LightColors = lightColorScheme(
    primary = MuzTeal,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFCCFBF1),
    onPrimaryContainer = Color(0xFF042F2E),
    secondary = MuzNavy,
    onSecondary = Color.White,
    tertiary = MuzMint,
    background = MuzLightBg,
    onBackground = MuzNavy,
    surface = Color.White,
    onSurface = MuzNavy,
    surfaceVariant = Color(0xFFE2EAF0),
    onSurfaceVariant = Color(0xFF5B6B7E),
    outline = Color(0xFFB8C4D0),
    outlineVariant = Color(0xFFE2E8F0),
    errorContainer = Color(0xFFFEE2E2),
    onErrorContainer = Color(0xFF7F1D1D)
)

private val DarkColors = darkColorScheme(
    primary = MuzTeal,
    onPrimary = Color.White,
    primaryContainer = Color(0xFF134E4A),
    onPrimaryContainer = Color(0xFFCCFBF1),
    secondary = MuzMint,
    onSecondary = MuzNavy,
    background = MuzDarkBg,
    onBackground = Color(0xFFF1F5F9),
    surface = MuzDarkSurface,
    onSurface = Color(0xFFF1F5F9),
    surfaceVariant = Color(0xFF1E3142),
    onSurfaceVariant = Color(0xFF9FB1C3),
    outline = Color(0xFF3B5166),
    outlineVariant = Color(0xFF22364A),
    errorContainer = Color(0xFF5B1A1A),
    onErrorContainer = Color(0xFFFECACA)
)

private val MuzShapes = Shapes(
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp)
)

private val MuzTypography = Typography(
    titleLarge = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.Bold),
    titleMedium = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp),
    bodyMedium = TextStyle(fontSize = 14.sp),
    labelLarge = TextStyle(fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
)

@Composable
fun MuzTalkTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        shapes = MuzShapes,
        typography = MuzTypography,
        content = content
    )
}
