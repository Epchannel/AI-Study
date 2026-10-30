# Academy delivery audit

## Current deployment and image chat - 2026-10-30

The public instance is https://chatbotvido.io.vn on a Windows VPS via Cloudflare Tunnel. Frontend origin is loopback port 3003 and API is port 8000. Public ingress allows Academy and exact health routes and denies legacy APIs. Runtime was restarted and checked for this release. Cold-boot startup before user login remains unverified. See [operations and rollback](guides/windows-vps-cloudflare.md).

Image chat supports validated PNG/JPEG/WebP uploads, private owner-scoped retrieval, normalized images, durable conversation metadata and optional multipart on the existing chat endpoint. It has no schema migration. Validation/ownership precede image decoding; processing is bounded in a dedicated executor. A single-process thread lock serializes turns. Historical attachments display privately but are not automatically resent to the model. Independent review of this implementation concluded with no remaining critical, high or medium findings.

| Check | Result and limit |
| --- | --- |
| Backend Academy, images and errors | 40 tests passed; command exited 1 because the whole-repository coverage threshold is 45% and this targeted run covered 7.60%. The overall command did not pass. |
| Image suite alone | 12 passed with coverage addopts disabled explicitly for the focused run. This does not satisfy the global coverage gate. |
| Frontend API/app/image tests | 12 passed; scoped ESLint and TypeScript passed. |
| Production frontend | Webpack production build passed; deployed home, assets and API readiness checked. |
| Live model and browser | HNQ `gpt-5.6-luna` recognized the synthetic red square / blue circle through Edge headless UI; upload and authenticated image fetch 200, unauthenticated fetch 401. Login form and full teacher/mobile flows were not verified by this check. |
| Public ingress | 33 path variants rejected: 404 except encoded NUL rejected with 400 by the parser; no redirects to legacy APIs. |

Commands for the release checks (paths refer to this instance's ignored test environment):

```powershell
# Repository root: 40 tests passed, exit 1 due to global coverage threshold.
.runtime/test-env/Scripts/python.exe -m pytest tests/test_academy.py tests/test_academy_images.py tests/test_academy_errors.py -q
# Focused image regression without repository coverage addopts:
.runtime/test-env/Scripts/python.exe -m pytest tests/test_academy_images.py -q -o addopts=''

# apps/web:
npm.cmd run test:run -- src/lib/academy-api.test.ts src/components/academy/academy-app.test.tsx src/components/academy/academy-chat-images.test.tsx
npx.cmd tsc --noEmit
npx.cmd eslint src/lib/academy-api.ts src/components/academy/academy-app.tsx src/components/academy/academy-chat-images.tsx src/components/academy/academy-pending-images.tsx
```

The ignored test environment is not bundled; create an equivalent environment with runtime and test dependencies on a fresh checkout. No full repository suite was run for this release. Earlier suite counts in this document are historical runs and must not be added together.

Known low-priority test gaps: direct chunked over-cap requests with missing/false Content-Length, exact aggregate 8 MiB boundary, animated WebP and injected partial-write failure lack dedicated cases. These paths were reviewed. Open signup has no verified per-account quota or provider spending cap. Neither the passing targeted assertions nor the narrow browser smoke proves full product acceptance.

## Historical evidence

Attendance follow-up: added teacher-owned daily attendance APIs and a date/status/note UI. Regression covers authorization, non-member rejection, same-day updates, stale-date responses and save failures. Latest targeted backend suite: **37 passed**; frontend Academy suite: **20 passed**; TypeScript, scoped ESLint and production build passed. These counts describe the suites run in this follow-up, not all repository tests. Browser/mobile and runtime restart were pending in that follow-up; see the dated update above for the later deployment and image-chat evidence. See [teacher-management-plan.md](teacher-management-plan.md) for subsequent teacher-management scope.

This audit preserves the complete scope in `academy-implementation.md`. Passing component/API checks does not prove browser appearance or pedagogical quality.

| Requirement | Current authoritative evidence | Status / remaining evidence |
| --- | --- | --- |
| Accounts, teacher/student roles, classes | `test_account_roles_and_class_isolation`; authenticated academy routes | API role isolation verified; browser registration/login navigation pending |
| Teacher upload, extraction, drafts, publish, archive, version/download | `test_material_draft_publish_version_and_download`; actual DOCX/PPTX/PDF fixtures; teacher component | Backend contracts verified; visual multi-file upload flow pending |
| Search/filter library and create exercises from a document | Teacher component tests; `test_exercise_uses_selected_material_version_and_rejects_other_class` | Filters and selected-version generation verified automatically; browser interaction pending |
| Vietnamese chat, subject/level, persistence, citations | Conversation ownership test; selected-document isolation/revocation test; app source/history component test; `teacher_prompt`; prior real-HNQ smoke | Specific-document selection is implemented and persisted; current permissions/status are rechecked before generation. Reviewed real diagnostic sample covers increasing difficulty; visual responsive flow remains unverified |
| Diagnostic quiz, mastery, explanations, wrong answers | Quiz approval/scoring test; concurrent mastery test; student practice component test; real HNQ three-question algebra diagnostic | Answer secrecy, scoring and mastery verified. Live sample had correct answers/explanations and increased difficulty; broad pedagogical quality remains a continuous review responsibility |
| Flashcards and personal FSRS | `test_flashcard_fsrs_private_state_and_duplicate_review`; existing FSRS suite; prior live smoke | Scheduling/private state verified; visual flip/rating flow pending |
| Personalized schedule, completion/rescheduling, streak | Availability/budget and concurrent generation tests; Vietnam day-boundary test; reschedule/ownership/completion endpoint regression | Rescheduling normalizes UTC+7, updates duration, rejects overlaps and invalid ranges; completion is idempotent and completed history cannot be changed. Browser interaction pending |
| Career guidance | Career privacy/schema tests, component tests and a completed real-HNQ synthetic grade-10 profile | Live sample passed schema and human review: software/web, UI/UX, illustration alternatives, profile-specific reasons, free experiments, tradeoffs and three preparation stages; no admissions claims. This proves one reviewed sample, not universal advice quality. Generic MOET resource does not substantiate current school admissions facts |
| Teacher reports without private student data | Mixed class/private/other-class activity regression; timestamp-ordered attempts; per-assignment completion counters; student-search/export tests; per-question analytics authorization; overview recent-submission identity test | Only selected class attempts/cards appear; assignment/student metrics and question analytics are class-scoped; recent activity includes names/titles from owned classes only. Browser report presentation pending |
| Errors, cancellation, durable data, HNQ | Error mapping tests; ASGI disconnect test; HNQ raw SSE `[DONE]` tests; SQLite file-backed fixtures; runtime bootstrap | Incomplete generations before commit are discarded; durable turns survive disconnect after commit. Image-chat tests above cover the commit boundary. Single-process in-memory chat concurrency guard is a deployment limit; persistent user DB retained |
| Build, frontend transport, responsive/browser navigation | Latest combined backend: 59 tests passed; frontend: 13 tests passed; TypeScript/ESLint and production build after document picker passed | Historical build evidence; narrow image-chat browser evidence above. Full browser/mobile acceptance remains pending |

Remaining checks include real browser/mobile appearance and interaction when access works, followed by final verification of all completion gates. Component tests now cover student-page navigation and document-source/history behavior, but are not visual browser evidence. OCR, external storage connectors, current admissions corpus and multi-school administration remain explicitly outside the agreed initial release.

## Earlier browser blocker

Earlier attempts could not use the browser host or pass Windows browser URL verification. The later Edge headless image-chat check above supersedes a blanket claim that no browser check is possible. Full teacher/student/mobile acceptance is still pending; see [academy-acceptance.md](academy-acceptance.md). This document does not close the complete product checklist.
