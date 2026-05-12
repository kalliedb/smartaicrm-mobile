# Contributing

## Branching

- `main` is the only long-lived branch. Tags on `main` cut releases.
- Feature branches: `feat/<sprint>-<slug>` (e.g. `feat/M2-quick-quote`).
- Bugfix branches: `fix/<sprint>-<slug>`.
- One PR per logical change. PR title must reference the sprint.

## Commits

Conventional Commits style:
- `feat(mobile): add Yoco tap-to-pay flow (M-5)`
- `fix(mobile): handle 401 retry race in interceptor`
- `chore(mobile): bump RN to 0.75.5`

## Pull requests

- At least one reviewer.
- Lint + typecheck + tests must pass.
- Screenshots for any UI-touching change (iOS + Android).
- For payment / auth / biometric / Yoco code, a second reviewer from the
  security-sensitive CODEOWNERS group is required.

## Code style

- Prettier + ESLint enforced (`npm run lint`).
- TypeScript strict mode. No `any` without an inline `// eslint-disable…`
  comment + reason.
- Component files: PascalCase. Hooks: `useFoo`. Stores: `useFooStore` or named.
- Imports use path aliases (`@screens/...`, `@theme/index`) — never deep relative imports.

## Sprint discipline

Each sprint has a dedicated milestone in GitHub Issues. Don't bleed
scope between sprints — open a follow-up issue instead.

## Testing

- Unit tests with Jest (`npm test`).
- Manual smoke test on both iOS and Android before merging anything
  that touches navigation, payments, or biometric flows.
- Beta cohort smoke pass before any App Store / Play Store submission.
