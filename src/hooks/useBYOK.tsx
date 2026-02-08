import { createContext, useContext } from 'react';

interface BYOKContextType {
  openRouterKey: string | null;
  selectedModels: string[];
  activeModels: string[];
  avatarOrder: string[];
  storeKey: boolean;
  hasStoredOpenRouterKey: boolean;
  hasConfiguredOpenRouterKey: boolean;
  keyLast4: string | null;
  isLoadingKeyStatus: boolean;

  setOpenRouterKey: (key: string, shouldStore?: boolean) => void;
  clearOpenRouterKey: () => void;
  setStoreKeyPreference: (store: boolean) => void;
  setStoredKeyStatus: (status: {
    hasStoredKey: boolean;
    keyLast4: string | null;
    storeKey: boolean;
  }) => void;
  refreshStoredKeyStatus: () => Promise<void>;
  setSelectedModels: (models: string[]) => void;
  toggleModelActive: (modelId: string) => void;
  reorderAvatars: (newOrder: string[]) => void;
  resetAvatarOrder: () => void;
  isModelActive: (modelId: string) => boolean;

  getModelForAvatar: (avatarId: string) => string | null;
  getAvatarForModel: (modelId: string) => string | null;
}

export const BYOKContext = createContext<BYOKContextType | undefined>(undefined);

// BYOKProvider moved to separate file to satisfy react-refresh rule

export function useBYOK() {
  const context = useContext(BYOKContext);
  if (!context) {
    throw new Error('useBYOK must be used within BYOKProvider');
  }
  return context;
}
