# Drafts

This folder holds **AI-drafted posts awaiting Matt's review**. Nothing here is published.

## Workflow

1. A scheduled job drafts 1–2 posts per run (Mon/Wed/Fri mornings) from the
   latest wire headlines (`src/_data/wire.json`) and system signals
   (`src/_data/signals.json`), written in Matt's voice.
2. Drafts land here with `draft: true` in the front matter — Eleventy never
   builds them into the site.
3. Matt reviews and edits each draft (in chat or here in the folder).
4. To publish: move the finished file to `src/articles/`, remove `draft: true`,
   and rebuild.

## Rules for drafts

- Fresh, original content only — never rewrite Money & Markets pieces, and
  never use M&M-proprietary material (e.g., Green Zone Stock Power Ratings).
- Every draft gets Matt's eyes before it goes live. No auto-publishing, ever.
