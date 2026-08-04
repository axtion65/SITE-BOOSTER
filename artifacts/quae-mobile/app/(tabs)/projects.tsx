import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useListProjects, useDeleteProject, getListProjectsQueryKey, getGetProjectStatsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Project } from '@workspace/api-client-react';

type StatusFilter = 'all' | 'processing' | 'completed' | 'failed' | 'draft';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'processing', label: 'Rendering' },
  { key: 'completed', label: 'Done' },
  { key: 'failed', label: 'Failed' },
  { key: 'draft', label: 'Draft' },
];

const STATUS_COLORS: Record<string, string> = {
  draft: '#a1a1aa',
  processing: '#f59e0b',
  narrating: '#38bdf8',
  completed: '#22c55e',
  failed: '#ef4343',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  processing: 'Rendering',
  narrating: 'Adding Voiceover',
  completed: 'Completed',
  failed: 'Failed',
};

function ProjectCard({
  project, onDelete, colors,
}: {
  project: Project;
  onDelete: (id: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const date = new Date(project.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  const statusColor = STATUS_COLORS[project.status] ?? '#a1a1aa';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      onPress={() => router.push(`/project/${project.id}`)}
    >
      {/* Thumbnail placeholder */}
      <View style={[styles.thumbnail, { backgroundColor: colors.secondary }]}>
        <Feather
          name={project.status === 'completed' ? 'play-circle' : 'film'}
          size={28}
          color={project.status === 'completed' ? colors.primary : colors.mutedForeground}
        />
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={2}>
          {project.title}
        </Text>

        <View style={styles.metaRow}>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18`, borderColor: `${statusColor}35` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {STATUS_LABELS[project.status]}
            </Text>
          </View>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>{date}</Text>
        </View>

        {project.platform && (
          <Text style={[styles.platform, { color: colors.mutedForeground }]}>
            {project.platform}
          </Text>
        )}
      </View>

      {/* Delete */}
      <Pressable
        style={styles.deleteBtn}
        onPress={() => onDelete(project.id)}
        hitSlop={8}
      >
        <Feather name="trash-2" size={15} color={colors.mutedForeground} />
      </Pressable>
    </Pressable>
  );
}

export default function ProjectsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>('all');

  const { data: projects, isLoading, refetch } = useListProjects();
  const { mutateAsync: deleteProject } = useDeleteProject();

  const filtered = (projects ?? []).filter((p) =>
    filter === 'all' ? true : p.status === filter,
  );

  const handleDelete = async (id: string) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await deleteProject({ id });
      void queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetProjectStatsQueryKey() });
    } catch {
      // ignore
    }
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Text style={[styles.heading, { color: colors.foreground }]}>Projects</Text>
        <Text style={[styles.count, { color: colors.mutedForeground }]}>
          {projects?.length ?? 0} total
        </Text>
      </View>

      {/* Filter chips */}
      <View style={[styles.filterWrap, { borderBottomColor: colors.border }]}>
        <FlatList
          horizontal
          data={FILTERS}
          keyExtractor={(f) => f.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item: f }) => {
            const active = filter === f.key;
            return (
              <Pressable
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setFilter(f.key)}
              >
                <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 80 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={filtered.length > 0}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="film" size={36} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {filter === 'all' ? 'No projects yet' : `No ${filter} videos`}
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {filter === 'all'
                  ? 'Create your first AI video from the Create tab.'
                  : `You have no ${filter === 'processing' ? 'rendering' : filter} videos.`}
              </Text>
              {filter === 'all' && (
                <Pressable
                  style={[styles.createBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.push('/(tabs)/create')}
                >
                  <Text style={[styles.createBtnText, { color: colors.primaryForeground }]}>
                    Create Video
                  </Text>
                </Pressable>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <ProjectCard
              project={item}
              onDelete={handleDelete}
              colors={colors}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'baseline', gap: 10,
    paddingHorizontal: 20, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 26, letterSpacing: -0.5 },
  count: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  filterWrap: { borderBottomWidth: 1 },
  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  chipText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  list: { padding: 16, gap: 12 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderRadius: 16, borderWidth: 1, padding: 12, gap: 12,
  },
  thumbnail: {
    width: 68, height: 68, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  info: { flex: 1, gap: 6 },
  title: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  date: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  platform: { fontFamily: 'Inter_400Regular', fontSize: 12, textTransform: 'capitalize' },
  deleteBtn: { padding: 4, marginTop: 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 18, marginTop: 8 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  createBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  createBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
});
