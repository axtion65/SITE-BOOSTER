import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useGetProject, customFetch, getGetProjectQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { usePrivateImageUrl } from '@/hooks/usePrivateImageUrl';

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

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: project, isLoading, refetch, error } = useGetProject(id ?? '');

  // Poll every 5s while rendering or adding voiceover
  useEffect(() => {
    if (project?.status !== 'processing' && project?.status !== 'narrating') return;
    const interval = setInterval(() => {
      void refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [project?.status, refetch]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const statusColor = STATUS_COLORS[project?.status ?? 'draft'];

  // Resolve the video URL: if the server returned a /api/storage/objects/ path
  // (fallback when signed-URL generation failed), resolve it client-side with
  // automatic refresh before expiry. For already-signed https:// URLs this is
  // a no-op pass-through.
  const resolvedVideoUrl = usePrivateImageUrl(project?.videoUrl);

  const openVideo = async () => {
    if (!resolvedVideoUrl) return;
    if (resolvedVideoUrl.startsWith('http')) {
      await Linking.openURL(resolvedVideoUrl);
    }
  };

  // A "real" video URL is one that has resolved to an https:// link.
  const hasRealVideoUrl = Boolean(resolvedVideoUrl && resolvedVideoUrl.startsWith('http'));

  // Re-render state
  const [isRerendering, setIsRerendering] = useState(false);

  const handleRerender = async () => {
    if (!id || isRerendering) return;
    Alert.alert(
      'Re-render video',
      'This will use credits and start a new render. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Re-render',
          onPress: async () => {
            setIsRerendering(true);
            try {
              await customFetch(`/api/projects/${id}/rerender`, { method: 'POST' });
              // Invalidate so the detail screen refreshes immediately
              await queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(id) });
              await refetch();
            } catch (err: unknown) {
              const message =
                err instanceof Error ? err.message : 'Something went wrong. Please try again.';
              Alert.alert('Re-render failed', message);
            } finally {
              setIsRerendering(false);
            }
          },
        },
      ],
    );
  };

  type ParsedScript = { hook?: string; callToAction?: string; scenes?: unknown[] };
  let parsedScript: ParsedScript | null = null;
  if (project?.expandedScript) {
    try {
      parsedScript = JSON.parse(project.expandedScript) as ParsedScript;
    } catch {
      // not valid JSON, ignore
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <Pressable style={styles.closeBtn} onPress={() => router.back()}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          {project?.title ?? 'Project'}
        </Text>
        <View style={styles.closeBtn} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : error || !project ? (
        <View style={styles.centered}>
          <Feather name="alert-circle" size={32} color={colors.destructive} />
          <Text style={[styles.errorText, { color: colors.destructive }]}>
            Failed to load project
          </Text>
          <Pressable
            style={[styles.retryBtn, { backgroundColor: colors.secondary }]}
            onPress={() => void refetch()}
          >
            <Text style={[styles.retryText, { color: colors.foreground }]}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Status card */}
          <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.statusRow}>
              <View style={[styles.statusBadge, { backgroundColor: `${statusColor}18`, borderColor: `${statusColor}35` }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {STATUS_LABELS[project.status]}
                </Text>
              </View>
              {project.platform && (
                <View style={[styles.platformBadge, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.platformText, { color: colors.mutedForeground }]}>
                    {project.platform}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.projectTitle, { color: colors.foreground }]}>{project.title}</Text>
            <Text style={[styles.projectDate, { color: colors.mutedForeground }]}>
              Created {new Date(project.createdAt).toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric',
              })}
            </Text>
          </View>

          {/* Video section */}
          {project.status === 'processing' && (
            <View style={[styles.videoPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={[styles.processingTitle, { color: colors.foreground }]}>
                Generating your video...
              </Text>
              <Text style={[styles.processingText, { color: colors.mutedForeground }]}>
                This typically takes 1–5 minutes. We'll check in every 5 seconds.
              </Text>
            </View>
          )}

          {project.status === 'narrating' && (
            <View style={[styles.videoPlaceholder, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ActivityIndicator color="#38bdf8" size="large" />
              <Text style={[styles.processingTitle, { color: colors.foreground }]}>
                Adding voiceover...
              </Text>
              <Text style={[styles.processingText, { color: colors.mutedForeground }]}>
                Mixing narration audio into your video. Almost done — usually under a minute.
              </Text>
            </View>
          )}

          {project.status === 'completed' && (
            <View style={[styles.videoSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.thumbnailPlaceholder, { backgroundColor: colors.secondary }]}>
                <Feather name="play-circle" size={48} color={colors.primary} />
              </View>
              <View style={styles.videoActions}>
                {hasRealVideoUrl ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.watchBtn,
                      { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                    ]}
                    onPress={openVideo}
                  >
                    <Feather name="play" size={18} color={colors.primaryForeground} />
                    <Text style={[styles.watchBtnText, { color: colors.primaryForeground }]}>
                      Watch Video
                    </Text>
                  </Pressable>
                ) : (
                  // Video URL not yet resolved — either still signing or expired
                  <View style={styles.brokenVideoState}>
                    <Text style={[styles.brokenVideoText, { color: colors.mutedForeground }]}>
                      Video link is unavailable. Re-render to get a fresh copy.
                    </Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.rerenderBtn,
                        { borderColor: colors.border, opacity: pressed || isRerendering ? 0.6 : 1 },
                      ]}
                      onPress={handleRerender}
                      disabled={isRerendering}
                    >
                      {isRerendering ? (
                        <ActivityIndicator size="small" color={colors.foreground} />
                      ) : (
                        <Feather name="refresh-cw" size={15} color={colors.foreground} />
                      )}
                      <Text style={[styles.rerenderBtnText, { color: colors.foreground }]}>
                        {isRerendering ? 'Starting…' : 'Re-render'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          )}

          {project.status === 'failed' && (
            <View style={[styles.failedCard, { backgroundColor: `${colors.destructive}10`, borderColor: `${colors.destructive}25` }]}>
              <Feather name="alert-circle" size={24} color={colors.destructive} />
              <Text style={[styles.failedTitle, { color: colors.destructive }]}>Render Failed</Text>
              <Text style={[styles.failedText, { color: colors.mutedForeground }]}>
                Something went wrong during rendering.
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.rerenderBtn,
                  { borderColor: colors.border, opacity: pressed || isRerendering ? 0.6 : 1, marginTop: 4 },
                ]}
                onPress={handleRerender}
                disabled={isRerendering}
              >
                {isRerendering ? (
                  <ActivityIndicator size="small" color={colors.foreground} />
                ) : (
                  <Feather name="refresh-cw" size={15} color={colors.foreground} />
                )}
                <Text style={[styles.rerenderBtnText, { color: colors.foreground }]}>
                  {isRerendering ? 'Starting…' : 'Try Again'}
                </Text>
              </Pressable>
            </View>
          )}

          {/* Script */}
          {parsedScript && (
            <View style={[styles.scriptCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>SCRIPT</Text>

              {parsedScript.hook && (
                <View style={styles.scriptSection}>
                  <Text style={[styles.scriptSectionTitle, { color: colors.primary }]}>Hook</Text>
                  <Text style={[styles.scriptBody, { color: colors.foreground }]}>{parsedScript.hook}</Text>
                </View>
              )}

              {parsedScript.callToAction && (
                <View style={styles.scriptSection}>
                  <Text style={[styles.scriptSectionTitle, { color: colors.primary }]}>Call to Action</Text>
                  <Text style={[styles.scriptBody, { color: colors.foreground }]}>{parsedScript.callToAction}</Text>
                </View>
              )}
            </View>
          )}

          {/* Model info */}
          {project.renderingModelId && (
            <View style={[styles.metaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DETAILS</Text>
              <View style={styles.metaRow}>
                <Text style={[styles.metaKey, { color: colors.mutedForeground }]}>AI Engine</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>
                  {project.renderingModelId}
                </Text>
              </View>
              {project.duration && (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaKey, { color: colors.mutedForeground }]}>Duration</Text>
                  <Text style={[styles.metaValue, { color: colors.foreground }]}>{project.duration}</Text>
                </View>
              )}
              <View style={styles.metaRow}>
                <Text style={[styles.metaKey, { color: colors.mutedForeground }]}>Last updated</Text>
                <Text style={[styles.metaValue, { color: colors.foreground }]}>
                  {new Date(project.updatedAt).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingBottom: 12,
    borderBottomWidth: 1,
  },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  retryText: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  scroll: { padding: 16, gap: 14 },
  statusCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, gap: 8,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  platformBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  platformText: { fontFamily: 'Inter_400Regular', fontSize: 12, textTransform: 'capitalize' },
  projectTitle: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: -0.3 },
  projectDate: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  videoPlaceholder: {
    borderRadius: 16, borderWidth: 1, padding: 40,
    alignItems: 'center', gap: 12,
  },
  processingTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  processingText: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  videoSection: {
    borderRadius: 16, borderWidth: 1, overflow: 'hidden',
  },
  thumbnailPlaceholder: {
    height: 180, alignItems: 'center', justifyContent: 'center',
  },
  videoActions: { padding: 14 },
  watchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 50, borderRadius: 12,
  },
  watchBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  brokenVideoState: { gap: 12, alignItems: 'center' },
  brokenVideoText: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  failedCard: {
    borderRadius: 16, borderWidth: 1, padding: 24,
    alignItems: 'center', gap: 8,
  },
  failedTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  failedText: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  rerenderBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 44, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1,
  },
  rerenderBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  scriptCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, gap: 14,
  },
  sectionLabel: {
    fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 0.8,
  },
  scriptSection: { gap: 4 },
  scriptSectionTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  scriptBody: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 22 },
  metaCard: {
    borderRadius: 16, borderWidth: 1, padding: 16, gap: 12,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaKey: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  metaValue: { fontFamily: 'Inter_500Medium', fontSize: 13 },
});
