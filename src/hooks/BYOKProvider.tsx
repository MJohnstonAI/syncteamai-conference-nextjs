import { useEffect, useState, ReactNode } from 'react';
import { BYOKContext } from '@/hooks/useBYOK';
import { registerBYOKClear } from '@/hooks/useAuth';
import { DEFAULT_AVATAR_ORDER, SMART_DEFAULTS } from '@/data/openRouterModels';

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
  storeKey: true,
};

export const BYOKProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<OpenRouterState>(DEFAULT_STATE);

  useEffect(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as OpenRouterState;
        setState(parsed.storeKey ? parsed : { ...parsed, openRouterKey: null });
      } catch (e) {
        console.error('[BYOKProvider] Failed to parse stored state:', e);
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    const persistableState = state.storeKey
      ? state
      : { ...state, openRouterKey: null };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState));
  }, [state]);

  const setOpenRouterKey = (key: string, shouldStore = true) => {
    setState((prev) => ({ ...prev, openRouterKey: key, storeKey: shouldStore }));
  };

  const clearOpenRouterKey = () => {
    setState((prev) => ({ ...prev, openRouterKey: null }));
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
        setOpenRouterKey,
        clearOpenRouterKey,
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

