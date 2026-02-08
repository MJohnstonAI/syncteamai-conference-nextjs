import { useCallback, useEffect, useState, ReactNode } from 'react';
import { BYOKContext } from '@/hooks/useBYOK';
import { registerBYOKClear } from '@/hooks/useAuth';
import { DEFAULT_AVATAR_ORDER, SMART_DEFAULTS } from '@/data/openRouterModels';
import { authedFetch } from '@/lib/auth-token';
import { useAuth } from '@/hooks/useAuth';

interface OpenRouterState {
  openRouterKey: string | null;
  selectedModels: string[];
  activeModels: string[];
  avatarOrder: string[];
  storeKey: boolean;
}

const STORAGE_KEY = 'byok_openrouter';
const DEFAULT_STATE: OpenRouterState = {
  openRouterKey: null,
  selectedModels: ['openai/gpt-4o', 'anthropic/claude-opus-4'],
  activeModels: ['openai/gpt-4o', 'anthropic/claude-opus-4'],
  avatarOrder: DEFAULT_AVATAR_ORDER,
  storeKey: false,
};

export const BYOKProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [state, setState] = useState<OpenRouterState>(DEFAULT_STATE);
  const [hasStoredOpenRouterKey, setHasStoredOpenRouterKey] = useState(false);
  const [hasDevFallbackOpenRouterKey, setHasDevFallbackOpenRouterKey] = useState(false);
  const [keyLast4, setKeyLast4] = useState<string | null>(null);
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
          storeKey: parsed.storeKey ?? prev.storeKey,
          openRouterKey: null,
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
      storeKey: state.storeKey,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState));
  }, [state.selectedModels, state.activeModels, state.avatarOrder, state.storeKey]);

  const refreshStoredKeyStatus = useCallback(async () => {
    if (!user) {
      setHasStoredOpenRouterKey(false);
      setHasDevFallbackOpenRouterKey(false);
      setKeyLast4(null);
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
        storeKey?: boolean;
        hasDevFallbackKey?: boolean;
      };

      setHasStoredOpenRouterKey(Boolean(payload.hasStoredKey));
      setHasDevFallbackOpenRouterKey(Boolean(payload.hasDevFallbackKey));
      setKeyLast4(payload.keyLast4 ?? null);
      if (typeof payload.storeKey === 'boolean') {
        setState((prev) => ({ ...prev, storeKey: payload.storeKey }));
      }
    } catch {
      setHasStoredOpenRouterKey(false);
      setHasDevFallbackOpenRouterKey(false);
      setKeyLast4(null);
    } finally {
      setIsLoadingKeyStatus(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshStoredKeyStatus();
  }, [refreshStoredKeyStatus]);

  const setOpenRouterKey = (key: string, shouldStore = false) => {
    const sanitized = key.trim();
    setState((prev) => ({
      ...prev,
      openRouterKey: sanitized.length > 0 ? sanitized : null,
      storeKey: shouldStore,
    }));
  };

  const clearOpenRouterKey = () => {
    setState((prev) => ({ ...prev, openRouterKey: null }));
  };

  const setStoreKeyPreference = (store: boolean) => {
    setState((prev) => ({ ...prev, storeKey: store }));
  };

  const setStoredKeyStatus = (status: {
    hasStoredKey: boolean;
    keyLast4: string | null;
    storeKey: boolean;
    hasDevFallbackKey?: boolean;
  }) => {
    setHasStoredOpenRouterKey(status.hasStoredKey);
    if (typeof status.hasDevFallbackKey === 'boolean') {
      setHasDevFallbackOpenRouterKey(status.hasDevFallbackKey);
    }
    setKeyLast4(status.keyLast4);
    setState((prev) => ({ ...prev, storeKey: status.storeKey }));
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
    sessionStorage.removeItem(STORAGE_KEY);
  };

  useEffect(() => {
    registerBYOKClear(clearAllKeys);
  }, []);

  return (
    <BYOKContext.Provider
      value={{
        openRouterKey: state.openRouterKey,
        selectedModels: state.selectedModels,
        activeModels: state.activeModels,
        avatarOrder: state.avatarOrder,
        storeKey: state.storeKey,
        hasStoredOpenRouterKey,
        hasDevFallbackOpenRouterKey,
        hasConfiguredOpenRouterKey: Boolean(
          state.openRouterKey || hasStoredOpenRouterKey || hasDevFallbackOpenRouterKey
        ),
        keyLast4,
        isLoadingKeyStatus,
        setOpenRouterKey,
        clearOpenRouterKey,
        setStoreKeyPreference,
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

