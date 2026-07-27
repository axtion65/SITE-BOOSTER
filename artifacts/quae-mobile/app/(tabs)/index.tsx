import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/auth';
import { useListProjects, useGetProjectStats } from '@workspace/api-client-react';
import type { Project } from '@workspace/api-client-react';

const STATUS_COLORS: Record<string, string> = {
  draft: '#a1a1aa',
  processing: '#f59e0b',
  completed: '#22c55e',
  failed: '#ef4343',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  processing: 'Rendering',
  completed: 'Done',
  failed: 'Failed',
};

function StatusDot({ status }: { status: string }) {
  return (
    <View
      style={{
        width: 7, height: 7, borderRadius: 4,
        backgroundColor: STATUS_COLORS[status] ?? '#a1a1aa',
      }}
    />
  );
}

function ProjectRow({ project, colors }: { project: Project; colors: ReturnType<typeof useColors> }) {
  const date = new Date(project.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
  return (
    <Pressable
      style={({ pressed }) => [styles.projectRow, {
        backgroundColor: colors.card,
        borderColor: colors.border,
        opacity: pressed ? 0.75 : 1,
      }]}
      onPress={() => router.push(`/project/${project.id}`)}
    >
      <View style={styles.projectRowLeft}>
        <View style={[styles.projectIcon, { backgroundColor: colors.secondary }]}>
          <Feather name="film" size={16} color={colors.mutedForeground} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.projectTitle, { color: colors.foreground }]} numberOfLines={1}>
            {project.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <StatusDot status={project.status} />
            <Text style={[styles.projectMeta, { color: colors.mutedForeground }]}>
              {STATUS_LABELS[project.status] ?? project.status} · {date}
            </Text>
          </View>
        </View>
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();

  const { data: projects, isLoading: projectsLoading, refetch: refetchProjects } = useListProjects();
  const { data: stats, refetch: refetchStats } = useGetProjectStats();

  const onRefresh = async () => {
    await Promise.all([refetchProjects(), refetchStats(), refreshUser()]);
  };

  const recent = (projects ?? []).slice(0, 3);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const displayName = user?.name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there';

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header gradient */}
      <LinearGradient
        colors={['#1a0a2e', 'transparent']}
        style={[styles.headerGrad, { height: topPad + 120 }]}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: topPad + 16 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>{greeting}</Text>
            <Text style={[styles.name, { color: colors.foreground }]}>{displayName}</Text>
          </View>
          <Pressable
            style={[styles.creditBadge, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            onPress={() => router.push('/(tabs)/profile')}
          >
            <Feather name="zap" size={12} color={colors.primary} />
            <Text style={[styles.creditText, { color: colors.foreground }]}>
              {user?.credits ?? '—'}
            </Text>
          </Pressable>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          {[
            { label: 'Total', value: stats?.total ?? 0, icon: 'layers' as const },
            { label: 'Completed', value: stats?.byStatus.completed ?? 0, icon: 'check-circle' as const },
            { label: 'Rendering', value: stats?.byStatus.processing ?? 0, icon: 'loader' as const },
          ].map((s) => (
            <View
              key={s.label}
              style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name={s.icon} size={16} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Create CTA */}
        <Pressable
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={() => router.push('/(tabs)/create')}
        >
          <Feather name="plus" size={18} color={colors.primaryForeground} />
          <Text style={[styles.ctaBtnText, { color: colors.primaryForeground }]}>
            Create New Video
          </Text>
        </Pressable>

        {/* Recent projects */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent</Text>
            {(projects?.length ?? 0) > 3 && (
              <Pressable onPress={() => router.push('/(tabs)/projects')}>
                <Text style={[styles.seeAll, { color: colors.primary }]}>See all</Text>
              </Pressable>
            )}
          </View>

          {projectsLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : recent.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="film" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No videos yet</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Create your first AI video to get started.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {recent.map((p) => (
                <ProjectRow key={p.id} project={p} colors={colors} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerGrad: { position: 'absolute', top: 0, left: 0, right: 0 },
  scroll: { paddingHorizontal: 20, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  greeting: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 26, letterSpacing: -0.5 },
  creditBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  creditText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, borderRadius: 14, borderWidth: 1,
    padding: 14, alignItems: 'center', gap: 4,
  },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 11 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 52, borderRadius: 14, marginBottom: 28,
  },
  ctaBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 17 },
  seeAll: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  projectRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  projectRowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  projectIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  projectTitle: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  projectMeta: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  emptyCard: {
    borderRadius: 16, borderWidth: 1, padding: 32,
    alignItems: 'center', gap: 8,
  },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 4 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center' },
});
