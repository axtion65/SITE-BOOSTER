import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/auth';

export default function SignInScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await signIn(email.trim().toLowerCase(), password);
      router.replace('/(tabs)');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Sign in failed';
      setError(msg);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setLoading(false);
    }
  };

  const styles = makeStyles(colors);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={['#1a0a2e', colors.background]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.6 }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: topInset + 60 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoRow}>
            <View style={styles.logoMark}>
              <Text style={[styles.logoQ, { color: colors.primaryForeground }]}>Q</Text>
            </View>
            <Text style={[styles.logoText, { color: colors.foreground }]}>quae</Text>
          </View>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            AI Video Platform
          </Text>

          {/* Card */}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.heading, { color: colors.foreground }]}>Welcome back</Text>
            <Text style={[styles.subheading, { color: colors.mutedForeground }]}>
              Sign in to your account
            </Text>

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: `${colors.destructive}18`, borderColor: `${colors.destructive}40` }]}>
                <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Email</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
                placeholder="you@company.com"
                placeholderTextColor={colors.mutedForeground}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="next"
                autoComplete="email"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>Password</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.secondary, borderColor: colors.border, color: colors.foreground }]}
                placeholder="••••••••"
                placeholderTextColor={colors.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
                autoComplete="password"
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.primary, opacity: pressed || loading ? 0.8 : 1 },
              ]}
              onPress={handleSignIn}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                  Sign In
                </Text>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
              Don't have an account?{' '}
            </Text>
            <Pressable onPress={() => router.push('/(auth)/sign-up')}>
              <Text style={[styles.footerLink, { color: colors.primary }]}>Sign Up</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    scroll: { paddingHorizontal: 24, paddingBottom: 60 },
    logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    logoMark: {
      width: 40, height: 40, borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    logoQ: { fontFamily: 'Inter_700Bold', fontSize: 22 },
    logoText: { fontFamily: 'Inter_700Bold', fontSize: 26, letterSpacing: -0.5 },
    tagline: { fontFamily: 'Inter_400Regular', fontSize: 14, marginBottom: 40 },
    card: {
      borderRadius: 16, borderWidth: 1,
      padding: 24, gap: 16,
    },
    heading: { fontFamily: 'Inter_600SemiBold', fontSize: 22 },
    subheading: { fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: -8 },
    errorBox: { borderRadius: 8, borderWidth: 1, padding: 12 },
    errorText: { fontFamily: 'Inter_400Regular', fontSize: 13 },
    fieldGroup: { gap: 6 },
    label: { fontFamily: 'Inter_500Medium', fontSize: 13 },
    input: {
      height: 48, borderRadius: 10, borderWidth: 1,
      paddingHorizontal: 14,
      fontFamily: 'Inter_400Regular', fontSize: 15,
    },
    primaryBtn: {
      height: 50, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
      marginTop: 4,
    },
    primaryBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
    footerText: { fontFamily: 'Inter_400Regular', fontSize: 14 },
    footerLink: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  });
}
