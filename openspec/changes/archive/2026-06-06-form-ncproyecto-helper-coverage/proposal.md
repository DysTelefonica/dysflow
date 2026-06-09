# Proposal: Form NCProyecto Helper Coverage

## Intent

Implement the documented intent of GitHub issue #50: move `Form_FormNCProyectoGestion` listing/search/filter/report-preparation behavior onto the canonical cache-aware helper/service seam instead of letting the form own business/list/report logic or call legacy constructor paths.

## Scope

In scope: project listing/search/filter/report-preparation flows in `Form_FormNCProyectoGestion`; helper/service extraction around `NCProyectoGestionListadoHelper`; safe wrapping or deprecation notes for legacy constructor list loaders only where proven safe for form-listing use.

Out of scope: audit forms; `Form_FormNCProyectoSeguimientoNC` unless separately approved; broad removal of constructor loaders used by non-list consumers.

## Approach

Use `NCProyectoGestionListadoHelper` as the canonical cache-aware path for project form listing data. Cache ON should prefer `TbCacheListadoNC`; cache OFF or cache errors should use a logged safe fallback, not silent N+1 rehydration. Keep the archived ERD snapshot only as supporting schema evidence.

## Evidence boundary

This proposal was reconstructed on 2026-06-09 from the archived placeholder (`archive.md`), its preserved backend ERD snapshot, and GitHub issue #50. Existing archive notes say this folder originally lacked proposal/design/spec/tasks artifacts; investigation shows issue #50's implementation commits reference the separate SDD key `cache-form-business-logic-extraction`, not `form-ncproyecto-helper-coverage`.
