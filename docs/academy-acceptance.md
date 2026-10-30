# Browser acceptance — remaining gate

## Verified image-chat flow - 2026-10-30

A live Edge headless check on https://chatbotvido.io.vn selected a synthetic image, displayed the preview, sent it successfully (HTTP 200), displayed the saved thumbnail and received the Luna answer: "A red square and a blue circle." The image loaded with authentication after a fresh fetch (200); an unauthenticated request returned 401. Temporary test conversation/image data was removed. Authentication was seeded using the real API and browser localStorage; this check does not prove the login form flow.

The full teacher, student, small-screen and keyboard scenarios below remain pending. Earlier browser-host failures describe previous attempts, not the current status of all browser access. Automated checks and their coverage limitation are recorded in [academy-audit.md](academy-audit.md).

For local acceptance open `http://127.0.0.1:3001`; for the deployed Academy use https://chatbotvido.io.vn. Keep real student information out of fixtures. On a fresh installation, the owner should create the first teacher account before public signup. Do not reuse production owner credentials for acceptance tests.

## Desktop teacher workflow

1. Register/login, create a class, confirm the class name, subject, grade and join code appear correctly.
2. Upload several small supported files. Confirm extraction status, errors and the saved draft list are understandable. Preview/edit extracted text, publish one document and leave another as draft.
3. Search by chapter/lesson and combine status/level filters. Download the source file. Upload a revision and confirm publication archives the parent as expected.
4. Create a quiz and flashcards directly from a selected document. Check/edit generated content and publish for the class. Confirm sources identify the chosen document/version.
5. Open the class report after student work. Check recent score, attempts and cards; personal conversations/career data must not appear.

## Desktop student workflow

1. Register a student, join using the code, and confirm only published class materials appear. A class not joined must be unavailable.
2. Select the class and one document in chat. Ask a question, follow a citation/download and reload/open conversation history. Confirm source/subject/level restoration.
3. Start a long answer and stop it before completion. Confirm the error/status is readable and the unfinished answer is not restored from persisted history. A turn already committed before a disconnect must remain saved. Change the document and confirm a new conversation starts.
4. Take a quiz, check that submission is disabled until every answer is selected, submit and review explanation/wrong-answer history and mastery.
5. Flip a flashcard and rate recall. Reload to confirm the next due state is retained and immediate duplicate review is prevented.
6. Save goals, exam date and availability. Generate a schedule, reschedule a session and check the updated minutes. Complete an eligible session; repeated completion must not increase activity count.
7. Complete career interview fields, generate/open the saved report, then change the profile and confirm the stale-report notice. The report must show alternatives, preparation, experiments, tradeoffs and its date.
8. Sign out and back in. Confirm private history and learning progress remain associated with the correct account.

## Small screen and keyboard checks

Repeat the main flows at approximately 390×844 and 768×1024, plus a desktop width. Check menu open/close, every navigation item, source selectors, chat composer with keyboard open, upload controls, quiz answer choices, flashcard rating buttons, schedule form, report tables and career report. No essential control should be clipped or hidden behind another panel. Check long document names and long Vietnamese text for overflow.

Use keyboard navigation through forms and controls. Confirm visible focus, accessible field names, readable error/status messages, and that cancelling a form or closing the menu returns to the expected page.

Record the browser/version, viewport, pass/fail and any reproducible defect before closing this gate. A successful HTTP response, static render or component test does not close the visual/browser gate.

## Remaining image-chat acceptance

- Check PNG/JPEG/WebP selection, preview/removal, image-only send and readable errors for unsupported formats and size/count limits on desktop and mobile.
- Verify draft retention on generation failure, cancellation before commit, history reload after success and no restored draft after a post-success refresh error.
- Reopen history, verify private image loading and test isolation with a second account. Reattach an old image for a new visual question; old images are not automatically resent.
- Check image controls with keyboard navigation and small-screen layouts. The desktop synthetic-image smoke above does not close these broader gates.
