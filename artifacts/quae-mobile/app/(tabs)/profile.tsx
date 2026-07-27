import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/auth';
import { useGetProjectStats } from '@workspace/api-client-react';

const PLAN_COLORS: Record<string, string> = {
  free: '#a1a1aa',
  creator: '#f59e0b',
  agency: '#7c3bed',
};

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  creator: 'Creator',
  agency: 'Agency',
};

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, signOut, isLoading } = useAuth();
  const { data: stats } = useGetProjectStats();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await signOut();
          router.replace('/(auth)/sign-in');
        },
      },
    ]);
  };

  const initials = (user?.name ?? user?.email ?? '?')
    .split(' ')
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  const planColor = PLAN_COLORS[user?.plan ?? 'free'] ?? colors.mutedForeground;
  const planLabel = PLAN_LABELS[user?.plan ?? 'free'] ?? 'Free';

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={['#1a0a2e', 'transparent']}
        style={[styles.grad, { height: topPad + 200 }]}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPad + 20, paddingBottom: bottomPad + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar + Name */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>{initials}</Text>
          </View>
          <Text style={[styles.displayName, { color: colors.foreground }]}>
            {user?.name ?? 'Unknown'}
          </Text>
          <Text style={[styles.email, { color: colors.mutedForeground }]}>{user?.email}</Text>

          <View style={[styles.planBadge, { backgroundColor: `${planColor}20`, borderColor: `${planColor}35` }]}>
            <Text style={[styles.planText, { color: planColor }]}>{planLabel} Plan</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          {[
            { label: 'Credits', value: user?.credits ?? 0, icon: 'zap' as const, highlight: true },
            { label: 'Videos', value: stats?.total ?? 0, icon: 'film' as const, highlight: false },
            { label: 'Completed', value: stats?.byStatus.completed ?? 0, icon: 'check-circle' as const, highlight: false },
          ].map((s) => (
            <View
              key={s.label}
              style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name={s.icon} size={16} color={s.highlight ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Account section */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ACCOUNT</Text>

          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Feather name="mail" size={16} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Email</Text>
              <Text style={[styles.rowValue, { color: colors.foreground }]}>{user?.email}</Text>
            </View>
          </View>

          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Feather name="user" size={16} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Name</Text>
              <Text style={[styles.rowValue, { color: colors.foreground }]}>
                {user?.name ?? 'Not set'}
              </Text>
            </View>
          </View>

          <View style={styles.row}>
            <Feather name="shield" size={16} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>Member since</Text>
              <Text style={[styles.rowValue, { color: colors.foreground }]}>
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('en-US', {
                    month: 'long', year: 'numeric',
                  })
                  : '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ACTIONS</Text>

          <Pressable
            style={({ pressed }) => [
              styles.row,
              { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={() => router.push('/(tabs)/create')}
          >
            <Feather name="video" size={16} color={colors.primary} />
            <Text style={[styles.actionLabel, { color: colors.primary }]}>Create New Video</Text>
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
            onPress={handleSignOut}
          >
            <Feather name="log-out" size={16} color={colors.destructive} />
            <Text style={[styles.actionLabel, { color: colors.destructive }]}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grad: { position: 'absolute', top: 0, left: 0, right: 0 },
  scroll: { paddingHorizontal: 20 },
  avatarSection: { alignItems: 'center', gap: 6, marginBottom: 24 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 28 },
  displayName: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  email: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  planBadge: {
    marginTop: 4, paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  planText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, borderRadius: 14, borderWidth: 1,
    padding: 14, alignItems: 'center', gap: 4,
  },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  section: {
    borderRadius: 16, borderWidth: 1,
    overflow: 'hidden', marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: 'Inter_600SemiBold', fontSize: 11,
    letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1,
  },
  rowLabel: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  rowValue: { fontFamily: 'Inter_500Medium', fontSize: 14, marginTop: 1 },
  actionLabel: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15 },
});
