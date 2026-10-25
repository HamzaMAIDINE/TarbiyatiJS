# Tarbiyati · تربيتي

Arabic RTL learning platform for education science and didactics, with account-based progress.


The platform name is **Tarbiyati · تربيتي** across the website, educational exports, and account emails. The production examples use `https://tarbiyati.com`; configure that origin after registering the domain and setting up DNS and HTTPS.

## Run locally

Use a patched Node.js **22 LTS** release; `.nvmrc` selects **22.23.4**, the minimum supported Node 22 security patch. Patched Node 24 (24.22.1+) and Node 26 (26.12.1+) are also supported. Install the locked dependency before starting:

The server, backup/database tools and mail transports enforce this minimum at startup; npm's `engines` warning alone is insufficient. An invalid `NODE_ENV` value also fails startup. See the repository [security review](../SECURITY.md).

This Windows workspace has a checksum-verified Node 22.23.4 installation at `C:\tmp\tarbiyati-node-22.23.4`. Both VS Code workspace settings prepend it to new terminals. Reload the VS Code window and open a new terminal to use it; existing terminals and terminals outside this workspace can still select the older system installation. On another machine, install the `.nvmrc` version and adjust this local SDK path.

```powershell
npm ci
npm start
```

Open **http://127.0.0.1:3000** to see the public landing page. Visitors can explore the platform before choosing sign-up or login. Signing in opens the personal dashboard at `pages/dashboard.html`; lessons and saved progress require an account. Run the application through this server; VS Code Live Server and opening HTML files directly cannot provide the account API.

```powershell
npm run dev  # Restart the backend when server files change
npm run check  # JavaScript/JSON, local asset links, and public credential checks
npm run sync:mobile  # Refresh the Flutter content bundle after editing website content
npm run check:mobile # Verify that website and Flutter content match exactly
npm test     # Account isolation, persistence, authorization, and validation tests
npm run test:browser  # Chrome/Chromium/Edge integration and responsive UI checks
npm run test:print    # Generate and verify academic print/PDF samples
```

If quizzes or exams show **الطلب غير موجود** after an update, the running backend still has the old routes. In its terminal, press **Ctrl+C**, run `npm run dev` (or `npm start`), then use **إعادة المحاولة** on the page. Reloading the browser alone does not restart Node. Failed catalog requests stop the loading indicators and leave retry available; administrators receive a restart hint, while learners receive a service availability message. Account data and saved attempts persist across restarts.

## Print and PDF documents

Lesson plans, mind maps, resources, and individual modules have **PDF / Print** controls. In the browser's print dialog, select **Save as PDF** or a printer. The documents use A4 paper, a locally hosted Amiri Arabic typeface, restrained academic styling, page numbers, and repeating table headers. Keep the scale at 100%; disable the browser's own headers and footers if it adds a URL or date alongside the document's margins.

Lesson plans include classroom metadata and signature spaces. Mind maps print the complete selected map as a landscape overview, followed by the full branch explanations and references. Resources print the currently filtered selection with every detail expanded; comparison tables use landscape pages. Individual module exports contain the entire selected module, including closed sections. Printing and cancellation preserve the screen's filters, layout, draft fields, and collapsed sections.

The modules page also offers **Export all modules PDF**: a complete collection with a cover, linked contents, readable Arabic typography, and every module beginning on a new A4 page. This export includes all eight modules regardless of search filters or collapsed lessons. Opening a module closes the others; **Expand all** opens every module matching the current filters, and **Collapse all** closes them. Voice reading controls have been removed from the modules, quiz, and glossary.

The fiche generator supports Arabic and French forms, templates, previews, and PDFs. Its cycle/year selectors cover primary years 1–6, collège years 1–3, and lycée tronc commun, first-year baccalaureate, and second-year baccalaureate. The optional lycée stream dropdown starts with **ALL**, followed by general/originel, international language and sport-études, technical, and professional options for the selected year. Labels switch languages while the selected stream keeps its stable ID. Establishment, teacher, session date, and session duration also persist with the draft. Older drafts, including their original free-text streams, still open normally.

**New fiche** clears all content, classroom metadata, and school selectors while preserving the selected language. The fresh editor starts blank; subject examples fill it only when explicitly selected. Saved fiches remain available in the dropdown, and reloading a new blank fiche keeps it blank.

The 16 editable subject examples cover scientific activity, mathematics, Arabic, physics/chemistry, French, computing, SVT, English, Amazigh, Islamic education, history/geography, philosophy, economics/management, technology, arts, and PE. Each of the four phases has separate **teacher activities**, **student activities**, **duration in minutes**, and **assessment/support** fields. Timings can be blank or whole numbers from 0 to 1440; the preview and PDF show their total and flag incomplete totals. Fiches print on landscape A4 with readable academic typography and repeated table headers for longer lessons. Language switching translates built-in text while preserving custom lesson text. These are preparation examples to adapt to the selected class, rather than an official syllabus for every grade.

The fiche PDF copies the page preview directly and shares its typography, table widths, headings, objectives, activities, support text, blank fields, totals, and signatures. Both document languages display the complete official Arabic–Amazigh Ministry logo without cropping. Landscape A4 pages use uniform white 15 mm margins, including in dark mode; printing preserves the screen’s selected theme. Compact spacing and balanced column widths let short lessons, including the computing example, fit on one page with all four phases and signature spaces. A repeating table header keeps the logo, fiche heading, and classroom metadata in the page flow, reserving their space above lesson content on every page. If unusually long classroom details exceed the browser’s repeating-header height limit, those details appear in full at the start of the body while the logo and title continue to repeat. Longer fiches paginate at the preview’s readable type size, and phase table headings repeat across page breaks. These behaviors also apply to Ctrl+P.

Missing student fields in an older draft are recovered only when its subject/title exactly match a built-in lesson. Explicitly empty fields stay blank; the editor offers **Complete student activities from the model** to fill those fields while retaining existing entries, teacher work, and timings. The PDF keeps empty fields exactly as they appear in the preview.

The lesson name appears directly below the fiche heading in both the preview and PDF. Deleting a saved fiche cancels its pending autosave, removes it from the saved list, and leaves a clean empty editor while retaining the classroom metadata. Reloading keeps that editor empty; other saved fiches remain available in the dropdown.

Stream catalogue references: [HCP Annuaire statistique 2025, education tables pp. 299–300](https://www.hcp.ma/file/247383/), the Ministry’s [2025 candidate guide, pp. 3–4 (hosted copy)](https://www.dreamjob.ma/wp-content/uploads/2025/05/Guide-candidat-BAC-2025.pdf), and the [Ministry’s June 2026 baccalaureate stream publication](https://www.men.gov.ma/Communiqu%C3%A9180626_01). Restart `npm start` after updating the backend so the new student activity and phase-duration fields are saved.

Fiche documents use the Ministry of Education's [official Arabic–Amazigh logo](https://www.men.gov.ma/sites/default/files/2026-01/Logo_Tm_AR.png) in place of Tarbiyati branding, including when the fiche is written in French. The unmodified original is stored in `assets/branding/education-ministry-ar-amazigh.png` and embedded in the self-contained `education-ministry-ar-amazigh.svg` used by the page, so servers that already serve SVG assets can display and print it. Its Arabic and Tifinagh lettering is part of the image and requires no additional fonts. The earlier [Arabic](https://www.men.gov.ma/themes/custom/men/logo-ar.svg) and [French](https://www.men.gov.ma/themes/custom/men/logo-fr.svg) SVG originals are also retained in `assets/branding/`.

The print documents also work through Ctrl+P on these pages. PDF saving uses the browser's print dialog. `npm run test:print` checks the export lifecycle and generates sample PDFs, including long lesson plans, all five mind maps, comparison tables, and modules, in a temporary folder reported at completion. Set `CHROME_PATH` if Chrome or Edge is not detected automatically.

Amiri's regular and bold fonts are bundled under the SIL Open Font License; see `assets/fonts/OFL-Amiri.txt`. Restart the server after installing this change so it can serve the new font assets. If the PDF button reports a network error, check that `/assets/fonts/Amiri-Regular.ttf` and `/assets/fonts/Amiri-Bold.ttf` return 200; an older running server may still reject these routes. Printing uses system serif fallbacks when font loading fails, while missing document images show a readable error. Use `npm run dev` during development to reload backend changes automatically.

## Previous exam papers and practice questions

`pages/exams.html` contains the **2023, October 2024, and November 2025** education-science papers supplied in `QCM Exams`: **180 questions**, preserving Q61–Q120 and the original choice order. Each paper has a two-hour time budget, saved/revisable answers, automatic submission when running time expires, original page images, and a correction section displayed only after submission. Results and earlier attempts are available from the exams page. Practice quizzes and papers keep independent attempts; opening a quiz no longer redirects to the paper.

Use **إيقاف مؤقت** before leaving a paper, then **استئناف الامتحان** to continue. Pausing saves the question position and freezes the remaining server time across refreshes, other pages and server restarts; it does not submit, score or reveal corrections. Answers and submission stay disabled until resuming. Resuming returns to the saved question and restores only the remaining time. Duplicate pause/resume requests cannot replenish the budget. Starting a new quiz or a different paper automatically pauses a running paper, and resuming a paper preserves the practice quiz. Each year card resumes its unfinished paper; other paused years remain available. The quiz page links back to the saved paper. Restart the backend once to apply the version 4 database migration, which preserves existing attempts and results.

The practice bank now contains **249 questions**: the existing 90, **12 new classroom examples**, and **147 corrected questions** from the three papers. The quiz page shows bank counts and adds a source filter for each year or the platform's training questions. Four- and five-choice questions are supported. Exam questions retain their original Latin choice letters when shuffled, so explanations referring to those letters remain understandable. Reading questions include the supplied passage, and the incomplete-circle question retains its figure.

Both pages provide a **next unanswered question** action. The quiz also has an expandable question map with saved-answer markers and the current position; question changes scroll beneath the header and move keyboard focus. During a paper, a sticky toolbar keeps the timer, pause/resume control, saved-answer count and save retries visible, and question jumps account for its height. The current paper's year card resumes the same attempt. Submitted corrections on both pages can be filtered by correct, wrong or unanswered questions; unresolved exam items have a separate ungraded filter. Failed automatic submissions at expiry leave a manual retry instead of sending requests every second.

Correction provenance is visible: the 2023 answer letters come from the supplied unlabelled answer table, the 2024 correction is a proposed educational correction, and the 2025 letters come from the supplied non-official review. **19 questions in 2024 and 14 in 2025 remain unresolved** and are excluded from both the score denominator and the practice bank. Their review notes explain the ambiguity or missing evidence. Explanations link to the relevant module and distinguish conceptual connections from quotations or author attributions absent from the module. The displayed score is a training score; the unspecified negative marking mentioned in the 2025 instructions is not invented or applied.

The editable transcriptions are in `content/exams/2023.json`, `2024.json`, and `2025.json`. `content/exams/sources.json` maps the source filenames to the preserved JPG assets and their SHA-256 hashes. `python tools/prepare-exam-assets.py` reproduces these assets from the reviewed folder. The standalone, undated Q79 crop is preserved without assigning it to a year. Answer-bearing data stays on the server and is not served as a browser script. Restart the Node server after updating the bank or backend.

## Accounts and progress

- Registration, login, and logout use an HttpOnly session cookie that lasts seven days.
- Passwords are salted and hashed with scrypt; passwords and session tokens are never stored in browser localStorage.
- SQLite persists accounts, sessions, and progress in `.data/scienceedu.sqlite`. Keep this directory to preserve users' records. It is excluded from Git and cannot be downloaded through the application server.
- Existing database/backup filenames, Docker storage paths and the `scienceedu-data` volume keep their original identifiers so the rename preserves saved accounts and learning records. Existing deployments should retain their configured `DATA_DIR` and volume. Internal `X-ScienceEdu-*` API headers also remain compatible with already open browser tabs; they are independent of the public platform name.
- Each account stores completed lessons, the last opened lesson, quiz attempts and scores, completed classroom scenarios, flashcard mastery/review status, and explored mind maps.
- The dashboard updates after successful saves and refreshes every 15 seconds while visible, so another tab or device can pick up changes.
- Progress writes are validated events with unique operation IDs, retained for 30 days for retry protection. Reusing an operation ID with different data is rejected. Concurrent tabs cannot replace an entire profile. Interrupted saves are kept in an account-scoped browser outbox and retried on reconnect/reload; each activity has a persistent save status and retry control.
- Previous anonymous browser progress is not automatically assigned to an account because its owner cannot be determined.
- Account settings are available from your name or the sidebar. They include email verification, password changes, connected devices and session revocation. Resetting a password revokes all existing sessions; changing it rotates the current session and revokes the others.
- Signup has three stages: account details, email confirmation, then learning. Registration and unverified logins create a limited session and display a form for the **six-digit code** sent by email (for example, `145974`). Learning pages and APIs require a verified email; existing unverified accounts also complete this step on their next visit. The form accepts Arabic/Persian digits, supports resending and switching accounts, and detects confirmation in another tab/device automatically.
- Verification codes last **10 minutes**, are single-use, and are hashed with the account ID in the database. Enter the code while signed in to the same account, including after signing in on another device. Five incorrect attempts block further attempts for 15 minutes; that limit survives restarts and resends. Resends have a 60-second cooldown and a maximum of three messages per 15 minutes, including the initial signup message; a new code invalidates the previous one. Confirmation links issued by older versions remain valid until their original expiry. Password recovery still uses a single-use hashed link lasting one hour, with the token in a URL fragment. Recovery responses do not disclose whether an email exists.

## Email delivery

Brevo HTTPS and SMTP send real emails in **both development and production** when configured. Copy `.env.example` to a private `.env` and fill in the blank credentials; `npm start`, `npm run dev`, `npm run email:check`, and the backup/restore commands load it automatically. Existing environment variables take precedence. `.env` is ignored by Git and cannot be served by the app. Keep real API and SMTP keys out of the example file. If a key was shared in source or a template, revoke it in the provider dashboard and replace the private setting.

### Brevo HTTPS delivery (recommended when SMTP times out)

The app can send through [Brevo's transactional email API](https://developers.brevo.com/docs/send-a-transactional-email) over HTTPS port 443. This avoids relying on outbound SMTP ports. In Brevo, open **Settings → SMTP & API → API keys**, generate an API key, and save it in the private `.env`:

```dotenv
BREVO_API_KEY=your-brevo-api-key
SMTP_FROM=your-verified-sender@example.com
SMTP_FROM_NAME="Tarbiyati · تربيتي"
```

`BREVO_API_KEY` is separate from `SMTP_KEY`. Keep `SMTP_FROM` set to a sender verified with Brevo. A configured API key selects HTTPS delivery ahead of SMTP; clear it to select SMTP again. The existing durable queue, verification-code expiry, retries, and branding apply to both transports. API retries reuse a job's idempotency key to reduce duplicate messages.

Run `npm run email:check` to verify HTTPS connectivity and API authentication without sending a message. Restart the backend after changing `.env`, sign in to the unverified account, and use **Resend code**. Creating another account is unnecessary. The confirmation screen updates as mail is sending, retrying or accepted by the provider; it reports expired codes and failed delivery as well. Provider acceptance does not guarantee inbox placement, so check spam and Brevo's transactional logs when needed.

### Test with a free Brevo account

1. [Create a free Brevo account](https://www.brevo.com/). The [Free plan currently includes 300 email sends per day](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans). Complete account verification and enable transactional sending if Brevo requests it.
2. In **Settings → Senders, Domains, IPs → Senders**, add your sender address and complete Brevo's verification. Set `SMTP_FROM` to that exact address. See [Brevo's sender setup](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email). For reliable delivery, authenticate a domain you own using the DNS records Brevo provides.
3. In **Settings → SMTP & API → SMTP**, copy the **SMTP login** and generate an **SMTP key**. The login can differ from your account email; copy the displayed value. Put the SMTP key in `SMTP_KEY`. See [Brevo's SMTP setup](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).
4. Fill in the local `.env` (or copy `.env.example` to `.env` if it is missing):

```dotenv
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-brevo-smtp-login
SMTP_KEY=your-brevo-smtp-key
SMTP_FROM=your-verified-sender@example.com
SMTP_FROM_NAME="Tarbiyati · تربيتي"
```

5. Verify the SMTP connection, then start or restart the app:

```powershell
npm run email:check
npm start
```

6. Open **http://127.0.0.1:3000/pages/account.html?mode=register**, register using the email inbox you want to test, then enter the received six-digit code in the platform. If that account already exists, sign in and use **Resend code** after the cooldown. The registration email is the recipient; `SMTP_FROM` is the sender. Check the spam folder if needed.

`email:check` verifies the connection and SMTP login; signup tests actual sending and receipt. SMTP delivery errors print an error code and response code in the server terminal without exposing credentials or message contents. `EAUTH` commonly means an incorrect login/key or transactional sending awaiting activation. A sender rejection requires checking the verified `SMTP_FROM` address in Brevo. Port 587 requires STARTTLS; port 465 uses TLS immediately (`SMTP_SECURE=true`). The same settings support other SMTP providers. Existing deployments may still use `SMTP_PASS`; `SMTP_KEY` takes precedence when both are set.

The mail display name is `Tarbiyati · تربيتي`. Keep `SMTP_FROM` set to an address verified with your provider; verify any new `@tarbiyati.com` sender before using it.

With API and SMTP credentials blank, development writes previews into `.data/mail/` (or `DATA_DIR/mail/`). Open a preview and enter its code in the platform; recovery previews contain the reset link. Partially filled settings for the selected transport fail at startup with a configuration error. Production requires Brevo HTTPS, an SMTP transport, or an HTTPS email gateway and rejects signup before creating an account when none is configured.

An existing HTTPS email gateway is also supported in production:

```powershell
$env:EMAIL_WEBHOOK_URL = 'https://your-email-gateway.example/messages'
$env:EMAIL_WEBHOOK_TOKEN = 'your-gateway-secret'
```

The gateway receives JSON `{ "id": "...", "to": "...", "subject": "...", "text": "..." }`, an `Idempotency-Key` matching `id`, and optional bearer authorization. It must send the email, deduplicate `id`, and return a 2xx response. Brevo HTTPS and SMTP take precedence over the gateway when configured. Delivery uses a persistent queue with up to five attempts and exponential delays; expired, replaced, or consumed proofs are discarded before delivery. Delivered/failed message bodies are cleared from SQLite. Tests use local delivery adapters, API response mocks and SMTP mocks; they do not send emails to real inboxes.

Queue workers reserve small batches atomically for two minutes using `next_attempt`, and only the current reservation can acknowledge a delivery or schedule a retry. An abandoned reservation becomes eligible again. A crash after the provider accepts a message can still lead to redelivery; retain HTTPS idempotency keys and stable SMTP message IDs.

## Hosting

All devices must connect to the same running backend to share an account's progress. This repository runs locally until deployed.

Use a persistent directory for the database and put the Node server behind an HTTPS reverse proxy. Set the canonical public origin so request-origin checks and secure session cookies match your deployment:

```powershell
$env:NODE_ENV = 'production'
$env:PUBLIC_ORIGIN = 'https://tarbiyati.com'
$env:DATA_DIR = 'C:/TarbiyatiData'
$env:HOST = '127.0.0.1'
$env:PORT = '3000'
# Trust only the actual reverse-proxy IP addresses; never trust arbitrary forwarded headers.
$env:TRUSTED_PROXIES = '127.0.0.1,::1'
npm start
```

Use a single application instance with this SQLite database. Schema migrations preserve existing accounts and progress. Authentication failures are throttled per account, with a separate IP burst limit; successful logins do not count as failed attempts. Forwarded addresses are used only through the configured trusted proxy chain. Password hashing has a bounded concurrency limit. Progress and other writes also have quotas.

The app enforces a Content Security Policy that blocks inline/evaluated JavaScript, with external scripts and delegated controls. Inline CSS remains allowed for the existing presentation. API/account pages use `no-store`; public assets use ETags and revalidation. PDF references support byte ranges, allowing readers to fetch individual parts of large documents. `/api/health` checks database availability. Production emits structured request, email, maintenance and backup logs without request bodies, passwords or session tokens.

`PUBLIC_ORIGIN` accepts only a scheme and host, with an optional port. Set it to the public HTTPS address when using a development tunnel too. Forwarded host, scheme and client IP headers are trusted only from the explicit `TRUSTED_PROXIES` socket peers. Configure the reverse proxy to overwrite incoming forwarded headers. The default development origin is the server's HTTP host. Invalid origin and backup interval settings fail at startup. SIGINT/SIGTERM stop new connections, allow active requests to finish, and close the mail transport and database; HTTP connections are forced closed after 30 seconds during shutdown. Allow at least 60 seconds before a process manager forcibly terminates the app.

Persistent databases receive an online, consistent `VACUUM INTO` backup every 24 hours while the server is running; the newest seven snapshots are retained in `DATA_DIR/backups/`. Set `BACKUP_INTERVAL_HOURS=0` to disable automatic backups or choose another positive interval. Hourly maintenance expires sessions/tokens/rate-limit rows, prunes progress-operation IDs older than 30 days and retains the latest 200 submitted quizzes per account. Expired exams are finalized every 30 seconds and whenever accessed.

```powershell
npm run backup
npm run verify-backup -- 'C:/TarbiyatiData/backups/scienceedu-....sqlite'
npm run restore -- 'C:/TarbiyatiData/backups/scienceedu-....sqlite' 'C:/TarbiyatiRestored/scienceedu.sqlite'
```

Restore verifies integrity and creates a new database; it refuses to overwrite an existing destination. Stop the server before switching `DATA_DIR` to the restored directory. Backup/restore tests verify that account progress survives a live WAL snapshot. Newly created data/inbox/backup directories and database/backup files use private Unix permissions (700/600); Windows deployments should restrict the persistent directory with NTFS permissions. Copy verified backups to separate storage as well. SQLite is an experimental built-in module in Node 22 and may print a startup notice.

### Container deployment

The optional Docker image installs locked production dependencies, runs as the unprivileged `node` user, and stores user data outside the application directory. Its build context and npm package use explicit file lists; `.env`, databases, logs, tests, `scratch/`, `output/`, and the original `QCM Exams/` research directory are excluded. The website's PDF references, imported exam images/data, fonts and font licenses are included. Research files remain available in the source workspace.

Fill in `PUBLIC_ORIGIN` and your mail configuration in the private `.env` before running:

```powershell
docker build --pull -t tarbiyati:local .
docker run -d --name tarbiyati --restart unless-stopped --env-file .env -e NODE_ENV=production -e HOST=0.0.0.0 -e PORT=3000 -e DATA_DIR=/var/lib/scienceedu -p 127.0.0.1:3000:3000 -v scienceedu-data:/var/lib/scienceedu --stop-timeout 60 tarbiyati:local
```

Put an HTTPS reverse proxy in front of the published localhost port. Configure the actual proxy peer addresses as observed inside the container; Docker's bridge gateway may differ from the host's loopback address. The named volume persists across container replacements. Back up or restore through `docker exec tarbiyati node tools/database-backup.js backup` and the existing verification/restore commands. A new named volume starts with an empty account database; transfer a verified backup when moving an existing deployment. Keep the base image and Node installation patched; see the [Node 22.23.4 security release](https://nodejs.org/en/blog/release/v22.23.4).

Run `npm run check:production` before deployment, then `npm run test:browser` and `npm run test:print` on a machine with Chrome/Chromium/Edge. `npm pack --dry-run --ignore-scripts` shows the files included in the release package. Dependency audits check published advisories and do not replace a code review.

## Saved lesson plans and daily reviews

- All 16 subject presets supply their own objectives, materials, teacher/student activities and assessment, in Arabic and French. All fields are editable, and the printed sheet includes phase durations and assessment criteria. Text is rendered literally, including pasted HTML.
- Lesson plans autosave to the account, can be reopened/deleted, and are limited to 50 per account. Versions prevent one tab from overwriting another. A conflict offers reopening the saved version or keeping edits as a new copy. Pending edits are retained in account-scoped sessionStorage for the current tab, with an unsaved-change notice when leaving.
- Flashcards offer a daily due queue. Successful reviews schedule the next review after 1, 3, 7, 14, 30, 60, 120 and then 180 days; missed cards return after 10 minutes. Retrying a save does not advance the schedule twice. The inactive card face is hidden from assistive technology.

## Detailed lessons and question references

The eight modules contain **53 study sections** with learning objectives, explanations, comparisons, worked applications and self-checks with explained answers. `scripts/data/curriculumData.js` is the single canonical curriculum used by the browser and backend. Module scopes distinguish psychology, learning theories, pedagogy, didactics, classroom management, assessment and institutional work. Each module ends with preparation goals for independent review. PDF citations use viewer page numbers, including covers; resources are further reading rather than a substitute for the lesson.

Each module also includes an **applied workshop**: a classroom case, three analysis tasks, a concealed proposed solution, review criteria, two explained misconceptions, and links back to the relevant lessons and mind map branch. The eight workshops cover equity, professional observation, transfer, alignment of objectives/activities/assessment, scaffolding, participation, remediation, and institutional projects. They are authored training cases; other justified solutions can be valid. Search includes these workshops, lesson objectives, and self-check answers. Individual and complete module PDFs expand and preserve the workshop solutions and criteria.

Intelligence belongs to psychology (`mod-2-s9`), competency theory to pedagogy (`mod-4-s1`), and Socratic dialogue and method selection to teaching methods (`mod-4-s6`). Piaget's development, constructivist learning, Vygotsky's mediation and Bruner's representations have distinct lessons. Old links to moved topics resolve through `CURRICULUM_ALIASES`, preserving bookmarks. The dashboard uses the same lesson counts. Printed courses include objectives, applications, self-check answers and sources.

Each of the **102 practice questions and 180 archived exam questions** has an explicitly selected section in `backend/learning-references.js`. Add a mapping when adding a question: missing or invalid targets fail catalog loading. Categories follow the primary lesson's module; source records retain matching module IDs. Practice feedback and submitted exam corrections open that section and expose its references. Passage questions distinguish text evidence from background; uncertain quotations and unresolved keys retain their review status. Lesson references are withheld with corrections until practice answers are saved or exams submitted. Older attempts and history receive current categories and lesson links without changing stored answer keys, choices, answers or scores. Feedback refreshes only when the question wording, options and key still match the saved record.

Module search includes the extended content. Each module has a linked contents list, and full PDF export preserves the lessons, examples and references. Account completion remains attached to the original eight module IDs.

## Educational glossary

The Arabic–French glossary contains **100 terms across nine domains**, with an Arabic definition, an authored explanatory example and a related module link for every entry. Categories and result counts follow the data automatically. Search covers both names, definitions, examples and keywords, accepts French without accents and Arabic without diacritics, and normalizes apostrophe variants. Examples expand inside each card; copying includes the definition and example. Edit `scripts/data/glossaryData.js` to maintain entries. The glossary data check validates uniqueness, complete bilingual records and links to all eight modules.

## Mind maps

`pages/mindmaps.html` loads `scripts/data/mindmapsData.js`, `scripts/mindmaps.js`, and `styles/mindmaps.css`. Its **five maps contain 40 branches** and offer a connected overview, expandable branch explanations, and recall cards with hidden answers. Each branch includes key concepts, an authored classroom example, a distinction, a memory cue, a self-check question, an exact lesson target, and an explained relationship to another concept. The fifth map, **من المفهوم إلى الممارسة**, connects the applied cases across all eight modules. Sources link to project modules, included references, and official Moroccan reform documents; examples and memory cues are labeled as study aids. Search includes hidden explanations and concept relationships and normalizes Arabic diacritics and alef variants. Branch links use `mindmaps.html#map-id/branch-id`, select the requested concept, clear filters that would hide it, and move keyboard focus to its explanation. Existing map-only bookmarks still work. Branch state survives view changes during a visit. Printing includes all branches of the current map, then restores the previous view, search, and disclosure states. Existing map IDs preserve account progress.

`backend/validate-learning-content.js` validates the canonical lessons, PDF/source links, workshops, branch targets, and concept relationships when loading the catalog. Broken or incomplete content fails startup and `npm run check` with a location-specific error. This requires no database migration. The progress, draft, and quiz APIs also require string identifiers and reject arrays/objects with HTTP 400 before accessing SQLite.

`npm run check` also compares the complete Flutter content bundle against its website sources when the sibling `../Mobile/` project is present. Run `npm run sync:mobile` from `Web_NodeJs/` after editing lessons, resources, cards or templates, then rebuild and reinstall the app to deliver the updated bundle. The VS Code mobile launch configurations synchronize it automatically before starting. The shared content includes the 92-page Kotbane PDF resource, six related lesson citations, the competency comparison matrix, and 18 flashcards. PDF documents open from the configured backend. See [`../Mobile/README.md`](../Mobile/README.md) for the selected Flutter SDK and dependency update notes.

## Questions and classroom situations

- The practice bank contains 249 items: 102 reference/authored questions and 147 gradable questions from the three archived papers. It includes 60 authored classroom situations. Archived questions retain their correction provenance; authored items are not attributed to official examinations.
- Quizzes draw a fresh shuffled sample of 10, 20, 30, or all matching questions. Filters cover subject, difficulty, and concept/situation type. Empty filter combinations show an empty state.
- The server creates and owns attempts and shuffled choices. Accepted answers and the deadline persist across refreshes, devices and server restarts. A new attempt differs from the previous order. Only the question position is stored in sessionStorage.
- Training reveals a question's correction after its first saved answer and locks that answer. Exam mode supports revising choices and hides keys/explanations until submission. Its authoritative deadline is enforced on the server; changing a browser clock or refreshing cannot extend it. The complete answer-key dataset is not served publicly.
- The server scores stored answers; client-supplied scores are rejected. Submission is idempotent by attempt ID, with an answer review and related lessons. The quiz page shows the latest 50 results and missed subject areas; legacy aggregate progress is preserved during migration.
- The classroom simulator contains 14 scenarios, with shuffled scenario and choice order. Existing completion records remain attached to scenario IDs.
- To add questions extracted from exam images, add reviewed records to `scripts/data/quizData.js` with a unique ID, four options, a verified `correctAnswer`, an explanation, and an accurate source. Do not label unclear OCR or guessed answers as verified exam content.

## Validation

Security checks reject malformed request targets, non-UTF-8 or deeply nested JSON, prototype keys, oversized bodies, and unexpected content encodings. Signup has a persistent IP quota; accounts retain at most ten device sessions. HTTPS origins issue Secure cookies even in development. Database inputs use bound parameters, and regression tests check injection payloads and account ownership.

Authored SVG assets are checked for scripts, event handlers, active elements, and external references by `npm run check`; direct SVG responses receive a sandboxed policy. These assets are not an upload format. PDF fields render as literal text. Mobile PDF generation validates field and total sizes and stops after twenty pages in release builds. Mobile API responses have a two MiB limit, redirects are rejected, and only valid successful JSON responses can update secure session storage.

Only reference PDFs inside `Web_NodeJs/PDFs/` are served; PDFs placed outside that public directory stay private. Public file paths cannot traverse symlinks or junctions to expose private files.

The unused Lighthouse development dependency was removed after its transitive packages reported advisories. `npm run check:production` audits the full remaining dependency tree. Keep the operating system, HTTPS proxy, browser/PDF viewer, Node runtime, Flutter SDK, and deployed containers patched as well; local tests do not assess a deployed server's configuration or third-party infrastructure.

`npm test` covers account isolation, throttling/proxy spoofing, security headers, body limits, recovery/session lifecycle, quiz scoring and deadlines, draft conflicts, review schedules, migrations and backup restoration. `npm run test:browser` runs the account and learning flows in a headless browser at desktop/phone widths, checks screen-reader exposure and CSP errors, and tests interruption/retry. Set `CHROME_PATH` if Chrome/Chromium/Edge is not in a standard location. It uses a temporary database and inbox, blocks external font requests, and prints a temporary directory containing screenshots.
