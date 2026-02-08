import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { registerBYOKClear } from './useAuth';
import { DEFAULT_AVATAR_ORDER, SMART_DEFAULTS } from '@/data/openRouterModels';

interface OpenRouterState {
  openRouterKey: string | null;
  selectedModels: string[];
  activeModels: string[];
  avatarOrder: string[];
  storeKey: boolean;
}

interface BYOKContextType {
  openRouterKey: string | null;
  selectedModels: string[];
  activeModels: string[];
  avatarOrder: string[];
  storeKey: boolean;

  setOpenRouterKey: (key: string, shouldStore?: boolean) => void;
  clearOpenRouterKey: () => void;
  setSelectedModels: (models: string[]) => void;
  toggleModelActive: (modelId: string) => void;
  reorderAvatars: (newOrder: string[]) => void;
  resetAvatarOrder: () => void;
  isModelActive: (modelId: string) => boolean;

  getModelForAvatar: (avatarId: string) => string | null;
  getAvatarForModel: (modelId: string) => string | null;
}

export const BYOKContext = createContext<BYOKContextType | undefined>(undefined);

const STORAGE_KEY = 'byok_openrouter';
const DEFAULT_STATE: OpenRouterState = {
  openRouterKey: null,
  selectedModels: ['openai/gpt-4o', 'anthropic/claude-opus-4'],
  activeModels: ['openai/gpt-4o', 'anthropic/claude-opus-4'],
  avatarOrder: DEFAULT_AVATAR_ORDER,
  storeKey: true,
};

// BYOKProvider moved to separate file to satisfy react-refresh rule

export function useBYOK() {
  const context = useContext(BYOKContext);
  if (!context) {
    throw new Error('useBYOK must be used within BYOKProvider');
  }
  return context;
}
