import { createContext, useContext } from 'react';

interface BYOKContextType {
  selectedModels: string[];
  activeModels: string[];
  avatarOrder: string[];
  hasStoredOpenRouterKey: boolean;
  hasDevFallbackOpenRouterKey: boolean;
  hasConfiguredOpenRouterKey: boolean;
  keyLast4: string | null;
  lastValidatedAt: string | null;
  lastValidationStatus: "unknown" | "success" | "failed";
  lastValidationError: string | null;
  needsRevalidation: boolean;
  isLoadingKeyStatus: boolean;

  setStoredKeyStatus: (status: {
    hasStoredKey: boolean;
    keyLast4: string | null;
    hasDevFallbackKey?: boolean;
    lastValidatedAt?: string | null;
    lastValidationStatus?: "unknown" | "success" | "failed";
    lastValidationError?: string | null;
    needsRevalidation?: boolean;
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
