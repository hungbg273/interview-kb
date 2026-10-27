# Markdown preview and Mermaid Implementation Plan

**Goal:** Toggle note source editing and live Markdown preview; render Mermaid in all note/result previews and guide new AI Markdown outputs.
**Approved design:** Preview by default (updated by user); preview unsaved text without mutation; modal is rendered-only; invalid diagrams display an error and source.
**Architecture:** A shared MarkdownPreview uses react-markdown/GFM. Fenced mermaid blocks load a client Mermaid renderer, validate and render SVG with strict settings and SVG sanitization. Generation/translation prompts include a dedicated Markdown format instruction; JSON question tasks stay unchanged.
**Tech Stack:** React, react-markdown, remark-gfm, Mermaid, DOMPurify, Vitest/Jest.

- [x] Tests: unsaved edit/preview roundtrip; valid and invalid diagrams, ordinary code, tables; Markdown-only modal; format prompt applied only to Markdown tasks.
- [x] Shared renderer and styling, editor toggle, topic content and modal wiring.
- [x] Dedicated AI format instruction, preserving existing structured JSON tasks.
- [x] Run relevant test suites, review security and async rendering, and verify Mermaid and modal in browser without saving test content.

Validation: 76 frontend tests and 116 backend tests pass; 7 queue integration tests were not enabled for this run. API TypeScript passes. Frontend TypeScript still reports pre-existing CSS import declarations and Vite dependency type conflicts. Browser verified flowchart + sequence labels/arrowheads, unsaved mode roundtrip and invalid syntax fallback; test drafts were discarded. Review found no important issues.

Runtime: lazy-load self-hosted prebuilt Mermaid ESM assets (prepared by npm predev/prebuild); this avoids Webpack exhausting the 1.9GiB Docker VM. SVG remains sanitized and isolated as an image.
