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
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import {
  useListTemplates,
  useListRenderingModels,
  useExpandPrompt,
  useCreateProject,
  getListProjectsQueryKey,
  getGetProjectStatsQueryKey,
} from '@workspace/api-client-react';
import type { Template, RenderingModel, ExpandedScript } from '@workspace/api-client-react';

type Step = 'template' | 'describe' | 'script' | 'model' | 'creating';

const STEPS: Step[] = ['template', 'describe', 'script', 'model', 'creating'];
const STEP_LABELS: Record<Step, string> = {
  template: 'Choose Template',
  describe: 'Describe Product',
  script: 'Review Script',
  model: 'AI Engine',
  creating: 'Rendering',
};

const PLAN_LABEL: Record<string, string> = { free: 'Free', creator: 'Creator', agency: 'Agency' };
const PLATFORM_OPTIONS = ['tiktok', 'instagram', 'youtube', 'amazon'];

export default function CreateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState('');
  const [expandedScript, setExpandedScript] = useState<ExpandedScript | null>(null);
  const [selectedModel, setSelectedModel] = useState<RenderingModel | null>(null);
  const [scriptError, setScriptError] = useState('');

  const { data: templates, isLoading: templatesLoading } = useListTemplates();
  const { data: models, isLoading: modelsLoading } = useListRenderingModels();
  const { mutateAsync: expandPrompt, isPending: expanding } = useExpandPrompt();
  const { mutateAsync: createProject, isPending: creating } = useCreateProject();

  const stepIndex = STEPS.indexOf(step);

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const handleTemplateSelect = (t: Template) => {
    setSelectedTemplate(t);
    void Haptics.selectionAsync();
    setStep('describe');
  };

  const handleDescribeContinue = async () => {
    if (!productName.trim()) return;
    setScriptError('');
    setStep('script');
    try {
      const result = await expandPrompt({
        data: {
          productName: productName.trim(),
          description: description.trim(),
          platform: platform || undefined,
          targetAudience: null,
          duration: selectedTemplate?.duration ?? null,
        },
      });
      setExpandedScript(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to generate script';
      setScriptError(msg);
    }
  };

  const handleModelSelect = (m: RenderingModel) => {
    setSelectedModel(m);
    void Haptics.selectionAsync();
  };

  const handleRender = async () => {
    if (!selectedModel) return;
    setStep('creating');
    try {
      await createProject({
        data: {
          title: productName.trim(),
          renderingModelId: selectedModel.id,
          description: description.trim() || null,
          script: expandedScript?.script ?? null,
          expandedScript: expandedScript ? JSON.stringify(expandedScript) : null,
          platform: platform || null,
          duration: selectedTemplate?.duration ?? null,
          templateId: selectedTemplate?.id ?? null,
        },
      });
      void queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetProjectStatsQueryKey() });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Reset wizard
      setTimeout(() => {
        setStep('template');
        setSelectedTemplate(null);
        setProductName('');
        setDescription('');
        setPlatform('');
        setExpandedScript(null);
        setSelectedModel(null);
        router.push('/(tabs)/projects');
      }, 1200);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create project';
      setScriptError(msg);
      setStep('model');
    }
  };

  const styles = makeStyles(colors);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        {stepIndex > 0 && step !== 'creating' ? (
          <Pressable style={styles.backBtn} onPress={goBack}>
            <Feather name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {STEP_LABELS[step]}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {/* Step indicator */}
      {step !== 'creating' && (
        <View style={styles.stepDots}>
          {STEPS.slice(0, 4).map((s, i) => (
            <View
              key={s}
              style={[
                styles.dot,
                {
                  backgroundColor: i <= stepIndex
                    ? colors.primary
                    : colors.secondary,
                  width: i === stepIndex ? 20 : 8,
                },
              ]}
            />
          ))}
        </View>
      )}

      {/* Step content */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {step === 'template' && (
          <TemplateStep
            templates={templates ?? []}
            loading={templatesLoading}
            onSelect={handleTemplateSelect}
            colors={colors}
            styles={styles}
          />
        )}

        {step === 'describe' && (
          <DescribeStep
            productName={productName}
            setProductName={setProductName}
            description={description}
            setDescription={setDescription}
            platform={platform}
            setPlatform={setPlatform}
            onContinue={handleDescribeContinue}
            colors={colors}
            styles={styles}
          />
        )}

        {step === 'script' && (
          <ScriptStep
            expanding={expanding}
            expandedScript={expandedScript}
            error={scriptError}
            onRetry={handleDescribeContinue}
            onContinue={() => setStep('model')}
            colors={colors}
            styles={styles}
          />
        )}

        {step === 'model' && (
          <ModelStep
            models={models ?? []}
            loading={modelsLoading}
            selected={selectedModel}
            onSelect={handleModelSelect}
            onRender={handleRender}
            error={scriptError}
            colors={colors}
            styles={styles}
          />
        )}

        {step === 'creating' && (
          <CreatingStep
            creating={creating}
            colors={colors}
            styles={styles}
          />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Sub-step components ──────────────────────────────────────────────────────

function TemplateStep({
  templates, loading, onSelect, colors, styles,
}: {
  templates: Template[];
  loading: boolean;
  onSelect: (t: Template) => void;
  colors: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.stepScroll} showsVerticalScrollIndicator={false}>
      <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
        Pick a format that matches your goal
      </Text>
      <View style={styles.grid}>
        {templates.map((t) => (
          <Pressable
            key={t.id}
            style={({ pressed }) => [
              styles.templateCard,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={() => onSelect(t)}
          >
            <View style={[styles.templateIcon, { backgroundColor: colors.secondary }]}>
              <Feather name="play-circle" size={20} color={colors.primary} />
            </View>
            <Text style={[styles.templateName, { color: colors.foreground }]} numberOfLines={2}>
              {t.name}
            </Text>
            <View style={styles.templateMeta}>
              <Text style={[styles.templateTag, { color: colors.mutedForeground }]}>
                {t.platform}
              </Text>
              <Text style={[styles.templateDuration, { color: colors.mutedForeground }]}>
                {t.duration}
              </Text>
            </View>
            {t.isPremium && (
              <View style={[styles.premiumBadge, { backgroundColor: `${colors.primary}25` }]}>
                <Text style={[styles.premiumText, { color: colors.primary }]}>Pro</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function DescribeStep({
  productName, setProductName, description, setDescription,
  platform, setPlatform, onContinue, colors, styles,
}: {
  productName: string; setProductName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  platform: string; setPlatform: (v: string) => void;
  onContinue: () => void;
  colors: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <ScrollView contentContainerStyle={styles.stepScroll} keyboardShouldPersistTaps="handled">
      <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
        Tell us about what you're promoting
      </Text>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Product name *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          placeholder="e.g. ProFlex Running Shoes"
          placeholderTextColor={colors.mutedForeground}
          value={productName}
          onChangeText={setProductName}
          returnKeyType="next"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Description</Text>
        <TextInput
          style={[styles.textarea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
          placeholder="What makes it unique? Key features, benefits, target audience..."
          placeholderTextColor={colors.mutedForeground}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
          returnKeyType="default"
          textAlignVertical="top"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>Platform (optional)</Text>
        <View style={styles.platformRow}>
          {PLATFORM_OPTIONS.map((p) => (
            <Pressable
              key={p}
              style={[
                styles.platformChip,
                {
                  backgroundColor: platform === p ? colors.primary : colors.card,
                  borderColor: platform === p ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setPlatform(platform === p ? '' : p)}
            >
              <Text style={[styles.platformText, { color: platform === p ? colors.primaryForeground : colors.mutedForeground }]}>
                {p}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.primaryBtn,
          {
            backgroundColor: productName.trim() ? colors.primary : colors.secondary,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        onPress={onContinue}
        disabled={!productName.trim()}
      >
        <Text style={[styles.primaryBtnText, { color: productName.trim() ? colors.primaryForeground : colors.mutedForeground }]}>
          Generate Script
        </Text>
        <Feather name="zap" size={16} color={productName.trim() ? colors.primaryForeground : colors.mutedForeground} />
      </Pressable>
    </ScrollView>
  );
}

function ScriptStep({
  expanding, expandedScript, error, onRetry, onContinue, colors, styles,
}: {
  expanding: boolean;
  expandedScript: ExpandedScript | null;
  error: string;
  onRetry: () => void;
  onContinue: () => void;
  colors: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (expanding) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
          Generating your script...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Feather name="alert-circle" size={32} color={colors.destructive} />
        <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          onPress={onRetry}
        >
          <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  if (!expandedScript) return null;

  return (
    <ScrollView contentContainerStyle={styles.stepScroll} showsVerticalScrollIndicator={false}>
      <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
        AI-generated script — review before rendering
      </Text>

      <View style={[styles.scriptCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.scriptSection}>
          <Text style={[styles.scriptSectionLabel, { color: colors.primary }]}>Hook</Text>
          <Text style={[styles.scriptText, { color: colors.foreground }]}>{expandedScript.hook}</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {expandedScript.scenes.map((scene) => (
          <View key={scene.sceneNumber} style={styles.sceneRow}>
            <View style={[styles.sceneBadge, { backgroundColor: `${colors.primary}20` }]}>
              <Text style={[styles.sceneNum, { color: colors.primary }]}>{scene.sceneNumber}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.sceneDesc, { color: colors.foreground }]}>{scene.description}</Text>
              <Text style={[styles.sceneDuration, { color: colors.mutedForeground }]}>
                {scene.duration} · {scene.visualDirection}
              </Text>
            </View>
          </View>
        ))}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.scriptSection}>
          <Text style={[styles.scriptSectionLabel, { color: colors.primary }]}>Call to Action</Text>
          <Text style={[styles.scriptText, { color: colors.foreground }]}>{expandedScript.callToAction}</Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
        onPress={onContinue}
      >
        <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
          Looks Good
        </Text>
        <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
      </Pressable>
    </ScrollView>
  );
}

function ModelStep({
  models, loading, selected, onSelect, onRender, error, colors, styles,
}: {
  models: RenderingModel[];
  loading: boolean;
  selected: RenderingModel | null;
  onSelect: (m: RenderingModel) => void;
  onRender: () => void;
  error: string;
  colors: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.stepScroll} showsVerticalScrollIndicator={false}>
      <Text style={[styles.stepHint, { color: colors.mutedForeground }]}>
        Choose the AI engine that renders your video
      </Text>

      {error ? (
        <View style={[styles.errorBox, { backgroundColor: `${colors.destructive}18`, borderColor: `${colors.destructive}40` }]}>
          <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
        </View>
      ) : null}

      <View style={{ gap: 10, marginBottom: 24 }}>
        {models.map((m) => {
          const isSelected = selected?.id === m.id;
          return (
            <Pressable
              key={m.id}
              style={[
                styles.modelCard,
                {
                  backgroundColor: isSelected ? `${colors.primary}15` : colors.card,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
              onPress={() => onSelect(m)}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.modelName, { color: colors.foreground }]}>{m.name}</Text>
                  {m.badge && (
                    <View style={[styles.modelBadge, { backgroundColor: `${colors.primary}20` }]}>
                      <Text style={[styles.modelBadgeText, { color: colors.primary }]}>{m.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.modelDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {m.description}
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  {m.capabilities.slice(0, 3).map((cap) => (
                    <View key={cap} style={[styles.capChip, { backgroundColor: colors.secondary }]}>
                      <Text style={[styles.capText, { color: colors.mutedForeground }]}>{cap}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View
                style={[
                  styles.radioCircle,
                  {
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? colors.primary : 'transparent',
                  },
                ]}
              >
                {isSelected && <Feather name="check" size={12} color={colors.primaryForeground} />}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.primaryBtn,
          {
            backgroundColor: selected ? colors.primary : colors.secondary,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
        onPress={onRender}
        disabled={!selected}
      >
        <Text style={[styles.primaryBtnText, { color: selected ? colors.primaryForeground : colors.mutedForeground }]}>
          Start Rendering
        </Text>
        <Feather name="film" size={16} color={selected ? colors.primaryForeground : colors.mutedForeground} />
      </Pressable>
    </ScrollView>
  );
}

function CreatingStep({
  creating, colors, styles,
}: {
  creating: boolean;
  colors: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.centered}>
      {creating ? (
        <>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={[styles.loadingText, { color: colors.foreground }]}>
            Submitting your video...
          </Text>
          <Text style={[styles.loadingSubtext, { color: colors.mutedForeground }]}>
            This won't take long
          </Text>
        </>
      ) : (
        <>
          <View style={[styles.successIcon, { backgroundColor: `${colors.primary}20` }]}>
            <Feather name="check" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.loadingText, { color: colors.foreground }]}>
            Video queued!
          </Text>
          <Text style={[styles.loadingSubtext, { color: colors.mutedForeground }]}>
            Redirecting to your projects...
          </Text>
        </>
      )}
    </View>
  );
}

function makeStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingBottom: 12,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 16 },
    stepDots: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 5, marginBottom: 16,
    },
    dot: { height: 8, borderRadius: 4 },
    stepScroll: { paddingHorizontal: 20, paddingBottom: 120, gap: 16 },
    stepHint: { fontFamily: 'Inter_400Regular', fontSize: 14, marginBottom: 4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    templateCard: {
      width: '47%', borderRadius: 14, borderWidth: 1,
      padding: 14, gap: 8,
    },
    templateIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    templateName: { fontFamily: 'Inter_500Medium', fontSize: 13 },
    templateMeta: { flexDirection: 'row', gap: 6 },
    templateTag: { fontFamily: 'Inter_400Regular', fontSize: 11, textTransform: 'capitalize' },
    templateDuration: { fontFamily: 'Inter_400Regular', fontSize: 11 },
    premiumBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
    premiumText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
    fieldGroup: { gap: 6 },
    label: { fontFamily: 'Inter_500Medium', fontSize: 13 },
    input: {
      height: 48, borderRadius: 10, borderWidth: 1,
      paddingHorizontal: 14, fontFamily: 'Inter_400Regular', fontSize: 15,
    },
    textarea: {
      minHeight: 100, borderRadius: 10, borderWidth: 1,
      padding: 12, fontFamily: 'Inter_400Regular', fontSize: 15,
    },
    platformRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    platformChip: {
      paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: 20, borderWidth: 1,
    },
    platformText: { fontFamily: 'Inter_500Medium', fontSize: 13, textTransform: 'capitalize' },
    primaryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, height: 52, borderRadius: 14, marginTop: 8,
    },
    primaryBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
    scriptCard: {
      borderRadius: 14, borderWidth: 1, padding: 16, gap: 14,
    },
    scriptSection: { gap: 6 },
    scriptSectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
    scriptText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 22 },
    divider: { height: 1 },
    sceneRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    sceneBadge: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    sceneNum: { fontFamily: 'Inter_700Bold', fontSize: 12 },
    sceneDesc: { fontFamily: 'Inter_500Medium', fontSize: 14 },
    sceneDuration: { fontFamily: 'Inter_400Regular', fontSize: 12 },
    modelCard: {
      flexDirection: 'row', alignItems: 'center',
      borderRadius: 14, borderWidth: 1, padding: 14, gap: 12,
    },
    modelName: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
    modelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    modelBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
    modelDesc: { fontFamily: 'Inter_400Regular', fontSize: 13 },
    capChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    capText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
    radioCircle: {
      width: 22, height: 22, borderRadius: 11, borderWidth: 2,
      alignItems: 'center', justifyContent: 'center',
    },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
    loadingText: { fontFamily: 'Inter_600SemiBold', fontSize: 18, textAlign: 'center', marginTop: 8 },
    loadingSubtext: { fontFamily: 'Inter_400Regular', fontSize: 14, textAlign: 'center' },
    successIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
    errorBox: { borderRadius: 10, borderWidth: 1, padding: 12 },
    errorText: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center' },
  });
}
