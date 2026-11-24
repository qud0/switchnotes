# SDD ledger — plan: docs/superpowers/plans/2026-11-24-config-drift-radar.md

## Pre-flight interface check
- Task 1 produces: `normalizeConfig`, `calculateNormalizedHash`.
- Task 2 produces: `type: 'config_change'` in `eventPulseParser`.
- Task 3 produces: `ConfigDriftService` with `enqueueDriftCheck`, `checkSwitchDrift`, `reconcileAccept`, `reconcileRollback`, `validateRollbackSafety`.
- Task 4 consumes: `ConfigDriftService` in `server/index.js` and `eventPulseDaemon.js`.
- Task 5 consumes: Drift API in `src/api.js`, `SwitchCard.jsx`, `ConfigBackupModal.jsx`.
- Pre-flight: No conflicts found. All interfaces align with spec.
