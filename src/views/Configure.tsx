"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
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
  const [expertPanel, setExpertPanel] = useState<ExpertRole[]>([]);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [customizingRoleId, setCustomizingRoleId] = useState<string | null>(null);
  const loadedTemplateIdRef = useRef<string | null>(null);

  const canEdit = Boolean(templateMeta?.canEdit);

  const customizingRole = useMemo(
    () => expertPanel.find((role) => role.id === customizingRoleId) ?? null,
    [customizingRoleId, expertPanel]
  );

  const estimatedCost = useMemo(
    () => resolveEstimatedCost(expertPanel, aiAnalysis?.estimatedCost ?? null),
    [aiAnalysis?.estimatedCost, expertPanel]
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
        const panel = analysis.expertPanel ?? [];

        setAiAnalysis(analysis);
        setExpertPanel(panel);
        setSelectedMode(mode);

        const savedConfigurationId = await persistConfiguration({
          template: seedTemplate,
          draft: false,
          analysis,
          panel,
          mode,
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
    [analyzeChallenge, persistConfiguration, toast]
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
        const panel = asExpertPanel(configuration.expert_panel);
        const analysis = extractAnalysis(configuration, panel);

        setConfigurationId(configuration.id);
        setSelectedMode(configuration.selected_mode ?? "quick-start");
        setExpertPanel(panel);
        setAiAnalysis(analysis);
        setIsDirty(false);
        return;
      }

      setConfigurationId(null);
      setAiAnalysis(null);
      setExpertPanel([]);

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
    setExpertPanel((previous) =>
      previous.map((role) => (role.id === nextRole.id ? nextRole : role))
    );
    setIsDirty(true);
  };

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
        panel: expertPanel,
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
    expertPanel,
    persistConfiguration,
    selectedMode,
    templateData,
    toast,
  ]);

  const handleLaunchConference = useCallback(async () => {
    if (!templateData) return;
    setIsLaunching(true);
    try {
      let nextConfigurationId = configurationId;

      if (!nextConfigurationId || (canEdit && isDirty)) {
        if (!canEdit) {
          throw new Error("This configuration is read-only.");
        }
        nextConfigurationId = await persistConfiguration({
          template: templateData,
          draft: false,
          analysis: aiAnalysis,
          panel: expertPanel,
          mode: selectedMode,
        });
        setConfigurationId(nextConfigurationId);
        setIsDirty(false);
      }

      const params = new URLSearchParams();
      params.set("config_id", nextConfigurationId);
      params.set("configId", nextConfigurationId);
      params.set("title", templateData.problemStatement);
      params.set("script", templateData.script || "");
      params.set("prompt_id", templateData.id);
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
    expertPanel,
    isDirty,
    navigate,
    persistConfiguration,
    selectedMode,
    templateData,
    toast,
  ]);

  return (
    <div data-configure-page className="min-h-screen bg-[#1a1625] pb-8 text-slate-100">
      <ConfigurationLayout
        sidebar={
          <ConferenceBlueprint
            templateData={templateData}
            expertPanel={expertPanel}
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
                  mode: selectedMode,
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
          }}
        />

        {isAnalyzing ? <AIAnalysisLoader /> : null}

        {!isAnalyzing && aiAnalysis ? (
          <>
            <AIAnalysisResult analysis={aiAnalysis} />
            <ExpertPanelDisplay
              panel={expertPanel}
              onRoleCustomize={(roleId) => {
                if (!canEdit) {
                  toast({
                    title: "Read-only configuration",
                    description: "Only the template owner can customize roles.",
                    variant: "destructive",
                  });
                  return;
                }
                setCustomizingRoleId(roleId);
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
          if (!open) setCustomizingRoleId(null);
        }}
        onSave={handleRoleSave}
      />
    </div>
  );
};

export default Configure;
