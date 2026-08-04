import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { useAuth } from '@/context/auth';
import { usePrivateImageUrl } from '@/hooks/usePrivateImageUrl';

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

// Models that support image conditioning
const IMAGE_CONDITION_MODELS = new Set(['wan', 'kling', 'kling-1.6']);

const DRAFT_KEY = '@quae/studio_draft';

/**
 * Upload an image to GCS via the 3-step presigned URL flow.
 * Returns the serving URL (e.g. /api/storage/objects/uploads/uuid).
 */
async function uploadImageToStorage(
  uri: string,
  mimeType: string,
  fileSize: number,
  token: string | null,
): Promise<string> {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  const baseUrl = domain ? `https://${domain}/api` : '/api';
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  // Step 1: Request a presigned URL
  const res = await fetch(`${baseUrl}/storage/uploads/request-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      name: 'product-image.jpg',
      size: fileSize,
      contentType: mimeType || 'image/jpeg',
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Failed to get upload URL');
  }
  const { uploadURL, objectPath, finalizeToken } = (await res.json()) as {
    uploadURL: string;
    objectPath: string;
    finalizeToken: string;
  };

  // Step 2: Fetch the local file and PUT directly to GCS
  const fileRes = await fetch(uri);
  const blob = await fileRes.blob();
  const uploadRes = await fetch(uploadURL, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': mimeType || 'image/jpeg' },
  });
  if (!uploadRes.ok) throw new Error('Failed to upload image to storage');

  // Step 3: Finalize — set ACL ownership
  const finalizeRes = await fetch(`${baseUrl}/storage/uploads/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ objectPath, finalizeToken }),
  });
  if (!finalizeRes.ok) {
    const err = (await finalizeRes.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? 'Failed to finalize upload');
  }

  return `/api/storage${objectPath}`;
}

export default function CreateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { token, user } = useAuth();

  const [step, setStep] = useState<Step>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState('');
  const [expandedScript, setExpandedScript] = useState<ExpandedScript | null>(null);
  const [selectedModel, setSelectedModel] = useState<RenderingModel | null>(null);
  const [voiceId, setVoiceId] = useState('alloy');
  const [scriptError, setScriptError] = useState('');

  // Product image state
  const [productImageUrl, setProductImageUrl] = useState<string | null>(null);
  const [imagePreviewUri, setImagePreviewUri] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState('');
  // resolvedImageUri: signed GCS URL when imagePreviewUri is a storage path (draft restore),
  // or the local URI unchanged for fresh picker results.
  const resolvedImageUri = usePrivateImageUrl(imagePreviewUri);

  const { data: templates, isLoading: templatesLoading } = useListTemplates();
  const { data: models, isLoading: modelsLoading } = useListRenderingModels();
  const { mutateAsync: expandPrompt, isPending: expanding } = useExpandPrompt();
  const { mutateAsync: createProject, isPending: creating } = useCreateProject();

  // ── Draft persistence ──────────────────────────────────────────────────────

  // Restore draft on first mount
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const draft = JSON.parse(raw) as {
            step?: Step;
            selectedTemplate?: Template;
            productName?: string;
            description?: string;
            platform?: string;
            expandedScript?: ExpandedScript;
            selectedModel?: RenderingModel;
            voiceId?: string;
            productImageUrl?: string;
          };
          // Never restore mid-render state
          if (!draft.step || draft.step === 'creating') return;
          setStep(draft.step);
          if (draft.selectedTemplate) setSelectedTemplate(draft.selectedTemplate);
          if (draft.productName) setProductName(draft.productName);
          if (draft.description) setDescription(draft.description);
          if (draft.platform) setPlatform(draft.platform);
          if (draft.expandedScript) setExpandedScript(draft.expandedScript);
          if (draft.selectedModel) setSelectedModel(draft.selectedModel);
          if (draft.voiceId) setVoiceId(draft.voiceId);
          if (draft.productImageUrl) {
            setProductImageUrl(draft.productImageUrl);
            // Use the served URL as the image preview (local URI is no longer valid)
            setImagePreviewUri(draft.productImageUrl);
          }
        } catch {
          // Ignore malformed draft
        }
      })
      .catch(() => {/* ignore storage errors */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-select Wan 2.5 as the default model when models load and nothing is chosen from a draft
  useEffect(() => {
    if (!models?.length || selectedModel) return;
    const wan = models.find((m) => m.id === 'wan') ?? models[0];
    if (wan) setSelectedModel(wan);
  }, [models]);

  // Persist draft whenever relevant state changes
  useEffect(() => {
    // Don't snapshot the transient "creating" state
    if (step === 'creating') return;
    const draft = {
      step,
      selectedTemplate,
      productName,
      description,
      platform,
      expandedScript,
      selectedModel,
      voiceId,
      productImageUrl,
    };
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {/* ignore */});
  }, [step, selectedTemplate, productName, description, platform, expandedScript, selectedModel, voiceId, productImageUrl]);

  const clearDraft = useCallback(() => {
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {/* ignore */});
  }, []);

  // ── End draft persistence ──────────────────────────────────────────────────

  const stepIndex = STEPS.indexOf(step);

  const goBack = () => {
    // Guard: confirm before discarding manually-edited scripts
    if (step === 'script' && scriptEdited) {
      Alert.alert(
        'Discard script edits?',
        'Going back will clear your edited script. You can regenerate it fresh from the previous step.',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard & go back',
            style: 'destructive',
            onPress: () => {
              setExpandedScript(null);
              setScriptEdited(false);
              setStep('describe');
            },
          },
        ],
        { cancelable: true },
      );
      return;
    }
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const handleTemplateSelect = (t: Template) => {
    setSelectedTemplate(t);
    void Haptics.selectionAsync();
    setStep('describe');
  };

  const handlePickImage = async () => {
    setImageError('');
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setImageError('Photo library access is required to attach a product image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (!asset.uri) return;

    const mimeType = asset.mimeType ?? 'image/jpeg';
    const fileSize = asset.fileSize ?? 0;

    setImagePreviewUri(asset.uri);
    setImageUploading(true);
    try {
      const servingUrl = await uploadImageToStorage(asset.uri, mimeType, fileSize, token);
      setProductImageUrl(servingUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not upload image. Please try again.';
      setImageError(msg);
      setImagePreviewUri(null);
      setProductImageUrl(null);
    } finally {
      setImageUploading(false);
    }
  };

  const handleRemoveImage = () => {
    setProductImageUrl(null);
    setImagePreviewUri(null);
    setImageError('');
  };

  // Tracks whether the user has manually edited the generated script (scene regeneration)
  const [scriptEdited, setScriptEdited] = useState(false);

  // Per-scene regeneration
  const [regeneratingSceneIndex, setRegeneratingSceneIndex] = useState<number | null>(null);

  const handleRegenerateScene = useCallback(async (sceneIndex: number, hint: string) => {
    if (!expandedScript) return;
    const scene = expandedScript.scenes[sceneIndex];
    if (!scene) return;

    setRegeneratingSceneIndex(sceneIndex);
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      const baseUrl = domain ? `https://${domain}/api` : '/api';
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(`${baseUrl}/studio/regenerate-scene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          sceneNumber: scene.sceneNumber,
          currentDescription: scene.description,
          currentVisualDirection: scene.visualDirection,
          totalScenes: expandedScript.scenes.length,
          productName: productName.trim(),
          description: description.trim(),
          platform: platform || undefined,
          duration: selectedTemplate?.duration ?? undefined,
          templateName: selectedTemplate?.name ?? undefined,
          hint: hint.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Regeneration failed');
      }

      const updated = (await res.json()) as { description: string; visualDirection: string };
      setExpandedScript((prev) => {
        if (!prev) return prev;
        const newScenes = prev.scenes.map((s, i) =>
          i === sceneIndex
            ? { ...s, description: updated.description, visualDirection: updated.visualDirection }
            : s,
        );
        return { ...prev, scenes: newScenes };
      });
      setScriptEdited(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Regeneration failed — please try again';
      Alert.alert('Regenerate Scene', msg);
    } finally {
      setRegeneratingSceneIndex(null);
    }
  }, [expandedScript, productName, description, platform, selectedTemplate, token]);

  // Wrapper setters: automatically clear a stale script when key inputs change after generation
  const handleSetProductName = (value: string) => {
    if (expandedScript && value !== productName) setExpandedScript(null);
    setProductName(value);
  };
  const handleSetDescription = (value: string) => {
    if (expandedScript && value !== description) setExpandedScript(null);
    setDescription(value);
  };
  const handleSetPlatform = (value: string) => {
    if (expandedScript && value !== platform) setExpandedScript(null);
    setPlatform(value);
  };

  const handleDescribeContinue = async () => {
    if (!productName.trim()) return;
    setScriptError('');
    setScriptEdited(false);
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

  // Credit cost threshold — models at or above this get a confirmation prompt
  const CONFIRM_CREDIT_THRESHOLD = 100;

  const handleRender = async () => {
    if (!selectedModel) return;

    const renderCost: number = (selectedModel as any).creditCost ?? 30;
    const userCredits = user?.credits ?? 0;
    const afterBalance = userCredits - renderCost;

    // Show confirmation for expensive models
    if (renderCost >= CONFIRM_CREDIT_THRESHOLD) {
      const balanceLine = `Your balance: ${userCredits} credits\nAfter render: ${Math.max(0, afterBalance)} credits`;
      const insufficient = afterBalance < 0;

      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Confirm Render',
          `Model: ${selectedModel.name}\nCost: ${renderCost} credits\n\n${balanceLine}${insufficient ? '\n\n⚠ Not enough credits for this render.' : ''}`,
          insufficient
            ? [{ text: 'OK', style: 'cancel', onPress: () => resolve(false) }]
            : [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Confirm & Render', style: 'default', onPress: () => resolve(true) },
              ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      });

      if (!confirmed) return;
    }

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
          productImageUrl: productImageUrl ?? null,
          voiceId: voiceId || 'alloy',
        },
      });
      void queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetProjectStatsQueryKey() });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clearDraft();
      // Reset wizard
      setTimeout(() => {
        setStep('template');
        setSelectedTemplate(null);
        setProductName('');
        setDescription('');
        setPlatform('');
        setExpandedScript(null);
        setSelectedModel(null);
        setVoiceId('alloy');
        setProductImageUrl(null);
        setImagePreviewUri(null);
        setImageError('');
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
            setProductName={handleSetProductName}
            description={description}
            setDescription={handleSetDescription}
            platform={platform}
            setPlatform={handleSetPlatform}
            imagePreviewUri={imagePreviewUri}
            resolvedImageUri={resolvedImageUri}
            imageUploading={imageUploading}
            imageError={imageError}
            hasUploadedImage={!!productImageUrl}
            onPickImage={handlePickImage}
            onRemoveImage={handleRemoveImage}
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
            onRegenerateScene={handleRegenerateScene}
            regeneratingSceneIndex={regeneratingSceneIndex}
            colors={colors}
            styles={styles}
          />
        )}

        {step === 'model' && (
          <ModelStep
            models={models ?? []}
            loading={modelsLoading}
            selected={selectedModel}
            hasProductImage={!!productImageUrl}
            onSelect={handleModelSelect}
            onRender={handleRender}
            voiceId={voiceId}
            onVoiceChange={setVoiceId}
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
  platform, setPlatform,
  imagePreviewUri, resolvedImageUri, imageUploading, imageError, hasUploadedImage,
  onPickImage, onRemoveImage, onContinue,
  colors, styles,
}: {
  productName: string; setProductName: (v: string) => void;
  description: string; setDescription: (v: string) => void;
  platform: string; setPlatform: (v: string) => void;
  imagePreviewUri: string | null;
  resolvedImageUri: string | null;
  imageUploading: boolean;
  imageError: string;
  hasUploadedImage: boolean;
  onPickImage: () => void;
  onRemoveImage: () => void;
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

      {/* Product image picker */}
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>
          Product image <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }}>(optional · improves Wan/Kling quality)</Text>
        </Text>

        {imagePreviewUri ? (
          <View style={[styles.imagePreviewWrap, { borderColor: hasUploadedImage ? colors.primary : colors.border }]}>
            <Image source={resolvedImageUri ? { uri: resolvedImageUri } : undefined} style={styles.imagePreview} resizeMode="cover" />
            {imageUploading && (
              <View style={styles.imageOverlay}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.imageOverlayText}>Uploading…</Text>
              </View>
            )}
            {!imageUploading && (
              <Pressable
                style={[styles.imageRemoveBtn, { backgroundColor: colors.destructive }]}
                onPress={onRemoveImage}
                hitSlop={8}
              >
                <Feather name="x" size={12} color="#fff" />
              </Pressable>
            )}
            {!imageUploading && hasUploadedImage && (
              <View style={[styles.imageReadyBadge, { backgroundColor: `${colors.primary}CC` }]}>
                <Feather name="check" size={10} color="#fff" />
                <Text style={styles.imageReadyText}>Uploaded</Text>
              </View>
            )}
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.imagePickerBtn,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
            onPress={onPickImage}
          >
            <Feather name="image" size={20} color={colors.mutedForeground} />
            <Text style={[styles.imagePickerText, { color: colors.mutedForeground }]}>
              Tap to attach product image
            </Text>
          </Pressable>
        )}

        {imageError ? (
          <Text style={[styles.imageErrorText, { color: colors.destructive }]}>{imageError}</Text>
        ) : null}
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
        disabled={!productName.trim() || imageUploading}
      >
        <Text style={[styles.primaryBtnText, { color: productName.trim() ? colors.primaryForeground : colors.mutedForeground }]}>
          {imageUploading ? 'Uploading image…' : 'Generate Script'}
        </Text>
        {!imageUploading && (
          <Feather name="zap" size={16} color={productName.trim() ? colors.primaryForeground : colors.mutedForeground} />
        )}
      </Pressable>
    </ScrollView>
  );
}

function ScriptStep({
  expanding, expandedScript, error, onRetry, onContinue,
  onRegenerateScene, regeneratingSceneIndex,
  colors, styles,
}: {
  expanding: boolean;
  expandedScript: ExpandedScript | null;
  error: string;
  onRetry: () => void;
  onContinue: () => void;
  onRegenerateScene: (sceneIndex: number, hint: string) => Promise<void>;
  regeneratingSceneIndex: number | null;
  colors: ReturnType<typeof useColors>;
  styles: ReturnType<typeof makeStyles>;
}) {
  // Local state for the per-scene hint UX
  const [expandedHintIndex, setExpandedHintIndex] = useState<number | null>(null);
  const [hintMap, setHintMap] = useState<Record<number, string>>({});

  const handleRegenTap = (sceneIndex: number) => {
    void Haptics.selectionAsync();
    setExpandedHintIndex((prev) => (prev === sceneIndex ? null : sceneIndex));
  };

  const handleConfirmRegen = async (sceneIndex: number) => {
    const hint = hintMap[sceneIndex] ?? '';
    setExpandedHintIndex(null);
    setHintMap((prev) => { const next = { ...prev }; delete next[sceneIndex]; return next; });
    await onRegenerateScene(sceneIndex, hint);
  };

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
        AI-generated script — tap Regenerate on any scene to rewrite it
      </Text>

      <View style={[styles.scriptCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.scriptSection}>
          <Text style={[styles.scriptSectionLabel, { color: colors.primary }]}>Hook</Text>
          <Text style={[styles.scriptText, { color: colors.foreground }]}>{expandedScript.hook}</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {expandedScript.scenes.map((scene, sceneIndex) => {
          const isRegenerating = regeneratingSceneIndex === sceneIndex;
          const isHintOpen = expandedHintIndex === sceneIndex;
          return (
            <View key={scene.sceneNumber}>
              <View style={styles.sceneRow}>
                <View style={[styles.sceneBadge, { backgroundColor: `${colors.primary}20` }]}>
                  {isRegenerating ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={[styles.sceneNum, { color: colors.primary }]}>{scene.sceneNumber}</Text>
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.sceneDesc, { color: isRegenerating ? colors.mutedForeground : colors.foreground }]}>
                    {scene.description}
                  </Text>
                  <Text style={[styles.sceneDuration, { color: colors.mutedForeground }]}>
                    {scene.duration} · {scene.visualDirection}
                  </Text>
                  {/* Regenerate button row */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.regenBtn,
                      { borderColor: colors.border, opacity: (pressed || isRegenerating) ? 0.6 : 1 },
                    ]}
                    onPress={() => handleRegenTap(sceneIndex)}
                    disabled={isRegenerating || regeneratingSceneIndex !== null}
                    hitSlop={6}
                  >
                    <Feather name="refresh-cw" size={11} color={colors.mutedForeground} />
                    <Text style={[styles.regenBtnText, { color: colors.mutedForeground }]}>
                      {isRegenerating ? 'Regenerating…' : 'Regenerate'}
                    </Text>
                  </Pressable>
                  {/* Optional hint input, shown when this scene's regen is tapped */}
                  {isHintOpen && !isRegenerating && (
                    <View style={[styles.hintBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                      <TextInput
                        style={[styles.hintInput, { color: colors.foreground, borderColor: colors.border }]}
                        placeholder="Optional: guide the AI (e.g. 'more energetic')"
                        placeholderTextColor={colors.mutedForeground}
                        value={hintMap[sceneIndex] ?? ''}
                        onChangeText={(v) => setHintMap((prev) => ({ ...prev, [sceneIndex]: v }))}
                        returnKeyType="done"
                        maxLength={200}
                      />
                      <View style={styles.hintActions}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.hintCancelBtn,
                            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
                          ]}
                          onPress={() => setExpandedHintIndex(null)}
                        >
                          <Text style={[styles.hintCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          style={({ pressed }) => [
                            styles.hintGoBtn,
                            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
                          ]}
                          onPress={() => void handleConfirmRegen(sceneIndex)}
                        >
                          <Feather name="refresh-cw" size={13} color={colors.primaryForeground} />
                          <Text style={[styles.hintGoText, { color: colors.primaryForeground }]}>Regenerate</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            </View>
          );
        })}

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.scriptSection}>
          <Text style={[styles.scriptSectionLabel, { color: colors.primary }]}>Call to Action</Text>
          <Text style={[styles.scriptText, { color: colors.foreground }]}>{expandedScript.callToAction}</Text>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
        onPress={onContinue}
        disabled={regeneratingSceneIndex !== null}
      >
        <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
          Looks Good
        </Text>
        <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
      </Pressable>
    </ScrollView>
  );
}

const VOICE_OPTIONS: { id: string; label: string; description: string }[] = [
  { id: 'alloy', label: 'Alloy', description: 'Neutral & clear' },
  { id: 'echo', label: 'Echo', description: 'Warm & deep' },
  { id: 'fable', label: 'Fable', description: 'Expressive & storytelling' },
  { id: 'onyx', label: 'Onyx', description: 'Rich & authoritative' },
  { id: 'nova', label: 'Nova', description: 'Energetic & bright' },
  { id: 'shimmer', label: 'Shimmer', description: 'Soft & friendly' },
];

function ModelStep({
  models, loading, selected, hasProductImage, onSelect, onRender, voiceId, onVoiceChange, error, colors, styles,
}: {
  models: RenderingModel[];
  loading: boolean;
  selected: RenderingModel | null;
  hasProductImage: boolean;
  onSelect: (m: RenderingModel) => void;
  onRender: () => void;
  voiceId: string;
  onVoiceChange: (v: string) => void;
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
          const supportsImage = IMAGE_CONDITION_MODELS.has(m.id);
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={[styles.modelName, { color: colors.foreground }]}>{m.name}</Text>
                  {m.badge && (
                    <View style={[styles.modelBadge, { backgroundColor: `${colors.primary}20` }]}>
                      <Text style={[styles.modelBadgeText, { color: colors.primary }]}>{m.badge}</Text>
                    </View>
                  )}
                  {supportsImage && hasProductImage && (
                    <View style={[styles.modelBadge, { backgroundColor: `${colors.primary}30`, flexDirection: 'row', alignItems: 'center', gap: 3 }]}>
                      <Feather name="image" size={9} color={colors.primary} />
                      <Text style={[styles.modelBadgeText, { color: colors.primary }]}>Image</Text>
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

      {/* Voice picker */}
      <View style={{ marginBottom: 24 }}>
        <Text style={[styles.label, { color: colors.mutedForeground, marginBottom: 10 }]}>
          Narrator Voice
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {VOICE_OPTIONS.map((v) => {
            const isSelected = voiceId === v.id;
            return (
              <Pressable
                key={v.id}
                onPress={() => onVoiceChange(v.id)}
                style={[
                  {
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.primary : colors.border,
                    backgroundColor: isSelected ? `${colors.primary}18` : colors.card,
                    minWidth: '45%',
                  },
                ]}
              >
                <Text style={{ color: isSelected ? colors.primary : colors.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                  {v.label}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 }}>
                  {v.description}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
    // Image picker styles
    imagePickerBtn: {
      height: 80, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed',
      alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10,
    },
    imagePickerText: { fontFamily: 'Inter_400Regular', fontSize: 14 },
    imagePreviewWrap: {
      height: 140, borderRadius: 12, borderWidth: 1.5, overflow: 'hidden',
    },
    imagePreview: { width: '100%', height: '100%' },
    imageOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center', justifyContent: 'center', gap: 6,
    },
    imageOverlayText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: '#fff' },
    imageRemoveBtn: {
      position: 'absolute', top: 8, right: 8,
      width: 22, height: 22, borderRadius: 11,
      alignItems: 'center', justifyContent: 'center',
    },
    imageReadyBadge: {
      position: 'absolute', bottom: 8, left: 8,
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    },
    imageReadyText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: '#fff' },
    imageErrorText: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
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
    // Per-scene regenerate controls
    regenBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      alignSelf: 'flex-start', marginTop: 6,
      paddingHorizontal: 10, paddingVertical: 4,
      borderRadius: 8, borderWidth: 1,
    },
    regenBtnText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
    hintBox: {
      marginTop: 8, borderRadius: 10, borderWidth: 1, padding: 10, gap: 8,
    },
    hintInput: {
      borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7,
      fontFamily: 'Inter_400Regular', fontSize: 13,
    },
    hintActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
    hintCancelBtn: {
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
    },
    hintCancelText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
    hintGoBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    },
    hintGoText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  });
}
