"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Plus, RefreshCw } from "lucide-react";
import AIAnalysisLoader from "@/components/configuration/AIAnalysisLoader";
import AIAnalysisResult from "@/components/configuration/AIAnalysisResult";
import ChallengeSummary from "@/components/configuration/ChallengeSummary";
import ConferenceBlueprint from "@/components/configuration/ConferenceBlueprint";
import ConfigurationLayout from "@/components/configuration/ConfigurationLayout";
import ConfigurationModeSelector from "@/components/configuration/ConfigurationModeSelector";
import ExpertPanelDisplay from "@/components/configuration/ExpertPanelDisplay";
import RoleCustomizationDialog from "@/components/configuration/RoleCustomizationDialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { authedFetch } from "@/lib/auth-token";
import { resolveEstimatedCost } from "@/lib/configuration/cost";
import { formatStrategy } from "@/lib/configuration/format";
import { useNavigate, useSearchParams } from "@/lib/router";
import type {
  ChallengeAnalysis,
  ConfigurationMode,
  ExpertRole,
  TemplateData,
} from "@/lib/configuration/types";

type TemplateMeta = {
  isDemo: boolean;
  ownerUserId: string | null;
  canEdit: boolean;
};

type ConfigurationRecord = {
  id: string;
  selected_mode: ConfigurationMode;
  expert_panel: unknown;
  analysis_payload: unknown;
  problem_type: string | null;
  complexity_score: number | null;
  strategy_reason: string | null;
  recommended_strategy: string | null;
  key_considerations: unknown;
  estimated_duration: number | null;
  estimated_cost_min: number | null;
  estimated_cost_max: number | null;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asExpertPanel = (value: unknown): ExpertRole[] =>
  Array.isArray(value) ? (value as ExpertRole[]) : [];

const extractAnalysis = (
  configuration: ConfigurationRecord,
  panel: ExpertRole[]
): ChallengeAnalysis | null => {
  if (isObjectRecord(configuration.analysis_payload)) {
    return configuration.analysis_payload as ChallengeAnalysis;
  }

  if (!configuration.problem_type || !panel.length) {
    return null;
  }

  return {
    problemType: configuration.problem_type,
    complexityScore: configuration.complexity_score ?? 5,
    complexityReason: "Loaded from saved configuration.",
    recommendedStrategy: configuration.recommended_strategy ?? "balanced_roundtable",
    strategyReason: configuration.strategy_reason ?? "Loaded from saved configuration.",
    keyConsiderations: Array.isArray(configuration.key_considerations)
      ? (configuration.key_considerations as string[])
      : [],
    expertPanel: panel,
    estimatedDuration: configuration.estimated_duration ?? 45,
    estimatedCost: {
      min: configuration.estimated_cost_min ?? 0,
      max: configuration.estimated_cost_max ?? 0,
    },
    analysisSource: "ai",
  };
};

const isUserDefinedExpert = (role: ExpertRole): boolean =>
  role.id.startsWith("role_custom_") ||
  /user-defined expert/i.test(role.whyIncluded);

const createUserDefinedExpertRole = ({
  panel,
}: {
  panel: ExpertRole[];
}): ExpertRole => {
  const defaultModel =
    panel[0]?.model ?? {
      provider: "google",
      modelId: "google/gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash",
    };
  const customCount = panel.filter(isUserDefinedExpert).length + 1;
  const localId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Date.now()}`;

  return {
    id: `role_custom_${localId}`,
    title: `Custom Expert ${customCount}`,
    category: "User Defined Expert",
    icon: "users",
    description:
      "Define the custom perspective this expert should contribute to the debate.",
    focusAreas: ["custom perspective"],
    behavior: {
      archetype: "analytical",
      temperature: 0.5,
      responseLength: "medium",
      interactionStyle: ["adds evidence", "responds to prior arguments"],
    },
    model: {
      provider: defaultModel.provider,
      modelId: defaultModel.modelId,
      displayName: defaultModel.displayName,
    },
    whyIncluded: "User-defined expert added in Custom Setup.",
    priority: "recommended",
  };
};

const filterExcludedRoles = (panel: ExpertRole[], excludedRoleIds: string[]) => {
  if (excludedRoleIds.length === 0) return panel;
  const excludedSet = new Set(excludedRoleIds);
  return panel.filter((role) => !excludedSet.has(role.id));
};

const Configure = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const templateId = searchParams.get("templateId");
  const [templateData, setTemplateData] = useState<TemplateData | null>(null);
  const [templateMeta, setTemplateMeta] = useState<TemplateMeta | null>(null);
  const [configurationId, setConfigurationId] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<ChallengeAnalysis | null>(null);
  const [selectedMode, setSelectedMode] = useState<ConfigurationMode>("quick-start");
  const [quickStartPanel, setQuickStartPanel] = useState<ExpertRole[]>([]);
  const [customExpertPanel, setCustomExpertPanel] = useState<ExpertRole[]>([]);
  const [quickExcludedRoleIds, setQuickExcludedRoleIds] = useState<string[]>([]);
  const [customExcludedRoleIds, setCustomExcludedRoleIds] = useState<string[]>([]);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customizingRoleId, setCustomizingRoleId] = useState<string | null>(null);
  const [customizingMode, setCustomizingMode] = useState<ConfigurationMode | null>(null);
  const [pendingCustomRole, setPendingCustomRole] = useState<ExpertRole | null>(null);
  const loadedTemplateIdRef = useRef<string | null>(null);

  const canEdit = Boolean(templateMeta?.canEdit);
  const isCustomMode = selectedMode === "custom";
  const activeModePanel = isCustomMode ? customExpertPanel : quickStartPanel;
  const activeExcludedRoleIds = isCustomMode ? customExcludedRoleIds : quickExcludedRoleIds;
  const quickIncludedPanel = useMemo(
    () => filterExcludedRoles(quickStartPanel, quickExcludedRoleIds),
    [quickExcludedRoleIds, quickStartPanel]
  );
  const customIncludedPanel = useMemo(
    () => filterExcludedRoles(customExpertPanel, customExcludedRoleIds),
    [customExcludedRoleIds, customExpertPanel]
  );
  const includedPanel = isCustomMode ? customIncludedPanel : quickIncludedPanel;
  const includedExpertCount = includedPanel.length;
  const activeExcludedRoleIdSet = useMemo(
    () => new Set(activeExcludedRoleIds),
    [activeExcludedRoleIds]
  );

  const customizingRole = useMemo(
    () =>
      pendingCustomRole ??
      quickStartPanel.find((role) => role.id === customizingRoleId) ??
      customExpertPanel.find((role) => role.id === customizingRoleId) ??
      null,
    [customExpertPanel, customizingRoleId, pendingCustomRole, quickStartPanel]
  );

  const userDefinedExpertCount = useMemo(
    () => customExpertPanel.filter(isUserDefinedExpert).length,
    [customExpertPanel]
  );

  const estimatedCost = useMemo(
    () => resolveEstimatedCost(includedPanel, aiAnalysis?.estimatedCost ?? null),
    [aiAnalysis?.estimatedCost, includedPanel]
  );

  const strategyLabel = useMemo(
    () => formatStrategy(aiAnalysis?.recommendedStrategy ?? ""),
    [aiAnalysis?.recommendedStrategy]
  );

  const persistConfiguration = useCallback(
    async ({
      template,
      draft,
      analysis,
      panel,
      mode,
    }: {
      template: TemplateData;
      draft: boolean;
      analysis: ChallengeAnalysis | null;
      panel: ExpertRole[];
      mode: ConfigurationMode;
    }): Promise<string> => {
      const response = await authedFetch("/api/conference-configurations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          selectedMode: mode,
          templateData: template,
          aiAnalysis: analysis ?? undefined,
          expertPanel: panel,
          isDraft: draft,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { configurationId?: string; error?: string }
        | null;
      if (!response.ok || !payload?.configurationId) {
        throw new Error(payload?.error ?? "Failed to save configuration.");
      }

      return payload.configurationId;
    },
    []
  );

  const analyzeChallenge = useCallback(
    async (
      seedTemplate: TemplateData,
      mode: ConfigurationMode,
      forceRefresh: boolean
    ): Promise<ChallengeAnalysis> => {
      const response = await authedFetch("/api/analyze-challenge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          templateData: seedTemplate,
          selectedMode: mode,
          forceRefresh,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { analysis?: ChallengeAnalysis; error?: string }
        | null;

      if (!response.ok || !payload?.analysis) {
        throw new Error(payload?.error ?? "Failed to analyze challenge.");
      }

      return payload.analysis;
    },
    []
  );

  const seedAndPersistConfiguration = useCallback(
    async ({
      seedTemplate,
      isRefresh,
      mode,
    }: {
      seedTemplate: TemplateData;
      isRefresh: boolean;
      mode: ConfigurationMode;
    }) => {
      setIsAnalyzing(true);
      setLoadError(null);
      try {
        const analysis = await analyzeChallenge(seedTemplate, mode, isRefresh);
        const quickPanel = analysis.expertPanel ?? [];
        const modeForSave = isRefresh ? selectedMode : mode;
        const panelForSave = modeForSave === "custom" ? customIncludedPanel : quickPanel;

        setAiAnalysis(analysis);
        setQuickStartPanel(quickPanel);
        setQuickExcludedRoleIds([]);
        if (!isRefresh) {
          setSelectedMode(mode);
        }

        const savedConfigurationId = await persistConfiguration({
          template: seedTemplate,
          draft: false,
          analysis,
          panel: panelForSave,
          mode: modeForSave,
        });

        setConfigurationId(savedConfigurationId);
        setIsDirty(false);

        if (isRefresh) {
          toast({
            title: "Configuration refreshed",
            description: "AI generated a new configuration and saved it.",
          });
        }

        if (analysis.analysisSource === "heuristic") {
          toast({
            title: "Heuristic fallback used",
            description:
              "OpenRouter did not return valid JSON, so a local fallback configuration was used.",
          });
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to generate configuration.";
        setLoadError(message);
        toast({
          title: "Configuration failed",
          description: message,
          variant: "destructive",
        });
      } finally {
        setIsAnalyzing(false);
      }
    },
    [analyzeChallenge, customIncludedPanel, persistConfiguration, selectedMode, toast]
  );

  const loadConfiguration = useCallback(async () => {
    if (!templateId) return;
    setIsTemplateLoading(true);
    setLoadError(null);
    try {
      const response = await authedFetch(
        `/api/conference-configurations?templateId=${templateId}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = (await response.json().catch(() => null)) as
        | {
            template?: TemplateData;
            templateMeta?: TemplateMeta;
            configuration?: ConfigurationRecord | null;
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.template || !payload?.templateMeta) {
        throw new Error(payload?.error ?? "Failed to load template configuration.");
      }

      setTemplateData(payload.template);
      setTemplateMeta(payload.templateMeta);

      if (payload.configuration) {
        const configuration = payload.configuration;
        const persistedPanel = asExpertPanel(configuration.expert_panel);
        const persistedMode = configuration.selected_mode ?? "quick-start";
        const analysis = extractAnalysis(configuration, persistedPanel);
        const quickPanelFromAnalysis = analysis?.expertPanel ?? [];

        setConfigurationId(configuration.id);
        setSelectedMode(persistedMode);
        if (persistedMode === "custom") {
          setCustomExpertPanel(persistedPanel);
          setCustomExcludedRoleIds([]);
          setQuickStartPanel(quickPanelFromAnalysis);
          setQuickExcludedRoleIds([]);
        } else {
          setQuickStartPanel(persistedPanel);
          setQuickExcludedRoleIds([]);
          setCustomExpertPanel([]);
          setCustomExcludedRoleIds([]);
        }
        setAiAnalysis(analysis);
        setIsDirty(false);
        return;
      }

      setConfigurationId(null);
      setAiAnalysis(null);
      setSelectedMode("quick-start");
      setQuickStartPanel([]);
      setCustomExpertPanel([]);
      setQuickExcludedRoleIds([]);
      setCustomExcludedRoleIds([]);

      if (!payload.templateMeta.canEdit) {
        setLoadError(
          payload.templateMeta.isDemo
            ? "This demo configuration has not been published yet."
            : "You do not have permission to generate this configuration."
        );
        return;
      }

      await seedAndPersistConfiguration({
        seedTemplate: payload.template,
        isRefresh: false,
        mode: "quick-start",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load configuration.";
      setLoadError(message);
      toast({
        title: "Load failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsTemplateLoading(false);
    }
  }, [seedAndPersistConfiguration, templateId, toast]);

  useEffect(() => {
    if (!templateId) {
      toast({
        title: "Template required",
        description: "Choose a template first, then configure the AI panel.",
        variant: "destructive",
      });
      navigate("/templates");
      return;
    }

    if (loadedTemplateIdRef.current === templateId) {
      return;
    }
    loadedTemplateIdRef.current = templateId;
    void loadConfiguration();
  }, [loadConfiguration, navigate, templateId, toast]);

  const handleRoleSave = (nextRole: ExpertRole) => {
    if (!canEdit) return;
    const targetMode = customizingMode ?? selectedMode;
    const applyRoleToPanel = (previous: ExpertRole[]) => {
      const existingIndex = previous.findIndex((role) => role.id === nextRole.id);
      if (existingIndex >= 0) {
        return previous.map((role) => (role.id === nextRole.id ? nextRole : role));
      }
      return [...previous, nextRole];
    };
    if (targetMode === "custom") {
      setCustomExpertPanel(applyRoleToPanel);
    } else {
      setQuickStartPanel(applyRoleToPanel);
    }
    setIsDirty(true);
    setPendingCustomRole(null);
    setCustomizingMode(null);
  };

  const handleAddUserDefinedExpert = useCallback(() => {
    if (!canEdit) {
      toast({
        title: "Read-only configuration",
        description: "Only the template owner can customize roles.",
        variant: "destructive",
      });
      return;
    }

    const draftRole = createUserDefinedExpertRole({ panel: customExpertPanel });
    setPendingCustomRole(draftRole);
    setCustomizingMode("custom");
    setCustomizingRoleId(draftRole.id);
  }, [canEdit, customExpertPanel, toast]);

  const handleToggleRoleIncluded = useCallback(
    (roleId: string) => {
      if (!canEdit) {
        toast({
          title: "Read-only configuration",
          description: "Only the template owner can change included experts.",
          variant: "destructive",
        });
        return;
      }

      const isCurrentlyExcluded = activeExcludedRoleIdSet.has(roleId);
      if (!isCurrentlyExcluded && includedExpertCount <= 2) {
        toast({
          title: "Minimum 2 experts required",
          description: "Keep at least 2 experts included for conference runs.",
          variant: "destructive",
        });
        return;
      }

      const applyToggle = (previous: string[]) => {
        if (isCurrentlyExcluded) {
          return previous.filter((id) => id !== roleId);
        }
        return previous.includes(roleId) ? previous : [...previous, roleId];
      };

      if (isCustomMode) {
        setCustomExcludedRoleIds(applyToggle);
      } else {
        setQuickExcludedRoleIds(applyToggle);
      }
      setIsDirty(true);
    },
    [activeExcludedRoleIdSet, canEdit, includedExpertCount, isCustomMode, toast]
  );

  const handleSaveDraft = useCallback(async () => {
    if (!templateData || !canEdit) {
      toast({
        title: "Read-only configuration",
        description: "Only the template owner can save configuration changes.",
        variant: "destructive",
      });
      return;
    }

    try {
      const nextConfigurationId = await persistConfiguration({
        template: templateData,
        draft: true,
        analysis: aiAnalysis,
        panel: includedPanel,
        mode: selectedMode,
      });
      setConfigurationId(nextConfigurationId);
      setIsDirty(false);
      toast({
        title: "Draft saved",
        description: "Configuration draft saved for this template.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save draft.";
      toast({
        title: "Save failed",
        description: message,
        variant: "destructive",
      });
    }
  }, [
    aiAnalysis,
    canEdit,
    includedPanel,
    persistConfiguration,
    selectedMode,
    templateData,
    toast,
  ]);

  const handleLaunchConference = useCallback(async () => {
    if (!templateData) return;
    setIsLaunching(true);
    try {
      if (includedExpertCount < 2) {
        throw new Error("At least 2 experts must remain included before launching.");
      }

      if (canEdit && selectedMode === "custom" && userDefinedExpertCount < 2) {
        throw new Error(
          "Custom Setup requires at least 2 user-defined experts. Add more experts in Customize."
        );
      }

      let nextConfigurationId = configurationId;

      if (!canEdit && !nextConfigurationId) {
        throw new Error("This demo configuration has not been published yet.");
      }

      if (canEdit && (!nextConfigurationId || isDirty)) {
        nextConfigurationId = await persistConfiguration({
          template: templateData,
          draft: false,
          analysis: aiAnalysis,
          panel: includedPanel,
          mode: selectedMode,
        });
        setConfigurationId(nextConfigurationId);
        setIsDirty(false);
      }

      const params = new URLSearchParams();
      params.set("config_id", nextConfigurationId!);
      params.set("configId", nextConfigurationId!);
      navigate(`/conference?${params.toString()}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to launch conference.";
      toast({
        title: "Launch failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLaunching(false);
    }
  }, [
    aiAnalysis,
    canEdit,
    configurationId,
    includedExpertCount,
    includedPanel,
    isDirty,
    navigate,
    persistConfiguration,
    selectedMode,
    templateData,
    toast,
    userDefinedExpertCount,
  ]);

  return (
    <div data-configure-page className="min-h-screen bg-[#1a1625] pb-8 text-slate-100">
      <ConfigurationLayout
        sidebar={
          <ConferenceBlueprint
            templateData={templateData}
            expertPanel={includedPanel}
            estimatedCost={estimatedCost}
            selectedMode={selectedMode}
            strategyLabel={strategyLabel}
            isLaunching={isLaunching}
            onLaunch={handleLaunchConference}
            onSaveDraft={() => {
              void handleSaveDraft();
            }}
          />
        }
      >
        <header className="space-y-3 rounded-xl border border-white/10 bg-[#2a2438] p-6">
          <button
            type="button"
            onClick={() => navigate("/templates")}
            className="inline-flex items-center gap-1 text-sm text-slate-400 transition-colors duration-200 hover:text-purple-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Templates
          </button>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Configure AI Panel
          </h1>
          <p className="text-sm text-slate-400">
            Review the challenge summary, tune the expert panel, and launch the conference.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {templateMeta?.isDemo && !canEdit ? (
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.1em] text-slate-300">
                Demo Configuration (Read-only)
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!templateData || !canEdit) return;
                void seedAndPersistConfiguration({
                  seedTemplate: templateData,
                  isRefresh: true,
                  mode: "quick-start",
                });
              }}
              disabled={isAnalyzing || !templateData || !canEdit}
              className="border-purple-500/30 bg-transparent text-purple-200 hover:bg-purple-500/10 hover:text-purple-100"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isAnalyzing ? "animate-spin" : ""}`} />
              Refresh AI Configuration
            </Button>
          </div>
        </header>

        <ChallengeSummary
          templateData={templateData}
          isLoading={isTemplateLoading}
          onEditTemplate={() => navigate("/templates")}
        />

        <ConfigurationModeSelector
          selectedMode={selectedMode}
          onModeChange={(mode) => {
            setSelectedMode(mode);
            if (canEdit) setIsDirty(true);
            if (mode === "custom" && canEdit && userDefinedExpertCount < 2) {
              toast({
                title: "Custom Setup requires at least 2 custom experts",
                description: "Add user-defined experts one at a time using the Customize panel.",
              });
            }
            setCustomizingRoleId(null);
            setPendingCustomRole(null);
            setCustomizingMode(null);
          }}
        />

        {isAnalyzing ? <AIAnalysisLoader /> : null}

        {!isAnalyzing && aiAnalysis ? (
          <>
            <AIAnalysisResult analysis={aiAnalysis} />
            {isCustomMode ? (
              <section className="space-y-3 rounded-xl border border-indigo-500/35 bg-indigo-500/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-indigo-100">Custom Setup Builder</p>
                    <p className="text-xs text-indigo-200/90">
                      Add user-defined experts one at a time and tune them in the power customizer panel.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={handleAddUserDefinedExpert}
                    disabled={!canEdit}
                    className="bg-blue-600 text-white hover:bg-blue-500"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Expert
                  </Button>
                </div>
                {userDefinedExpertCount < 2 ? (
                  <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    Warning: create at least 2 user-defined experts in Custom Setup before launching.
                    Current custom experts: {userDefinedExpertCount}/2.
                  </div>
                ) : (
                  <div className="rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                    Custom Setup requirement met: {userDefinedExpertCount} user-defined experts created.
                  </div>
                )}
              </section>
            ) : null}
            <ExpertPanelDisplay
              panel={activeModePanel}
              excludedRoleIds={activeExcludedRoleIds}
              onToggleRoleIncluded={handleToggleRoleIncluded}
              onRoleCustomize={(roleId) => {
                if (!canEdit) {
                  toast({
                    title: "Read-only configuration",
                    description: "Only the template owner can customize roles.",
                    variant: "destructive",
                  });
                  return;
                }
                setCustomizingMode(selectedMode);
                setCustomizingRoleId(roleId);
                setPendingCustomRole(null);
              }}
            />
          </>
        ) : null}

        {!isTemplateLoading && !isAnalyzing && loadError ? (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
            {loadError}
          </div>
        ) : null}
      </ConfigurationLayout>

      <RoleCustomizationDialog
        role={customizingRole}
        open={Boolean(customizingRole)}
        onOpenChange={(open) => {
          if (!open) {
            setCustomizingRoleId(null);
            setPendingCustomRole(null);
            setCustomizingMode(null);
          }
        }}
        onSave={handleRoleSave}
      />
    </div>
  );
};

export default Configure;
