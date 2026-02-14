import { useCallback, useEffect, useState, ReactNode } from 'react';
import { BYOKContext } from '@/hooks/useBYOK';
import { registerBYOKClear } from '@/hooks/useAuth';
import { DEFAULT_AVATAR_ORDER, SMART_DEFAULTS } from '@/data/openRouterModels';
import { authedFetch } from '@/lib/auth-token';
import { useAuth } from '@/hooks/useAuth';

interface OpenRouterState {
  selectedModels: string[];
  activeModels: string[];
  avatarOrder: string[];
}

const STORAGE_KEY = 'byok_openrouter';
const DEFAULT_STATE: OpenRouterState = {
  selectedModels: ['openai/gpt-4o', 'anthropic/claude-opus-4'],
  activeModels: ['openai/gpt-4o', 'anthropic/claude-opus-4'],
  avatarOrder: DEFAULT_AVATAR_ORDER,
};

export const BYOKProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [state, setState] = useState<OpenRouterState>(DEFAULT_STATE);
  const [hasStoredOpenRouterKey, setHasStoredOpenRouterKey] = useState(false);
  const [hasDevFallbackOpenRouterKey, setHasDevFallbackOpenRouterKey] = useState(false);
  const [keyLast4, setKeyLast4] = useState<string | null>(null);
  const [lastValidatedAt, setLastValidatedAt] = useState<string | null>(null);
  const [lastValidationStatus, setLastValidationStatus] = useState<'unknown' | 'success' | 'failed'>('unknown');
  const [lastValidationError, setLastValidationError] = useState<string | null>(null);
  const [needsRevalidation, setNeedsRevalidation] = useState(false);
  const [isLoadingKeyStatus, setIsLoadingKeyStatus] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Partial<OpenRouterState>;
        setState((prev) => ({
          ...prev,
          selectedModels: parsed.selectedModels ?? prev.selectedModels,
          activeModels: parsed.activeModels ?? prev.activeModels,
          avatarOrder: parsed.avatarOrder ?? prev.avatarOrder,
        }));
      } catch (e) {
        console.error('[BYOKProvider] Failed to parse stored state:', e);
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    const persistableState = {
      selectedModels: state.selectedModels,
      activeModels: state.activeModels,
      avatarOrder: state.avatarOrder,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState));
  }, [state.selectedModels, state.activeModels, state.avatarOrder]);

  const refreshStoredKeyStatus = useCallback(async () => {
    if (!user) {
      setHasStoredOpenRouterKey(false);
      setHasDevFallbackOpenRouterKey(false);
      setKeyLast4(null);
      setLastValidatedAt(null);
      setLastValidationStatus('unknown');
      setLastValidationError(null);
      setNeedsRevalidation(false);
      return;
    }

    setIsLoadingKeyStatus(true);
    try {
      const response = await authedFetch('/api/settings/byok', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to load key status');
      }

      const payload = (await response.json()) as {
        hasStoredKey?: boolean;
        keyLast4?: string | null;
        hasDevFallbackKey?: boolean;
        lastValidatedAt?: string | null;
        lastValidationStatus?: 'unknown' | 'success' | 'failed';
        lastValidationError?: string | null;
        needsRevalidation?: boolean;
      };

      setHasStoredOpenRouterKey(Boolean(payload.hasStoredKey));
      setHasDevFallbackOpenRouterKey(Boolean(payload.hasDevFallbackKey));
      setKeyLast4(payload.keyLast4 ?? null);
      setLastValidatedAt(payload.lastValidatedAt ?? null);
      setLastValidationStatus(payload.lastValidationStatus ?? 'unknown');
      setLastValidationError(payload.lastValidationError ?? null);
      setNeedsRevalidation(Boolean(payload.needsRevalidation));
    } catch {
      setHasStoredOpenRouterKey(false);
      setHasDevFallbackOpenRouterKey(false);
      setKeyLast4(null);
      setLastValidatedAt(null);
      setLastValidationStatus('unknown');
      setLastValidationError(null);
      setNeedsRevalidation(false);
    } finally {
      setIsLoadingKeyStatus(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshStoredKeyStatus();
  }, [refreshStoredKeyStatus]);

  const setStoredKeyStatus = (status: {
    hasStoredKey: boolean;
    keyLast4: string | null;
    hasDevFallbackKey?: boolean;
    lastValidatedAt?: string | null;
    lastValidationStatus?: 'unknown' | 'success' | 'failed';
    lastValidationError?: string | null;
    needsRevalidation?: boolean;
  }) => {
    setHasStoredOpenRouterKey(status.hasStoredKey);
    if (typeof status.hasDevFallbackKey === 'boolean') {
      setHasDevFallbackOpenRouterKey(status.hasDevFallbackKey);
    }
    setKeyLast4(status.keyLast4);
    if (typeof status.lastValidatedAt !== 'undefined') {
      setLastValidatedAt(status.lastValidatedAt ?? null);
    }
    if (status.lastValidationStatus) {
      setLastValidationStatus(status.lastValidationStatus);
    }
    if (typeof status.lastValidationError !== 'undefined') {
      setLastValidationError(status.lastValidationError ?? null);
    }
    if (typeof status.needsRevalidation !== 'undefined') {
      setNeedsRevalidation(Boolean(status.needsRevalidation));
    }
  };

  const setSelectedModels = (models: string[]) => {
    setState((prev) => ({
      ...prev,
      selectedModels: models,
      activeModels: [
        ...prev.activeModels,
        ...models.filter((m) => !prev.activeModels.includes(m)),
      ],
    }));
  };

  const toggleModelActive = (modelId: string) => {
    setState((prev) => {
      const isActive = prev.activeModels.includes(modelId);
      return {
        ...prev,
        activeModels: isActive
          ? prev.activeModels.filter((id) => id !== modelId)
          : [...prev.activeModels, modelId],
      };
    });
  };

  const reorderAvatars = (newOrder: string[]) => {
    setState((prev) => ({ ...prev, avatarOrder: newOrder }));
  };

  const resetAvatarOrder = () => {
    setState((prev) => ({ ...prev, avatarOrder: DEFAULT_AVATAR_ORDER }));
  };

  const isModelActive = (modelId: string) => state.activeModels.includes(modelId);

  const getAvatarForModel = (modelId: string): string | null => {
    const avatarId = Object.keys(SMART_DEFAULTS).find(
      (key) => SMART_DEFAULTS[key] === modelId
    );
    if (avatarId) return avatarId;
    return `custom-${modelId.split('/')[1]}`;
  };

  const getModelForAvatar = (avatarId: string): string | null => {
    const matchingModel = state.selectedModels.find((modelId) => {
      const avatarForModel = getAvatarForModel(modelId);
      return avatarForModel === avatarId;
    });
    if (matchingModel) return matchingModel;
    return SMART_DEFAULTS[avatarId] || null;
  };

  const clearAllKeys = () => {
    setState(DEFAULT_STATE);
    setHasStoredOpenRouterKey(false);
    setHasDevFallbackOpenRouterKey(false);
    setKeyLast4(null);
    setLastValidatedAt(null);
    setLastValidationStatus('unknown');
    setLastValidationError(null);
    setNeedsRevalidation(false);
    sessionStorage.removeItem(STORAGE_KEY);
  };

  useEffect(() => {
    registerBYOKClear(clearAllKeys);
  }, []);

  return (
    <BYOKContext.Provider
      value={{
        selectedModels: state.selectedModels,
        activeModels: state.activeModels,
        avatarOrder: state.avatarOrder,
        hasStoredOpenRouterKey,
        hasDevFallbackOpenRouterKey,
        hasConfiguredOpenRouterKey: Boolean(hasStoredOpenRouterKey || hasDevFallbackOpenRouterKey),
        keyLast4,
        lastValidatedAt,
        lastValidationStatus,
        lastValidationError,
        needsRevalidation,
        isLoadingKeyStatus,
        setStoredKeyStatus,
        refreshStoredKeyStatus,
        setSelectedModels,
        toggleModelActive,
        reorderAvatars,
        resetAvatarOrder,
        isModelActive,
        getModelForAvatar,
        getAvatarForModel,
      }}
    >
      {children}
    </BYOKContext.Provider>
  );
};

