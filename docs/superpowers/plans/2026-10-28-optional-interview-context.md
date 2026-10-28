# Optional interview context

User requirement: JD, CV, subjects, and notes are individually optional. Require at least one source overall and allow combining JD + CV + library selections.

- [x] Extend setup with up to two reviewed documents (one JD and one CV), retaining optional legacy single-document fields for old sessions. No database migration is needed for the existing JSON snapshots.
- [x] Backend tests first: document-only, library-only, both documents, all sources, empty context, whitespace documents, malformed IDs, duplicate document kinds, ownership, aggregate context limits, and old-session compatibility.
- [x] Backend implementation: normalize reviewed documents, accept empty library selection, require nonempty context, count all document text in the aggregate 40,000-character limit, preserve individual 30,000-character limits, and use appropriate JD/CV/library-only prompts.
- [x] UI tests first: library-only and document-only review/start; simultaneous JD and CV; removing sources; empty context disabled; reviewed documents displayed and sent exactly.
- [x] UI implementation: retain document-type upload selector, keep one reviewed document per kind, show removable uploaded sources, label both documents and library selection optional, and require at least one overall. Review and live views must handle absent documents without blank labels or claiming CV/JD context exists.
- [x] Run suites/builds, independent review, rebuild/restart API, and smoke-test authenticated validation and previews without paid model calls.

## Verification

180 API tests and131 web tests passed;12 existing opt-in integration tests skipped. API/web production builds passed. Independent review found no material issue in document replacement/removal, empty-context enforcement, ownership, aggregate limits, legacy compatibility, or source-aware prompting. Docker API rebuilt; authenticated previews are verified without paid model calls. No database migration required.
