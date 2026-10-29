# Browser acceptance — remaining gate

These checks have **not** been executed in a browser. The browser access host is unavailable; Windows Computer Use also stopped because it could not verify the active browser URL. API/component tests and build results are recorded separately in `academy-audit.md`.

Open `http://127.0.0.1:3001`. Keep real student information out of acceptance fixtures. The installation owner should create the first teacher account; no persistent acceptance account has been created automatically.

## Desktop teacher workflow

1. Register/login, create a class, confirm the class name, subject, grade and join code appear correctly.
2. Upload several small supported files. Confirm extraction status, errors and the saved draft list are understandable. Preview/edit extracted text, publish one document and leave another as draft.
3. Search by chapter/lesson and combine status/level filters. Download the source file. Upload a revision and confirm publication archives the parent as expected.
4. Create a quiz and flashcards directly from a selected document. Check/edit generated content and publish for the class. Confirm sources identify the chosen document/version.
5. Open the class report after student work. Check recent score, attempts and cards; personal conversations/career data must not appear.

## Desktop student workflow

1. Register a student, join using the code, and confirm only published class materials appear. A class not joined must be unavailable.
2. Select the class and one document in chat. Ask a question, follow a citation/download and reload/open conversation history. Confirm source/subject/level restoration.
3. Start a long answer and stop it. Confirm the error/status is readable and the unfinished answer is not restored from persisted history. Change the document and confirm a new conversation starts.
4. Take a quiz, check that submission is disabled until every answer is selected, submit and review explanation/wrong-answer history and mastery.
5. Flip a flashcard and rate recall. Reload to confirm the next due state is retained and immediate duplicate review is prevented.
6. Save goals, exam date and availability. Generate a schedule, reschedule a session and check the updated minutes. Complete an eligible session; repeated completion must not increase activity count.
7. Complete career interview fields, generate/open the saved report, then change the profile and confirm the stale-report notice. The report must show alternatives, preparation, experiments, tradeoffs and its date.
8. Sign out and back in. Confirm private history and learning progress remain associated with the correct account.

## Small screen and keyboard checks

Repeat the main flows at approximately 390×844 and 768×1024, plus a desktop width. Check menu open/close, every navigation item, source selectors, chat composer with keyboard open, upload controls, quiz answer choices, flashcard rating buttons, schedule form, report tables and career report. No essential control should be clipped or hidden behind another panel. Check long document names and long Vietnamese text for overflow.

Use keyboard navigation through forms and controls. Confirm visible focus, accessible field names, readable error/status messages, and that cancelling a form or closing the menu returns to the expected page.

Record the browser/version, viewport, pass/fail and any reproducible defect before closing this gate. A successful HTTP response, static render or component test does not close the visual/browser gate.
