# Regression Report

- Node: v22.18.0
- NPM: 10.9.3
- Default branch: main
- Current branch: feature/openrouter-byok-v2
- Restore point: backup-before-openrouter-byok-v2 (ac80c28d84e60b69452e721bb5ab6d87d34210a4)

## Changed
REGRESSION_REPORT.md
package-lock.json
package.json
src/App.tsx
src/components/AvatarList.tsx
src/components/ModelSelectionDropdown.tsx
src/data/openRouterModels.ts
src/features/settings/ModelCacheSettings.tsx
src/hooks/BYOKProvider.tsx
src/hooks/useBYOK.tsx
src/index.css
src/pages/Conference.tsx
src/pages/Settings.tsx
src/pages/Subscribe.tsx
supabase/functions/ai-conference/index.ts
tmp_settings_old.txt
vite.config.ts

## Impacted
src/App.tsx
src/components/ActionRail.tsx
src/components/AvatarList.tsx
src/components/BYOKModal.tsx
src/components/ModelSelectionDropdown.tsx
src/hooks/useBYOK.tsx
src/hooks/BYOKProvider.tsx
src/pages/Conference.tsx
src/pages/Settings.tsx

## Lint
- OK: 0 warnings, 0 errors (changed/impacted)

## Typecheck
- OK: 0 errors

## Build
- OK: 0 warnings

## Tests
- No Vitest/Playwright configured
