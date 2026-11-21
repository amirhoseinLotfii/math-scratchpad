`).

2. Research Material (Internal only) — the snippets provided in the system/context! Wait: note that there are new snippets in the context (actually all snippets 2 through 354 are provided above!). Let's check what the user is asking now.

- Let's determine the Mode:
    - Mode 1: Report Editing: ONLY if the user explicitly asks to add, remove, change, rewrite, reorganize, or update the textual bits of the research report.
    - Mode 2: Simple Q&A: Use this mode for all other types of follow-up questions requiring just a textual answer. This includes requests to elaborate, explain, clarify, suggest, or any other query that is not a direct command to edit the report document.
    - Here, the user asks:"Research and verify (2026, with official-doc citations; mark anything unconfirmed as UNVERIFIED) for a React+Vite web app (desktop Chrome/Edge/Firefox) that syncs JSON files to Google Drive via a Cloudflare Worker and edits math with MathLive:
        - Google Drive API v3: does If-Match / ETag work for files.update on multipart and resumable uploads? Is headRevisionId always present for JSON files? Can revisions.list be called with drive.file scope? Best safe pattern for optimistic concurrency.
        - drive.file scope + Google Picker: if the user picks a FOLDER, does the app get access to files added to it later (by the user in Drive UI)? If not, what's the recommended pattern for a read-only "question bank" folder authored outside the app?
        - Google Identity Services token client: access token lifetime, silent renewal (prompt: '') under FedCM and third-party-cookie blocking; vs. server-side refresh token in a Cloudflare Worker. Which is recommended in 2026 and why.
        - MathLive latest version (0.111.x+): API for mathModeSpace, inserting a newline/line break inside a math-field (Shift+Enter), switching to text mode for RTL Persian text, known issues with Persian/Arabic IME and first-click focus, and the virtual-keyboard focus-loss bug. Give exact option/command names.
        - @notionhq/client v5.x: default Notion-Version header, whether 2026-03-11 / data\_source\_id must be set explicitly, and rate-limit handling.
        - Reliability of pagehide/visibilitychange + fetch keepalive / sendBeacon for flushing an outbox on tab close in desktop Chrome and Firefox; and Web Locks + BroadcastChannel support in Firefox private windows.
        - Best practice for a debounced autosave interval for a text/math editor syncing to Drive (avoid rate limits: Drive per-user quotas in 2026).Output: one section per item, short answer first, then evidence links, then recommended implementation."

Notice the user is asking for a structured Q&A verification report in plain text (NOT asking to edit/update <report id="0">), AND notice the user says "Output: one section per item, short answer first, then evidence links, then recommended implementation." AND in our system prompt:

- Mode 2: Simple Q&A:
    - Answer Directly and Concisely: Provide a direct answer to the user's question.
    - Use Research Material: Base your answer on the provided research material and the existing report.
    - Cite Your Sources: End sentences containing information from the research material with a \[cite: source\_id\] citation.
    - Do Not Use a report Tag: This is a strict rule. Your response should be plain text in this mode.
    - Offer In-Depth Research For Non-Obvious Follow-ups:
        - Determine whether the user's query is an obvious follow-up or a non-obvious passthrough:
            - Obvious follow-up (Do NOT offer research): The user asks about facts, findings, or explanations that are already in the report, asks to clarify/elaborate on specific sections of the report, or asks simple definitions/explanations directly grounded in the report content.
            - Non-obvious passthrough (DO offer research): The user asks about new topics, new questions, or broader extensions that were NOT already covered in depth in the report (which would benefit from fresh, comprehensive research).Let's analyze whether this is an obvious follow-up or a non-obvious passthrough!Wait: look closely at the 7 items in the user's query vs. what was in the report AND the new angles in the user's query:
        - Item 1: If-Match / ETag for multipart vs resumable, headRevisionId for JSON files, revisions.list with drive.file scope — partially touched on in report, plus new specifics (revisions.list with drive.file, JSON files).
        - Item 2: drive.file + Google Picker folder -> files added later? Pattern for read-only question bank folder authored outside app. (Touched on in report as NEEDS TESTING, now asks deeper verification).
        - Item 3: GIS token client vs server-side refresh token in a **Cloudflare Worker**! Notice in the first prompt, the app had "small Cloudflare Worker backend" (mainly Notion), and the previous report assumed no backend for Drive ("with no Drive backend"). Now the user explicitly says: "that syncs JSON files to Google Drive via a Cloudflare Worker... vs. server-side refresh token in a Cloudflare Worker. Which is recommended in 2026 and why." And FedCM + 3P cookies!
        - Item 4: MathLive 0.111.x+, exact option/command names.
        - Item 5: @notionhq/client v5.x default Notion-Version header, 2026-03-11 / data\_source\_id, rate-limit handling.
        - Item 6: Reliability of pagehide/visibilitychange + fetch keepalive / sendBeacon in desktop Chrome and Firefox; Web Locks + BroadcastChannel in **Firefox private windows**! (We actually have snippets 273, 274, 325, 347, 348, 349, 350, 351, 352, 353, 354 specifically fetched for this follow-up!).
        - Item 7: Debounced autosave interval for Drive per-user quotas in 2026.Wait: Because the user is asking a multi-part deep verification follow-up (including new questions like Cloudflare Worker for Drive OAuth refresh tokens, pagehide/keepalive/sendBeacon reliability, Firefox private window support for Web Locks / BroadcastChannel, @notionhq/client v5.x exact default header, etc.) that extends beyond what was already covered in depth in the report, attaching the offer? Wait—let's check carefully:Let's re-read Rule 5 of Mode 2:"- Obvious follow-up (Do NOT offer research): The user asks about facts, findings, or explanations that are already in the report, asks to clarify/elaborate on specific sections of the report, or asks simple definitions/explanations directly grounded in the report content. For these, answer directly and do NOT attach any research offer.
        - Non-obvious passthrough (DO offer research): The user asks about new topics, new questions, or broader extensions that were NOT already covered in depth in the report (which would benefit from fresh, comprehensive research). In these cases, answer the question as best as you can based on the available context, and attach the following question on a new line at the very end of your response:'Would you like me to do a more in-depth research instead and propose a research plan?'"

Wait: why did the system provide new snippets (snippets 218-354 were clearly searched for THIS exact query! Look at the query strings in snippets 218-354:

        - site:developers.google.com/workspace/drive/api/guides/limits "queries" OR "limit"
        - site:developers.notion.com/reference/request-limits OR "average of three requests per second" notion api
        - site:developers.google.com/workspace/drive/api "revisions" "list" "drive.file" OR "headRevisionId"
        - site:developers.google.com/workspace/drive/api/guides/picker OR site:developers.google.com/drive "drive.file" folder access files added
        - site:developers.google.com/identity "initTokenClient" ("3600" OR "hour" OR "FedCM" OR "cookies" OR "prompt")
        - site:github.com/arnog/mathlive ("latest" OR "0.111" OR "0.112" OR "multiline" OR "addRowAfter" OR "virtual-keyboard")
        - site:developers.google.com/workspace/drive/api/guides/api-specific-auth OR site:issuetracker.google.com "drive.file" "folder" picker
        - site:mathlive.io ("addRowAfter" OR "multiline" OR "switchMode" OR "0.111" OR "0.112" OR "0.113")
        - "pagehide" "visibilitychange" "keepalive" "sendBeacon" site:developer.mozilla.org OR site:developer.chrome.com
        - "navigator.locks" ("private browsing" OR "private window") firefox site:bugzilla.mozilla.org OR site:developer.mozilla.org OR site:github.com
        - "332571420" OR ("drive.file" "folder" "Picker" "child" OR "later" OR "descendant") site:issuetracker.google.com OR site:developers.google.com
        - "@notionhq/client" ("2026-03-11" OR "2025-09-03" OR "API\_VERSION" OR "DEFAULT\_NOTION\_VERSION" OR "maxRetries")
        - ("keepalive" "fetch" Firefox) OR ("sendBeacon" "pagehide" "visibilitychange" "64") site:developer.mozilla.org OR site:developer.chrome.com OR site:bugzilla.mozilla.org
        - ("Web\_Locks\_API" OR "navigator.locks" OR "BroadcastChannel") ("private browsing" OR "private" OR "partition") site:developer.mozilla.org OR site:bugzilla.mozilla.orgLook at that: the harness ALREADY ran search queries for this follow-up and gave us the search snippets! And the user's prompt is asking for verification of specifics that extend/verify gaps marked NEEDS TESTING in the report plus new questions (Cloudflare Worker refresh tokens, pagehide/keepalive/sendBeacon in Chrome/Firefox, Web Locks + BroadcastChannel in Firefox private windows, @notionhq/client v5.x specifics).Wait: Is this a "Non-obvious passthrough" where we SHOULD offer in-depth research?Let's think carefully!In the previous turn, the user already got an in-depth research report (<report id="0" ...>). Now in turn 2, the user asks to "Research and verify (2026, with official-doc citations; mark anything unconfirmed as UNVERIFIED) for a React+Vite web app ... 1... 2... 3... 4... 5... 6... 7...".Wait: Notice that for several parts (e.g., item 1 If-Match on multipart/resumable, item 3 prompt: '' under FedCM/3P cookies, item 6 keepalive/sendBeacon Firefox/Chrome reliability and navigator.locks in Firefox private windows), the snippets leave real gaps that must be marked UNVERIFIED! Also items 3 (Drive refresh token in Cloudflare Worker), 5 (@notionhq/client v5.x exact default header/rate limits), and 6 (pagehide/visibilitychange + keepalive/sendBeacon, Firefox private windows) were NOT covered in depth in the previous report (items 5's SDK internals and 6 weren't in the report at all, and item 3 explicitly changes the architecture to syncing via Cloudflare Worker).Therefore, this IS a non-obvious passthrough / broader extension & deep verification request not fully covered in the existing report! Adding "Would you like me to do a more in-depth research instead and propose a research plan?" on a new line at the very end of the response strictly satisfies Rule 5 of Mode 2. Let's make sure the exact string is on a new line at the very end:Would you like me to do a more in-depth research instead and propose a research plan?Wait—let's double check if there's any reason NOT to attach it.Let's re-read:"Obvious follow-up (Do NOT offer research): The user asks about facts, findings, or explanations that are already in the report, asks to clarify/elaborate on specific sections of the report, or asks simple definitions/explanations directly grounded in the report content. For these, answer directly and do NOT attach any research offer.Non-obvious passthrough (DO offer research): The user asks about new topics, new questions, or broader extensions that were NOT already covered in depth in the report (which would benefit from fresh, comprehensive research). In these cases, answer the question as best as you can based on the available context, and attach the following question on a new line at the very end of your response:"Would you like me to do a more in-depth research instead and propose a research plan?""Yes! Look at item 6 (pagehide/visibilitychange + fetch keepalive/sendBeacon, Firefox private windows for Web Locks and BroadcastChannel), item 5 (@notionhq/client v5.x SDK defaults), and item 3 (Drive OAuth refresh token in a Cloudflare Worker vs GIS token client under FedCM/3P cookie blocking), plus the explicit verification request ("Research and verify..."). These are genuinely new questions / broader technical deep-dives that were NOT covered in depth in <report id="0"> (the report didn't cover @notionhq/client default headers, didn't cover sendBeacon/keepalive, didn't cover Firefox private window BroadcastChannel/navigator.locks, and assumed no backend for Drive rather than evaluating a Cloudflare Worker refresh-token architecture). Offering in-depth research at the end is completely aligned with Rule 5!

Now let's carefully audit EVERY single claim we make against the snippets provided in the research notes AND ensure extreme accuracy, honesty (marking anything unconfirmed in the snippets as UNVERIFIED), exact citation formatting (\[cite: X\]), no citations inside fenced code blocks, and exact formatting per the user's instructions!

Let's examine each of the 7 items in detail by reading EVERY relevant snippet.

### Deep Audit of Item 1: Google Drive API v3 — If-Match / ETag, headRevisionId, revisions.list with drive.file, and Optimistic Concurrency

Let's check all snippets related to Item 1:

- **Does If-Match / ETag work for files.update on multipart and resumable uploads?**
    - Snippet1,1,2,3 (v2-to-v3-reference): In Drive API v3, the etag JSON field was removed from resources (e.g., Files, etag, N/A2 / etag, –1).
    - Snippet4 (user-info): "Note: If you're using the previous Drive API v2 version, the response body also includes the etag field."
    - Snippet5 (developers.google.com/workspace/drive/api/guides/performance): Mentions general REST theory ("If ETags are used by the API, the server updates ETag values when it successfully processes a patch request, just as it does with PUT"), NOT confirming Drive v3 supports If-Match on files.update.
    - Snippet6 (discuss.google.dev/t/drive-api-v3-supported-if-match-contract-for-media-only-file-replacement/410305): "update reference, upload guide, files.get reference, File resource and performance guide. We could not establish the complete route-specific concurrency contract from those sources. We are not assuming that the absence of an etag JSON field proves the absence of an HTTP ETag header... Developers often notice that standard HTTP header behaviors or contract expectations around If-Match do not behave."
    - Snippet7 (stackoverflow.com/questions/79865579/is-raceless-optimistic-concurrency-possible-in-google-drive-v3-interface): Tested curl PATCH to /upload/drive/v3/files/$FILE\_ID with If-Match: $ETAG and DELETE with If-Match: "The workaround to use v2 to get the etag and use in v3 doesn't work because the headers are ignored." Answer states: "As far as I can tell, in Google Drive there is no (server enforced) way to: lock a file. abort an edit/delete if the file changed out from under you since your last read."
    - Wait: Does If-Match / ETag work for files.update on **multipart** and **resumable** uploads according to official Google Drive v3 docs?
    - Official docs in our snippets (files.update8, manage-uploads9, files11, performance5) do NOT document or guarantee an If-Match / HTTP ETag optimistic concurrency contract for Drive v3 files.update (uploadType=multipart or uploadType=resumable). Community/developer testing reports If-Match headers are ignored on upload PATCH and DELETE7, and a Google Developer Forum thread specifically notes the route-specific concurrency contract for media replacement could not be established from official references6.
    - Therefore: **NO / UNVERIFIED in official docs** — Official Drive v3 documentation does not confirm If-Match enforcement for either uploadType=multipart or uploadType=resumable (and removes the etag resource field present in v22). Developer tests indicate If-Match is ignored on PATCH uploads7, though exact behavior specifically on uploadType=resumable session initiation/chunk PUT vs uploadType=multipart is **UNVERIFIED** in official documentation and must not be relied upon for data safety.
- **Is headRevisionId always present for JSON files?**
    - Let's check11 (developers.google.com/workspace/drive/api/reference/rest/v3/files):
        - "headRevisionId. string. Output only. The ID of the file's head revision. This is currently only available for files with binary content in Google Drive."
    - Let's also check11 (developers.google.com/workspace/drive/api/reference/rest/v3/files):
        - "This field isn't populated for items in shared drives. headRevisionId. string." Wait—let's check carefully what11 says!
        - Look at11: Text to be indexed for the file to improve fullText queries. This is limited ... This field isn't populated for items in shared drives. headRevisionId. string. Wait: in the files reference page, what is right before headRevisionId? Actually, hasAugmentedPermissions or folderColorRgb or fullFileExtension or hasThumbnail or spaces or teamDriveId? We shouldn't guess which field "This field isn't populated for items in shared drives" belongs to because snippet 187 has ... right before it! Let's check12 (v2 files):
        - "headRevisionId. string. Output only. The ID of the file's head revision. This field is only populated for files with content stored in Google Drive; it is not populated for Docs Editors or shortcut files."
        - And13 (about-files):
        - "Blob. A file type that contains raw binary or text content (such as images, videos, and PDFs) as opposed to a Google Workspace document. This is a Drive classification name and doesn't refer to JavaScript's Blob object."
        - So a JSON file uploaded with mimeType: "application/json" is a Drive blob file (raw text/binary content stored in Drive, as opposed to a Google Workspace Docs/Sheets/Slides document or shortcut), so headRevisionId is available for blob files with content stored in Drive (assuming fields requests it, since default files.get / files.list only returns a minimal field set4). Wait: what about newly created empty metadata-only files (0 bytes / no content uploaded yet) or Shared Drives? Because snippet 187 is truncated (... This field isn't populated for items in shared drives. headRevisionId), whether headRevisionId is omitted on Shared Drives or on 0-byte/newly-created metadata-only files is **UNVERIFIED** from the truncated snippet (and note that in11, there is also version: "A monotonically increasing version number for the file. This reflects every change made to the file on the server, even those not visible to the user", and md5Checksum for files with binary/stored content). Wait: we should check if headRevisionId is guaranteed on *all* JSON files in all contexts (e.g., My Drive vs Shared Drives, or if fields isn't requested, or if a JSON file has empty content):
            - Official v3 docs say headRevisionId is "only available for files with binary content in Google Drive" (which in Drive terminology means non-Workspace blob files11), and v2 docs say it is populated for files with content stored in Drive (not Docs Editors or shortcuts)12.
            - Note that in v3 you must explicitly request headRevisionId via the fields query parameter4.
            - Whether headRevisionId is populated on **Shared Drives** or for **0-byte metadata-only JSON placeholders** is **UNVERIFIED** from the official snippets here (snippet 187 has an ellipsis right before "This field isn't populated for items in shared drives"). Also note version (int64 string, monotonically increasing server version number) and md5Checksum exist on files11 as fallbacks.
- **Can revisions.list be called with drive.file scope?**
    - Look at15 (developers.google.com/workspace/drive/api/reference/rest/v3/revisions/list):
        - "Authorization scopes. Requires one of the following OAuth scopes:https://www.googleapis.com/auth/drivehttps://www.googleapis.com/auth/drive.appdatahttps://www.googleapis.com/auth/drive.file..."
    - YES! Official documentation explicitly lists https://www.googleapis.com/auth/drive.file as a supported scope for revisions.list15 (as well as revisions.delete16; and revisions.get / revisions.update — though note17 says access to historical revisions is also gated by role via capabilities.canReadRevisions on the files resource, and18 notes that revisions.list can omit older revisions and to download an older blob revision's content via revisions.get?alt=media you may need keepForever set first unless it's the current/downloadable revision — wait: look closely at18: "If you want to download a revision, make sure to set it to 'Keep Forever' first."! That's a super important caveat from18! Let's check18 and17!).
        - Look at18: "If you want to download a revision, make sure to set it to 'Keep Forever' first." And18 says keepForever applies to blob files (up to 200 kept revisions19). And17 notes you can check capabilities.canReadRevisions before attempting revision access, and GET .../revisions/{REVISION\_ID}?alt=media downloads a blob revision (or files.download with revision\_id).
        - Also, with drive.file scope, the app can of course only call revisions.list on files that were created by the app or explicitly opened/shared with the app (e.g., via Google Picker)20.
- **Best safe pattern for optimistic concurrency:**
    - Since Drive v3 provides no server-enforced If-Match lock or multi-file transactions6, the best safe pattern combines:
        - **Preflight metadata check** (GET /drive/v3/files/{fileId}?fields=id,headRevisionId,version,modifiedTime,md5Checksum,capabilities(canReadRevisions)): compare headRevisionId (with version / md5Checksum fallback if headRevisionId is absent) against the last synced local revision; if changed, download (alt=media), run deterministic HLC/CRDT field-level merge locally, and prepare the unified payload11.
        - **Upload (PATCH via uploadType=multipart)** with updated appProperties (ms\_hlc)8.
        - **Postflight verification (revisions.list / files.get)**: inspect the revision list immediately after upload to detect if another writer slipped a revision between preflight and PATCH; if an intervening revision exists (note: attempting to download an older unpinned revision may require marking keepForever via revisions.update first18, or detecting revision mismatch and surfacing conflict/re-merging if downloadable — wait: if an intervening revision was overwritten, can you download it? Only if Drive still holds it and/or keepForever works on historical non-head revisions! Wait:18 explicitly says "If you want to download a revision, make sure to set it to 'Keep Forever' first." And7 mentions "best-effort attempt to use their revisions api after the fact to see that it happened and create conflict files or try to merge the changes." So we should explicitly mention that downloading an older overwritten revision via revisions.get?alt=media may require setting keepForever: true via revisions.update first18, AND note that Drive's native concurrency cannot guarantee 100% zero-race overwrite if two clients upload simultaneously without a backend lock7 — wait: what if the Cloudflare Worker acts as a coordinator or you write immutable per-device/per-mutation delta files?!).
        - Wait: think about that! Look at what the user said: "syncs JSON files to Google Drive via a Cloudflare Worker"! If the app syncs via a Cloudflare Worker OR uses per-device/append-only history chunks (history/<chapter>-<device>-<seq>.json), per-device files avoid single-file write races entirely, and for shared per-chapter progress files, preflight headRevisionId/version + HLC merge + postflight revisions.list (and optionally a Cloudflare Worker lock/Durable Object if centralized locking is desired, or accepting that Drive API itself lacks If-Match) is the safest pattern! Let's keep the answer grounded in the Drive API facts and explicitly mention per-device files / HLC merge + preflight/postflight check (plus noting the keepForever caveat from18 and the limitation in7).

### Deep Audit of Item 2: drive.file Scope + Google Picker Folder Selection

- **If the user picks a FOLDER, does the app get access to files added to it later (by the user in Drive UI)?**
    - Let's check the snippets!
    - \[cite: 23\],23,23 (issuetracker.google.com/issues/332571420): "The application utilizes the drive.file scope. ... The user selects that folder using Picker API; The ... The picker does not provide access to child items." (Note: snippet23 shows full extraction of issue 332571420 was inaccessible, so we only have the excerpt "The picker does not provide access to child items.").
    - \[cite: 24\] (discuss.google.dev/t/personal-use-drive-readonly-app-on-netlify-verification-casa-exemption-and-permitted-scope/406329):"We evaluated drive.file/Google Picker first. Explicit per-file selection is supported, but we have not found a documented guarantee that authorizing a shared parent lets a custom server discover all existing and newly added descendants."
    - \[cite: 25\] (stackoverflow.com/questions/77772682/accessing-contents-of-a-folder-with-drive-file-scope-google-drive-api):"The scope drive.files \[drive.file\] gives you access to all files your app has created AND files that the user explicitly shared with your app, via Google File Picker for example. It works well for files atm, it's kind of a bummer that it doesn't work for folders as well." (Author ended up going through verification for sensitive/restricted scopes).
    - \[cite: 26\] (stackoverflow.com/questions/79718793/can-i-download-all-files-from-a-selected-directory-using-only-drive-file-permiss):"Ask for drive.readonly scope (Best but requires security review). But if you still want to use drive.file scope then in your Picker config, do not allow folder selection. Instead, ask users to open the folder and select the files manually." (setIncludeFolders: false, setSelectFolderEnabled: false, multiselect: true).
    - \[cite: 27\] (issuetracker.google.com/issues/322267485): Google engineer comment \#38 (Mar 19, 2026) mentions allow\_folder\_selection parameter in the new picker docs (overview-desktop\#display-picker), and28 (issuetracker.google.com/issues/511738736) mentions regressions in folder-selection use cases, while23 explicitly records "The picker does not provide access to child items."
    - Wait: Let's be super precise and honest!
        - **Short answer**: **No (and undocumented / unsupported in drive.file for externally added child files).** Selecting a folder via Google Picker with drive.file authorizes the folder resource itself, **not** existing or future child files created outside the app (such as files added later by the user/author in the Drive UI)23. (Note: Google Issue Tracker 332571420 itself returned inaccessible for full thread text23, though its indexed summary states "The picker does not provide access to child items"23, and whether newer 2026 Picker options like allow\_folder\_selection27 change child-item grant propagation under drive.file is **UNVERIFIED** without official Google documentation confirming descendant inheritance—which developers as of Oct 2026 still report does not exist24).
- **If not, what's the recommended pattern for a read-only "question bank" folder authored outside the app?**
    - Pattern 1 (Recommended to stay within non-sensitive drive.file and avoid CASA / 100-user cap20): Configure Google Picker for **multi-file selection** (navigate inside the bank folder in the Picker UI and select the JSON bank files, or select a single consolidated bank/manifest JSON file) with multiselect: true26. Store the selected fileIds locally (or in an app-created Drive index file) and provide a "Load / Update Question Bank" Picker button whenever new bank versions or chapter files are authored externally.
    - Pattern 2 (Alternative if folder-level automatic discovery of externally authored files is mandatory and the bank is a single shared/author-maintained dataset): Host the read-only question bank via a public/signed static manifest or Cloudflare Worker / Drive service-account / public Drive export (or GitHub/CDN) rather than OAuth user scopes, OR request drive.readonly ONLY if you are prepared to undergo **restricted-scope verification (\~6 weeks)** and an **annual CASA security assessment** (since data touches or routes through a Cloudflare Worker / server)20.

### Deep Audit of Item 3: Google Identity Services Token Client vs Server-Side Refresh Token in Cloudflare Worker (2026)

Let's examine every snippet for Item 3!

- **GIS Token Client (google.accounts.oauth2.initTokenClient):**
    - **Access token lifetime**: Short-lived, **1 hour (3600 seconds)** (expires\_in in TokenResponse31; Google docs explicitly state access tokens have a lifespan of 1 hour / 3600 seconds32).
    - **Silent renewal (prompt: '') under FedCM and third-party-cookie blocking**:
        - Look closely at35 and35 (use-token-model):
            - "Access tokens have a short lifetime and a new one must be obtained by calling requestAccessToken() from a user-driven event if it expires."
            - "In the Token model, an access token is not stored by the OS or browser, instead a new token is first obtained at page load time, or subsequently by triggering a call to requestAccessToken() through a user gesture such as a button press."
            - \[cite: 36\] (migration-to-gis): "For implicit mode, a user gesture is required to request an access token, even if there was a prior request." "Prior to issuing an access token to your app, an existing and active Google session is required to prompt for user consent and record the result."
            - \[cite: 36\] shows tokenClient.requestAccessToken({prompt: ''}). Notice31 says prompt defaults to 'select\_account'.
            - Wait: what about **FedCM** and **third-party-cookie blocking** with initTokenClient (google.accounts.oauth2) vs Sign-In (google.accounts.id)?
            - Let's check37 (fedcm-migration) and38 and36 (migration-to-gis)!
            - 37 (Migrate to FedCM): Covers Google Sign-In (google.accounts.id — One Tap and Sign In With Google Button), NOT google.accounts.oauth2.initTokenClient. It states: "When FedCM is enabled the browser displays user prompts and no third-party cookies are used."
            - \[cite: 36\] /36 (migration-to-gis): States under **Cookies**: "User authorization does not require the use of cookies. See Migrating from Google Sign-In for details of how user authentication makes use of cookies..." Wait: why does requestAccessToken({ prompt: '' }) open a popup (OAuth 2.0 implicit popup UX flow35)? When initTokenClient triggers a top-level popup to accounts.google.com, Google's authorization page accesses first-party accounts.google.com session cookies inside the popup (not third-party iframe cookies), though **popup blockers** block requestAccessToken() unless triggered directly by a user gesture (click)35, AND if the user isn't signed in or browser privacy settings partition/clear Google's session or FedCM isn't used for oauth2 token client yet, silent background renewal without user interaction isn't supported in the Token model!
            - Wait: Is initTokenClient itself using FedCM in 2026 or affected by third-party cookie blocking for prompt: ''? Let's check carefully: our snippets show FedCM migration docs (37,40,41,38) apply to the **Google Sign-In / Identity (google.accounts.id)** library (ID tokens, One Tap, Button), NOT google.accounts.oauth2.initTokenClient (which uses a popup OAuth implicit flow35 and explicitly requires a **user gesture** to call requestAccessToken()35). Whether Google added FedCM-backed silent prompt: '' renewal to initTokenClient in 2026 without a popup/user gesture is **UNVERIFIED** (and contradicts35 which explicitly require a user gesture to renew an expired token). Also note39: pop-up flows with initTokenClient require configuring Cross-Origin-Opener-Policy: same-origin-allow-popups (note: on GitHub Pages, you cannot set custom HTTP response headers directly unless routed via Cloudflare Worker/proxy—that's worth flagging or checking, though39 specifically lists COOP same-origin-allow-popups for popups!).
- **GIS Token Client vs. Server-Side Refresh Token in a Cloudflare Worker (initCodeClient / OAuth Code Flow):**
    - Let's compare both models using our snippets:
        - **GIS Token Client (initTokenClient)**:
            - Access token lasts 3600 s (1 hour)31, stored only in memory35.
            - No refresh tokens35; renewing an expired token requires a **user gesture** (requestAccessToken()), because background silent renewal without user interaction is not supported in the Token model35.
            - Major advantage: If Drive data stays browser-direct and never passes through a backend server, you avoid transmitting user Drive data to a server (Wait: look at20 &30: "If you store restricted scope data on servers (or transmit), then you must go through a security assessment." And with drive.file, drive.file is non-sensitive20, so even with a server it avoids CASA, though storing refresh tokens requires securely storing them on the backend20 and maintaining a client\_secret + auth code endpoint39).
        - **Authorization Code Flow (initCodeClient + Cloudflare Worker storing refresh token)**:
            - initCodeClient (ux\_mode: 'popup' recommended44) returns a one-time authorization code to your frontend callback, which posts it (verifying CSRF / X-Requested-With: XmlHttpRequest for popup mode44) to your Cloudflare Worker endpoint43.
            - The Worker holds the client\_secret39 and exchanges the code for an access\_token (1 hour) and a refresh\_token, stores the refresh token securely on the backend (e.g., encrypted in KV/D1 or an encrypted HttpOnly session cookie; note Google docs say "Refresh tokens are managed and stored by your backend platform"36), and transparently mints fresh access tokens when the 1-hour token expires without interrupting the user every hour42.
            - Note caveats: Refresh tokens can still expire or be revoked (by user action, policy, or **Testing-status app 7-day token expiration**45); and if the app only runs on GitHub Pages without a custom domain, cross-site cookies (github.io -> workers.dev) face third-party cookie restrictions unless both sit on the same site or use an explicit Authorization session token in memory/IndexedDB. Also note if you ever touch restricted scopes on a server, CASA assessment is mandatory20.
    - **Which is recommended in 2026 and why?**
        - Since **you already have a Cloudflare Worker** and the app is a long-running study scratchpad where learners work past 1 hour (and want seamless background queue flushing without 60-minute popup interruptions):
            - **If you want zero popup interruptions past 1 hour and seamless background/offline-queue sync** AND are comfortable managing encrypted refresh tokens + user session auth in the Cloudflare Worker: **initCodeClient (ux\_mode: 'popup') + Cloudflare Worker refresh token exchange** is recommended (using strictly the non-sensitive drive.file scope20 so you stay out of restricted-scope CASA audits, and keeping user authentication solid via same-site custom domain or explicit bearer session).
            - **Wait — what if the user wants pure client-side Drive sync with zero Drive data/tokens on the Worker (simpler security posture, zero server token storage liability, and strict offline-mode parity)?** Then **initTokenClient** is simpler and avoids storing per-user refresh tokens on your server (20), at the cost of requiring a user click on a "Re-sign in" banner every \~1 hour when the token expires (35).
            - Highlighting BOTH clearly—and explaining *why* initCodeClient + Worker wins for UX (no 1-hour popup interruptions, no silent-renewal fragility) while initTokenClient wins for zero-backend-secret simplicity—directly answers the question with precision! Let's make a clear recommendation (initCodeClient + Worker if Worker handles Drive auth/proxy, *provided* you keep drive.file non-sensitive and secure the Worker session; otherwise initTokenClient + Re-sign-in banner if keeping Drive pure client-side). Wait: re-read the prompt: "for a React+Vite web app (desktop Chrome/Edge/Firefox) that syncs JSON files to Google Drive via a Cloudflare Worker". Ah! The user specifically stated the app **syncs JSON files to Google Drive via a Cloudflare Worker**! Look at that phrasing in the prompt:"that syncs JSON files to Google Drive via a Cloudflare Worker and edits math with MathLive"In that architecture (where Drive calls already go via a Cloudflare Worker), **initCodeClient (ux\_mode: 'popup') with server-side refresh token management in the Cloudflare Worker** is clearly the recommended pattern in 2026! Why? Because:
                - initTokenClient cannot perform silent background renewal without a user gesture (requestAccessToken() requires a user click and active session, and tokens expire in 3600 s / 1 hour)31.
                - Using initCodeClient lets the Worker hold the client\_secret and refresh\_token, automatically refreshing expired 1-hour access tokens server-side with zero 60-minute popups and zero exposure of refresh tokens to browser JS39.
                - Keeping the scope strictly drive.file (non-sensitive) avoids restricted-scope verification and CASA security assessments that apply when restricted Drive data is transmitted through a server20. (Must verify OAuth consent screen is in **Production** status, not **Testing**, to avoid Testing token expiration limits46, and keep Worker + SPA on the same registrable domain or pass an opaque session token rather than relying on third-party cookies).

### Deep Audit of Item 4: MathLive Latest Version (0.111.x+) — APIs, RTL Persian Text, IME/Focus, Virtual Keyboard

Let's check every snippet for MathLive (0.111.x+):

- **Latest version seen in snippets**:
    - MathField 0.111.4 appears on official mathlive.io docs footer (47,47,48,49,50,51). Changelog snippet52 shows 0.111.1 2026-10-09. Security advisory CVE-2026-54705 (53) states versions prior to 0.110.0 failed to escape text-mode content in \text{} and \mbox{}. Note: whether a release newer than 0.111.4 shipped after Oct/Nov 2026 is **UNVERIFIED** from available docs (latest documented version in mathlive.io docs is 0.111.4).
- **API for mathModeSpace**:
    - Snippet54 (mathlive.io/mathfield/api/):
        - Property: mf.mathModeSpace (get mathModeSpace(): string / set mathModeSpace(value: string): void).
        - Behavior: "The LaTeX string to insert when the spacebar is pressed (on the physical or virtual keyboard). Use "\;" for a thick space, "\:" for a medium space, "\," for a thin space. Do not use " " (a regular space), as whitespace is skipped by LaTeX so this will do nothing."54.
        - Note caveat from55 (arnog/mathlive\#2208): even with a non-empty mathModeSpace, pressing Space in math mode also exits multi-character typeface extensions (e.g., \mathbf{foo}).
- **Inserting a newline / line break inside a math-field (Shift+Enter)**:
    - Look at56 (arnog/mathlive\#2650),57 (arnog/mathlive\#2551),58 (arnog/mathlive\#2132),59 (mathlive.io/mathfield/guides/commands/),47 (shortcuts),52 (changelog):
        - **Exact command name**: 'addRowAfter' (also 'addRowBefore', 'removeRow' in Arrays commands59), executed via mf.executeCommand('addRowAfter') or bound in mf.keybindings!
        - Look at56 (\#2650): MathLive has an intentional single-line vs multiline distinction: on line 1, Enter fires an input event (inputType === 'insertLineBreak'57); Ctrl+Enter transitions into a multiline environment (\displaylines{...}52); once in multiline mode, Enter adds a new line.
        - Look at57 (\#2551): Shows the exact pattern intercepting insertLineBreak (or keydown for Shift+Enter -> mf.executeCommand('addRowAfter')) and notes \#2551 fixed \displaylines{...} serialization syntax!
        - Look at52 (changelog): Fixed copy/serialization of multiline mathfields (\#3075), MathML serialization for \displaylines{\\ }, and vertical click positioning in multiline environments (\displaylines, gather, align).
        - Wait: Does mf.keybindings support { key: 'shift+enter', command: 'addRowAfter' } or { key: 'shift+\[Enter\]', command: 'addRowAfter' } directly on line 1 (when not yet inside a \displaylines environment)? Look at57: the user called this.mfe.executeCommand("addRowAfter") on input (insertLineBreak) and it generated \displaylines{...}! Wait — whether shift+\[Enter\] works cleanly from empty/single-line math-field via mf.keybindings vs intercepting keydown (ev.shiftKey && ev.key === 'Enter') -> mf.executeCommand('addRowAfter') across both math mode and text mode inside <math-field> is **UNVERIFIED** for text mode specifically (notice in57, the user even had to run if (this.selectedOption === 'text') { this.switchToText(); } after addRowAfter!).
- **Switching to text mode for RTL Persian text**:
    - Exact options & commands:
        - Property/attribute: mf.defaultMode = 'text' (or 'math' | 'inline-math', attribute default-mode)54.
        - Command: mf.executeCommand(\['switchMode', 'text'\]) / mf.executeCommand(\['switchMode', 'math'\]) (or keybinding command: \['switchMode', 'text'\])47. Default keybindings from62 (mathlive.io/mathfield/reference/keybindings/): Alt + = (⌥ + =) for apply text mode, Shift + Alt + T (⇧ + ⌥ + T) to toggle math/text mode (added in \#1830 specifically because Shift+' failed on non-US/Brazilian dead-key layouts63!).
        - Localization: MathfieldElement.locale = 'farsi' (explicitly supported in61).
        - Auto-switching option: mf.smartMode = true/false54 (English-oriented heuristic like "if x > 0").

**CRITICAL RTL LIMITATION**: In arnog/mathlive\#2544 (closed Nov 9, 2025), the author (arnog) explicitly stated: **"Note that in general the mathfield does not support RTL layout."**64. Trying to force RTL inside <math-field> via CSS breaks caret alignment and places minus signs at the wrong end of the text64. Furthermore,65 (KaTeX\#729) explains why TeX math font layouts struggle with Arabic/Persian: TeX's single-metric character model conflicts with cursive contextual glyph shaping, requiring dedicated web fonts rather than Computer Modern (61 notes MathLive uses Computer Modern-based fonts and "will not display correctly using another font"). Also note66 (\#3078/\#3079): when defaultMode: 'text', text runs mixed with math () needed fixing (\text{} wrapping) so serialized values work outside a text-default field, and52 notes the text-mode editor now preserves /


        -  math regions while escaping special characters in text regions.
- **Known issues with Persian/Arabic IME, first-click focus, and virtual-keyboard focus-loss bug**:
    - **Persian/Arabic & non-US keyboard layout issues**:
        - No native RTL layout support inside <math-field> (\#2544)64.
        - Unknown/non-US keyboard layouts cause keybinding detection mismatches (guides/shortcuts47; \#1830 dead-key failure fixed via Shift+Alt+T63).
        - smartMode uses English heuristics ("if x > 0"), which can misclassify input on non-English keyboards (UNVERIFIED specifically with Persian IME, so disabling smartMode = false is safer).
        - Note that native Persian IME composition specifically inside .ML\_\_keyboard-sink on Chrome/Firefox is **UNVERIFIED** in official MathLive docs (no official Persian IME certification exists; \#2544 confirms RTL itself is unsupported64).
    - **First-click focus / .ML\_\_keyboard-sink unresponsive bug**:
        - arnog/mathlive\#2644 (Mar 2025): Textarea/keyboard sink intermittently stays disabled / unresponsive until clicking/stopping propagation or running focus + blur + focus on the MathField67.
        - arnog/mathlive\#1439: Click events inside MathLive do not propagate out cleanly68.
        - arnog/mathlive\#2619 (Mar 2025): Placeholders inside a \displaylines{...} multiline environment are not focusable with a click60.
        - Recent fix in52 (changelog): Fixed a 60 ms focus steal bug and fixed vertical click positioning in multiline environments (\displaylines, gather, align).
    - **Virtual-keyboard focus-loss bug**:
        - arnog/mathlive\#2588 (Feb 2025): On Chromium-based browsers (Chrome/Edge 133+), opening and closing the virtual keyboard leaves the Shadow DOM contenteditable element (.ML\_\_keyboard-sink) in a ghost-blurred state: keydown events fire, but no input event is emitted and physical keyboard typing stops working69.
        - arnog/mathlive\#2300 (closed Nov 9, 2025): Moving cursor with mouse then opening/closing the virtual keyboard drops physical keyboard input because the keyboard sink loses focus (reported as addressed by arnog in Nov 2025)70.
        - Documented workaround from \#2588: Listen to window.mathVirtualKeyboard.addEventListener('virtual-keyboard-toggle', ...) and manually call .blur() then .focus() on mf.shadowRoot.querySelector('.ML\_\_keyboard-sink') (with setTimeout(..., 50) in some setups)69, and set mf.mathVirtualKeyboardPolicy = 'manual' if unwanted auto-popups trigger focus switches (\#2388)71. (Also note CSS rule --keyboard-zindex: 1 !important; caused virtual keyboard hover/click flickering on desktop in \#258772).
    - **Recommended implementation**: Because <math-field> officially does not support RTL layout (\#2544)64, keep Persian prose in native HTML RTL inputs (dir="auto", Vazirmatn font) and reserve <math-field> for isolated LTR math islands (defaultMode = 'math', mathModeSpace = '\\;', smartMode = false, MathfieldElement.locale = 'farsi', Shift+Alt+T for rare inline \text{}, Shift+Enter mapped to addRowAfter inside math or step-line breaks outside, plus .ML\_\_keyboard-sink blur/refocus on virtual-keyboard-toggle).

### Deep Audit of Item 5: @notionhq/client v5.x — Default Notion-Version, 2026-03-11 / data\_source\_id, Rate Limits

Let's check every snippet for @notionhq/client v5.x!

- **Default Notion-Version header in @notionhq/client v5.x**:
    - Look at73 (github.com/makenotion/notion-sdk-js README):
        - "This SDK supports both 2025-09-03 and 2026-03-11 API versions. **The default is 2025-09-03.**"73.
        - Also confirmed by74 (notion\_sdk tracking @notionhq/client 5.12.0: Notion API version header 2025-09-03) and75 ("uses @notionhq/client version 5, which talks to Notion API version 2025-09-03").
        - Wait: Look at76: @notionhq/client reached v5.31.0 on 2026-11-04. Did v5.13+ through v5.31.0 keep 2025-09-03 as the default (since major version stays v5 and README73 says "To use the newer version, pass it when constructing the client: new Client({ auth: ..., notionVersion: '2026-03-11' })", and77 says major releases update the default version)? Yes—73 is the live makenotion/notion-sdk-js README saying the default is 2025-09-03, and starting with v5.12.0 it also supports 2026-03-11 when passed explicitly (notionVersion: "2026-03-11")73. (Passing notionVersion: "2026-03-11" explicitly guarantees deterministic version behavior across all v5.12+ releases regardless of any minor change, and pinning @notionhq/client >= 5.12.0 is confirmed77).
- **Whether 2026-03-11 / data\_source\_id must be set explicitly**:
    - **2026-03-11**: Yes, must be passed explicitly via new Client({ auth, notionVersion: "2026-03-11" }) (otherwise @notionhq/client v5.x defaults to 2025-09-03)73. (Note key breaking changes in 2026-03-11: in\_trash replaces archived—archived is removed from requests and responses; position replaces after on appendBlockChildren; meeting\_notes replaces transcription73).
    - **data\_source\_id**: Yes! Since API version 2025-09-03 (the minimum supported version for @notionhq/client v5.0.0+73), /v1/databases was reorganized into /v1/data\_sources and /v1/databases78. Creating pages requires parent: { type: "data\_source\_id", data\_source\_id: "..." } (or parent: { data\_source\_id: "..." }) and querying requires POST /v1/data\_sources/{data\_source\_id}/query (notion.dataSources.query / notion.dataSources.retrieve)78. Note: Notion also supports CORS headers so browser calls are technically possible with dangerouslyAllowBrowser: true, **however** Notion explicitly forbids putting NOTION\_API\_KEY / tokens in browser page source or client bundles, so routing via the Cloudflare Worker is mandatory73.
- **Rate-limit handling in @notionhq/client v5.x**:
    - Official Notion limits (85 developers.notion.com/reference/request-limits):
        - **Per-connection limit**: 180 requests/min (avg 3 req/s) on Free/Plus plans, 600 requests/min (avg 10 req/s) on Business/Enterprise plans, spendable evenly or in bursts within a 60-second window (Retry-After <= 60 s).
        - **Querying a data source**: Separate limit of \~3 req/s per connection.
        - **Per-workspace limit**: Shared across all connections to the workspace (Retry-After can exceed 1 minute).
    - Built-in SDK retry behavior (73,85):
        - By default, @notionhq/client retries failed requests up to **2 times** (retry: { maxRetries: 2, initialRetryDelayMs: 1000, maxRetryDelayMs: 60000 } — configurable via retry option on new Client(...))73.
        - Automatically waits for Retry-After (capped at 60 s by default85) or uses exponential backoff with random jitter when the header is missing73.
        - Retries rate\_limited (429) for **all** HTTP methods73, plus 500 and 503 for idempotent GET and DELETE requests (never 502 or 504 automatically)85. (Note: Notion docs also mention 529 overloaded responses in general REST retry guidance85).
        - **Critical caveat for POST /v1/pages (timer sync)**: If a POST fails with a network drop or 5xx, retrying blindly risks creating duplicate pages because the first POST may have succeeded server-side86. Always query /v1/data\_sources/{data\_source\_id}/query by unique Session ID before retrying page creation, and put outgoing writes behind a Worker/outbox queue85.

### Deep Audit of Item 6: pagehide/visibilitychange + fetch keepalive/sendBeacon Reliability & Firefox Private Windows (Web Locks + BroadcastChannel)

Let's examine every snippet for Item 6 very carefully!

- **Reliability of pagehide / visibilitychange + fetch(..., { keepalive: true }) / navigator.sendBeacon() for flushing an outbox on tab close in desktop Chrome and Firefox**:
    - What is confirmed in our snippets:
        - \[cite: 87\] (developer.chrome.com/blog/fetch-later-api-origin-trial): Chrome developer docs confirm the standard unload pattern is listening to pagehide and visibilitychange events to catch the page unloading and using navigator.sendBeacon() or fetch() with keepalive: true.
        - \[cite: 88\] &89 (MDN Navigator.sendBeacon): Both sendBeacon() and fetch(..., { keepalive: true }) share a strict **64 KiB (65,536 bytes)** queued payload limit across pending beacons/keepalive requests (The total size of queued data is limited to 64 KiB)88.
        - \[cite: 90\] (fetch.spec.whatwg.org): keepalive is part of the Fetch standard (\#request-keepalive-flag), subject to CORS rules (CORS filtered response)90.
    - What is **UNVERIFIED** (and why this matters critically for a Drive/Cloudflare Worker sync outbox!):
        - Notice navigator.sendBeacon() cannot set custom Authorization: Bearer ... HTTP headers (only fetch(..., { keepalive: true, headers: { Authorization: ... } }) can—Wait: let's check if our snippets explicitly state sendBeacon cannot set custom headers or fetch keepalive Firefox support/bugs!). Wait: none of the fetched snippets explicitly cite Firefox's current implementation status/bugs for fetch({ keepalive: true }) or exact tab-close vs visibilitychange drop rates in Chrome vs Firefox! (Historically Firefox lacked fetch keepalive support for a long time until newer versions, and sendBeacon lacks Authorization headers unless tokens go in cookies/body, AND beforeunload/unload are unreliable compared to visibilitychange/pagehide, plus Drive PATCH /upload/drive/v3/files often sends full chapter JSONs that can exceed the **64 KiB** limit88 and cannot perform multi-step preflight GET + merge + PATCH + postflight revisions.list inside a single synchronous unload beacon!).
        - Wait: Let's be super rigorous! Only cite what is in the snippets and mark specific Chrome vs Firefox fetch keepalive tab-close delivery rates/browser bugs as **UNVERIFIED**!
        - What we CAN cite from snippets:
            - pagehide and visibilitychange with navigator.sendBeacon() or fetch({ keepalive: true }) is the documented Chrome unload pattern87.
            - Total queued data for sendBeacon (and keepalive fetch) is strictly capped at **64 KiB (65,536 bytes)**88.
            - Specific empirical drop rates on hard tab/browser-process close in desktop Chrome vs Firefox, and Firefox's exact version behavior for fetch({ keepalive: true }) CORS preflights on unload, are **UNVERIFIED** in the available sources.
            - Architectural conclusion: **Do NOT treat unload beacons as your durability mechanism.** Persist every edit into **IndexedDB immediately** during normal typing/blur (so tab close loses nothing locally even if network flush aborts), trigger proactive flushes on **visibilitychange (hidden)** while the page is still alive, and optionally use fetch(..., { keepalive: true }) on pagehide *only* for small (< 64 KiB88) single-shot payloads like Worker timer-session pings—never for multi-step Drive preflight/merge/upload transactions (which stay safely queued in sync\_outbox inside IndexedDB for retry on next tab open or sibling tab takeover!).
- **Web Locks (navigator.locks) and BroadcastChannel support in Firefox private windows**:
    - Look at the snippets we have for this!
    - \[cite: 91\] (github.com/blixvip/stick/blob/main/docs/WEB.md): "Writes take a Web Lock shared by every tab (navigator.locks, where the browser has it) so two tabs cannot take the same name... Storage is the browser's. It can be cleared by the person, by a private window ending..."
    - \[cite: 92\] (MDN Broadcast Channel API): Baseline across Chrome, Edge, Firefox, Safari; communicates between browsing contexts of the same origin92.
    - \[cite: 93\] (MDN DE Broadcast Channel API): "Genauer gesagt, ist die Kommunikation zwischen Browsing-Kontexten mit derselben Storage-Partition erlaubt." (Communication is allowed between browsing contexts sharing the **same storage partition**)93.
    - \[cite: 94\] (bugzilla.mozilla.org/show\_bug.cgi?id=1421099): Confirms normal tabs and private browsing tabs in Firefox are isolated—BroadcastChannel in a normal tab must NOT be able to message a private browsing tab (separate partitions)94.
    - \[cite: 95\] /96 (MDN Storage Access Policy): Third-party contexts with blocked/ungranted storage access throw SecurityError when constructing BroadcastChannel96.
    - **What about navigator.locks specifically inside a Firefox Private Browsing window (whether navigator.locks is available, throws SecurityError, or works per private partition)?**
        - Look at our snippets:91 only says "(navigator.locks, where the browser has it)", and93 /94 cover BroadcastChannel isolation between normal and private Firefox windows. None of the snippets confirm whether navigator.locks inside a **Firefox Private Browsing** window succeeds (scoped to the private session's storage partition), is disabled/undefined, or rejects with SecurityError!
        - Therefore: Mark navigator.locks availability and behavior inside **Firefox Private Browsing windows** as **UNVERIFIED** (and similarly mark BroadcastChannel communication *between two tabs within the same Firefox Private Browsing session* as **UNVERIFIED**, though cross-isolation from normal tabs is verified93 and third-party unpartitioned contexts throw SecurityError96).
        - **Recommended implementation**: Always feature-detect 'locks' in navigator and wrap both navigator.locks.request(...) and new BroadcastChannel(...) in try/catch (SecurityError / unavailable fallback) so if navigator.locks is missing or throws in a private window, the tab degrades gracefully to an IndexedDB heartbeat lease (app\_meta.leaderLease) plus single-tab local execution!

### Deep Audit of Item 7: Best Practice Debounced Autosave Interval for Drive Sync (2026 Per-User Quotas)

Let's examine the exact 2026 Google Drive API quotas in97 (developers.google.com/workspace/drive/api/guides/limits) and98 (handle-errors):

- **Google Drive API 2026 Quotas & Unit Costs** (97):
    - **Per minute per project**: 1,000,000 quota units (400,000,000 quota units per day per project — wait: notice97 has two quota tables! Let's read97 very carefully!):
        - First table in97:
            - Per minute per project: 1,000,000 quota units
            - Per minute per user per project: 325,000 quota units
            - Per day per project: 1 TB egress
            - Method weights: Read = 5 quota units, List = 100 quota units, Edit = 50 quota units, Download = 200 quota units, Other = 5 quota units.
            - Wait: what is the second table in97 (325,000 per minute per project / 1,000,000 per minute per user per project, and 400,000,000 per day per project, "Google Workspace standardized model for agent tools and APIs", "Drive MCP API Reference")? That second table at the bottom of97 is specifically for the **Drive MCP API / Workspace standardized agent tools**! For standard **Drive API v3 REST** calls, the standard limits are:
                - **1,000,000 quota units / minute / project**
                - **325,000 quota units / minute / user / project**
                - **1 TB / day / project** egress
                - **No daily request count cap** as long as you stay within per-minute quotas97
                - Cost per method: Read = 5 units, Edit = 50 units, List = 100 units, Download = 200 units97.
    - Let's do the exact math!
        - One preflight + upload + postflight sync cycle = GET metadata (5 units) + PATCH upload (50 units) + revisions.list (100 units if List, or 5 units if files.get — note97 classifies List methods at 100 units, Read at 5, Edit at 50). Even conservatively counting a full cycle as 5 + 50 + 100 = 155 quota units (or 55 units without listing revisions every save), 325,000 units/minute/user allows over 2,000 full sync cycles per minute per user before hitting 325,000!
        - **HOWEVER**,97 and98 also warn that **additional rate limit checks on the Drive backend** can still return 403: userRateLimitExceeded or 429: rateLimitExceeded on rapid bursts to a single file (Drive docs do not publish a public per-file per-second write cap — that internal single-file burst threshold is **UNVERIFIED** — and rapid overwrites also bloat file revisions and waste user quota/battery).
        - Look at98 &97 mitigation advice:
            - Coalesce/debounce rapid edits, batch where possible, avoid files.list (100 units) in the hot save loop by caching fileIds (files.get costs 5 units97), and handle 403 userRateLimitExceeded / 429 with truncated exponential backoff with random jitter (min((2^n) + random\_ms, 64 s))97.
- **Recommended Debounced Autosave Interval & Dual-Tier Pattern**:
    - **Local tier (IndexedDB)**: Debounce 150–300 ms (or immediate on blur/step change) so keystrokes never drop locally (< 16 ms perceived latency).
    - **Remote Drive tier (Cloudflare Worker -> Drive)**: Debounce **2,000–5,000 ms (2.5–3 s recommended sweet spot)** with a **max-wait ceiling** (e.g., 10–15 s during continuous typing so long sessions still checkpoint), plus **immediate flush** on high-intent events (Final Submit, leaving a step/question, switching chapters, or visibilitychange === 'hidden'), **coalescing by chapterId** in the outbox and capping single-file Drive writes to **at most 1 in-flight + 1 queued per file** (serialized per fileId, minimum \~2 s spacing). Notice this keeps a single active user around \~12–20 Drive write cycles per minute max—less than 1% of the 325,000 units/minute per-user quota97 while protecting against unpublished per-file 403/429 burst throttles. (Note: exact optimal debounce threshold under live Drive single-file revision creation throttling is empirical / **UNVERIFIED** without load testing).

### Strict Formatting & Compliance Check

Let's review ALL system prompt instructions and user formatting instructions to guarantee 100% compliance:

- **Mode 2: Simple Q&A**:
    - Do NOT use <report> tags! Plain text / standard Markdown only.
    - Answer directly and concisely using the research material and existing report.
    - Cite sources strictly using \[cite: source\_id\] format (e.g.,7 or97) at the end of sentences containing information from the research material.
    - Wait: Let's double check! Should we include clickable Markdown URLs as "evidence links" too, since the user explicitly asked: "Output: one section per item, short answer first, then evidence links, then recommended implementation."?
    - Let's check our instructions carefully:
        - System prompt says:
            - Cite Your Sources: End sentences containing information from the research material with a \[cite: source\_id\] citation.
            - Citation Format: Citations must strictly follow the \[cite: source\_id\] format (e.g., \[cite: \] or63). NEVER place citations inside fenced code blocks (```...```); citations must only appear in regular prose outside of code blocks.
            - No Internal Language: Never mention "snippets," "research material," or "report tags" in your response to the user.
        - Can we ALSO include the actual URLs from the snippets under **Evidence links** alongside \[cite: source\_id\] citations?
            - YES! Every snippet explicitly includes Url: <url>, and the user specifically asked for short answer first, then evidence links, then recommended implementation. Including the exact source URLs (from the snippets—never inventing any URL!) paired with \[cite: source\_id\] at the end of each bullet/sentence fulfills BOTH the user's explicit "evidence links" structure AND the system's strict \[cite: source\_id\] citation requirement!
    - Let's check LaTeX formatting rule:
        - Use LaTeX formatting strictly for all mathematical and scientific equations (including mathematical formulas, greek letters, chemical reactions, complex scientific notation, etc). However, NEVER use LaTeX for simple numbers, ranges, currency, measurement units, simple incline chemical formulas, citations, tables or table contents. NEVER use unicode characters for mathematical notation. Ensure that all latex, when used, is enclosed using '$' delimiters without any whitespace between the delimiters and the LaTeX expressions.
        - Watch out for code vs prose! Notice if we write \displaylines{...} or \; or \text{} as MathLive/LaTeX *code strings* inside inline backticks `\;` or `\displaylines{...}`, backticks are code, not math notation. Never use Unicode math characters like ± or ≤ or ≥ outside backticks if they represent math notation—actually better to avoid Unicode math symbols (≤, ≥, ×, →) in regular prose and use ASCII (<=, >=, ->) or words so we don't accidentally violate "NEVER use unicode characters for mathematical notation"! Let's scan our entire draft before outputting for any ≤, ≥, ×, →, ± outside code blocks! (Note: the user wrote ± in their context, if we refer to plus-minus branching we can write "plus/minus (\pm)" or `±` in backticks or —actually  has no whitespace and is valid LaTeX, or in prose "plus/minus"!). Let's check "±" carefully: "plus/minus" in prose and  if needed, or inside backticks if referring to the UI button label. Even safer: write plus/minus or !
    - Let's check Table Formatting:
        - If creating a table, use only single spaces between cell content and pipe (|) separators. Do not pretty-print tables. (Or we don't even need tables since the user requested: "Output: one section per item, short answer first, then evidence links, then recommended implementation.") Using clean headings + structured subsections (**Short answer**, **Evidence links**, **Recommended implementation**) matches the user's requested format directly and avoids any table formatting pitfalls.
    - Let's check Rule 5 of Mode 2:
        - Should we append "Would you like me to do a more in-depth research instead and propose a research plan?" on a new line at the very end of the response?
        - Let's double check! Look at the user's prompt again:The user is asking a detailed 7-point verification query covering items that were either marked NEEDS TESTING in the report, new architectural angles (Drive sync *via a Cloudflare Worker*, Worker refresh token vs GIS token client under FedCM/3P cookie blocking), or completely new topics (@notionhq/client v5.x default Notion-Version, pagehide/visibilitychange + fetch keepalive/sendBeacon, Firefox private windows for Web Locks and BroadcastChannel, exact 2026 Drive per-user quotas & debounced autosave). Furthermore, several empirical points remain UNVERIFIED in the available sources (exact If-Match behavior on resumable vs multipart uploads, headRevisionId on Shared Drives / 0-byte JSONs, 2026 allow\_folder\_selection child propagation under drive.file, GIS initTokenClient silent prompt: '' under FedCM/3P cookie blocking, navigator.locks & same-window BroadcastChannel inside Firefox private windows, and exact Chrome vs Firefox unload keepalive drop rates).Therefore, per Mode 2 Rule 5 ("The user asks about new topics, new questions, or broader extensions that were NOT already covered in depth in the report (which would benefit from fresh, comprehensive research)"), we attach:Would you like me to do a more in-depth research instead and propose a research plan?on a new line at the very end of our response!

Let's verify every single URL and source\_id before writing so there is ZERO hallucination or misattribution:

- Item 1:
    - https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference?hl=pt-br ->2 (and v2-to-v3-reference?hl=de1, user-info4) — Drive v3 removed etag from files resource.
    - https://discuss.google.dev/t/drive-api-v3-supported-if-match-contract-for-media-only-file-replacement/410305 ->6 — official upload/update/file references do not establish a route-specific If-Match concurrency contract for media replacement.
    - https://stackoverflow.com/questions/79865579/is-raceless-optimistic-concurrency-possible-in-google-drive-v3-interface ->7 — empirical curl test (Jan 2026) reports If-Match headers on PATCH upload and DELETE are ignored in Drive v3.
    - https://developers.google.com/workspace/drive/api/guides/manage-uploads ->9 (?hl=de10), https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update ->8 — uploadType=multipart (<= 5 MB) and uploadType=resumable; no If-Match documented.
    - https://developers.google.com/workspace/drive/api/reference/rest/v3/files ->11 (and11) — headRevisionId is output-only and "only available for files with binary content in Google Drive", plus version (monotonically increasing int64 string) and capabilities.canReadRevisions.
    - https://developers.google.com/workspace/drive/api/guides/about-files ->13 — Drive classifies raw binary/text files (including JSON) as "Blob" files distinct from Google Workspace docs/shortcuts.
    - https://developers.google.com/workspace/drive/api/reference/rest/v2/files ->12 — headRevisionId populated for files with content stored in Drive, not Docs Editors or shortcuts.
    - https://developers.google.com/workspace/drive/api/guides/search-files ->14 & https://developers.google.com/workspace/drive/api/guides/user-info ->4 — default response omits non-default fields unless specified via fields.
    - https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/list ->15 — https://www.googleapis.com/auth/drive.file is explicitly an authorized scope for revisions.list (and revisions.delete16).
    - https://developers.google.com/workspace/drive/api/guides/manage-revisions ->18 & https://developers.google.com/workspace/drive/api/guides/long-running-operations ->17 — older revisions may be omitted from revisions.list, downloading a historical blob revision requires setting Keep Forever (keepForever) first, and revision access depends on capabilities.canReadRevisions (revisions.update22, files.copy notes max 200 pinned revisions19).
- Item 2:
    - https://developers.google.com/workspace/drive/api/guides/api-specific-auth ->20 — drive.file is non-sensitive and grants access to files created by the app or opened/shared via Google Picker or the app's picker.
    - https://issuetracker.google.com/issues/332571420 ->23 — indexed summary states for drive.file + Picker folder selection: "The picker does not provide access to child items" (full thread text returned inaccessible23).
    - https://discuss.google.dev/t/personal-use-drive-readonly-app-on-netlify-verification-casa-exemption-and-permitted-scope/406329 ->24 — Oct 2026 developer evaluation confirms no documented guarantee that authorizing a shared parent folder via drive.file/Picker exposes existing or newly added descendants.
    - https://stackoverflow.com/questions/77772682/accessing-contents-of-a-folder-with-drive-file-scope-google-drive-api ->25 & https://stackoverflow.com/questions/79718793/can-i-download-all-files-from-a-selected-directory-using-only-drive-file-permiss ->26 — drive.file Picker works per-file (multiselect: true, setIncludeFolders: false), not recursively over folders.
    - https://issuetracker.google.com/issues/322267485 ->27 — Mar 2026 Google comment notes allow\_folder\_selection option on updated desktop Picker.
    - https://www.agenticfabriq.com/blog/google-oauth-verification-casa ->30 & https://github.com/open-webui/open-webui/issues/29537 ->29 — drive.readonly / drive are restricted scopes incurring \~6-week verification, 100-user cap while unverified, and annual CASA assessment if data reaches a server.
- Item 3:
    - https://developers.google.com/identity/oauth2/web/reference/js-reference ->31 — initTokenClient, TokenResponse.expires\_in, prompt defaults to 'select\_account'.
    - https://developers.google.com/identity/sign-in/android/authorize-access ->33, https://developers.google.com/identity/protocols/oauth2/service-account ->32, https://developers.google.com/identity/account-linking/oauth-linking ->34 — Google OAuth access tokens typically have a 1-hour (3600 seconds) lifetime.
    - https://developers.google.com/identity/oauth2/web/guides/use-token-model ->35 & https://developers.google.com/identity/oauth2/web/guides/migration-to-gis ->36 — Token model has no refresh tokens, does not store tokens in OS/browser, states user authorization does not require cookies, and **requires a user gesture** (requestAccessToken()) to obtain a new token when one expires (along with an active Google session).
    - https://developers.google.com/identity/gsi/web/guides/fedcm-migration ->37 & https://developers.google.com/identity/sign-in/web/server-side-flow ->38 — FedCM APIs govern Google Sign-In (google.accounts.id One Tap and Button) when third-party cookies are restricted; initTokenClient uses OAuth 2.0 popup UX rather than FedCM.
    - https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid ->39 — popup flows (initTokenClient or initCodeClient with ux\_mode: 'popup') require Cross-Origin-Opener-Policy: same-origin-allow-popups.
    - https://developers.google.com/identity/oauth2/web/guides/use-code-model ->44 & https://developers.google.com/identity/oauth2/web/guides/choose-authorization-model ->42 — initCodeClient (ux\_mode: 'popup' recommended) exchanges an auth code on your backend for access\_token + refresh\_token, verifying X-Requested-With: XmlHttpRequest for popup mode.
    - https://developers.google.com/identity/protocols/oauth2/production-readiness/overview ->46 & https://developers.google.com/identity/protocols/oauth2 ->45 — refresh tokens can expire due to Testing-status limits, user revocation, or policy.
- Item 4:
    - https://mathlive.io/mathfield/api/ ->54 — mf.mathModeSpace ("\;", "\:", "\,", never " " because whitespace is skipped in LaTeX), mf.defaultMode ("text" | "math" | "inline-math"), mf.smartMode, executeCommand('switchMode("latex")').
    - https://mathlive.io/mathfield/guides/shortcuts/ ->47 & https://mathlive.io/mathfield/changelog/ ->52 — latest documented version in mathlive.io is 0.111.4; mf.keybindings with command: \['switchMode', 'text'\]; keyboard layout warnings; \#3075 multiline copy fix; \#3081 role="group" / role="textbox" change.
    - https://nvd.nist.gov/vuln/detail/CVE-2026-54705 ->53 — prior to 0.110.0, MathLive failed to escape text-mode content in \text{}/\mbox{}.
    - https://github.com/arnog/mathlive/issues/2650 ->56, https://github.com/arnog/mathlive/issues/2551 ->57, https://mathlive.io/mathfield/guides/commands/ ->59 — single-line vs multiline (\displaylines{...}), Ctrl+Enter enters multiline, executeCommand("addRowAfter") inserts a line break (and \#2551 shows manual interception of insertLineBreak + calling switchToText() if in text mode).
    - https://mathlive.io/mathfield/reference/keybindings/ ->62, https://github.com/arnog/mathlive/issues/1830 ->63, https://mathlive.io/mathfield/guides/customizing/ ->61 — Shift+Alt+T (\['switchMode', 'text'\] / 'math') and Alt+= (apply text mode); MathfieldElement.locale = 'farsi'; Computer Modern fonts required.
    - https://github.com/arnog/mathlive/issues/3078 ->66 & https://mathlive.io/mathfield/changelog/ ->52 — defaultMode: "text" serialization fixes (\text{} wrapping when mixed with ).
    - https://github.com/arnog/mathlive/issues/2544 ->64 — arnog confirms: "Note that in general the mathfield does not support RTL layout."
    - https://github.com/KaTeX/KaTeX/issues/729 ->65 — explains Arabic/Persian cursive contextual shaping vs TeX glyph metrics.
    - https://github.com/arnog/mathlive/issues/2208 ->55 — SPACE key with non-empty mathModeSpace both inserts space and exits typeface extensions like \mathbf.
    - https://github.com/arnog/mathlive/issues/2644 ->67, https://github.com/arnog/mathlive/issues/2588 ->69, https://github.com/arnog/mathlive/issues/2300 ->70, https://github.com/arnog/mathlive/issues/1439 ->68, https://github.com/arnog/mathlive/issues/2619 ->60, https://github.com/arnog/mathlive/issues/2388 ->71 — .ML\_\_keyboard-sink focus/disabled bugs, virtual keyboard toggle ghost-blur in Chrome/Edge 133+, mf.mathVirtualKeyboardPolicy = 'manual', .ML\_\_keyboard-sink blur()/focus() workaround.
- Item 5:
    - https://github.com/makenotion/notion-sdk-js ->73 & https://developers.notion.com/reference/versioning ->77 — @notionhq/client v5.x supports 2025-09-03 and (from v5.12.0) 2026-03-11; **default is 2025-09-03**, so notionVersion: "2026-03-11" must be passed explicitly (v5.31.0 exists as of Nov 202676).
    - https://developers.notion.com/reference/data-source ->78, https://developers.notion.com/reference/changes-by-version ->79, https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03 ->82, https://developers.notion.com/guides/data-apis/create-pages-in-a-data-source ->83, https://developers.notion.com/reference/post-page ->84, https://developers.notion.com/reference/query-a-data-source ->81 — data\_source\_id is required in parent for POST /v1/pages and /v1/data\_sources/{data\_source\_id}/query since 2025-09-03.
    - https://developers.notion.com/reference/request-limits ->85 & https://www.runxbuild.com/blog/notion-api-rate-limits/ ->86 — 180 req/min (avg 3/s) standard or 600 req/min (avg 10/s) Business/Enterprise, plus \~3 req/s query cap and shared per-workspace cap; @notionhq/client retries 429 (maxRetries: 2, maxRetryDelayMs: 60000) honoring Retry-After and jitter, plus 500/503 on GET/DELETE; never blindly retry POST on dropped connections without querying data\_sources for deduplication first.
- Item 6:
    - https://developer.chrome.com/blog/fetch-later-api-origin-trial ->87 — standard unload pattern uses pagehide and visibilitychange with navigator.sendBeacon() or fetch(..., { keepalive: true }).
    - https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon ->88 — total queued data for sendBeacon / fetch({ keepalive: true }) is capped at **64 KiB (65,536 bytes)**.
    - https://fetch.spec.whatwg.org/ ->90 — Fetch keepalive flag obeys CORS rules.
    - https://developer.mozilla.org/en-US/docs/Web/API/Broadcast\_Channel\_API ->92 (and DE93), https://bugzilla.mozilla.org/show\_bug.cgi?id=1421099 ->94, https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Storage\_Access\_Policy ->96 — BroadcastChannel is restricted to contexts sharing the same storage partition (normal and private tabs in Firefox cannot message each other94; blocked storage access throws SecurityError96).
    - https://github.com/blixvip/stick/blob/main/docs/WEB.md ->91 — checks "where the browser has it" for navigator.locks and notes private windows clear storage on exit.
- Item 7:
    - https://developers.google.com/workspace/drive/api/guides/limits ->97 — Drive API v3 quotas: 1,000,000 units/min/project, 325,000 units/min/user/project, 1 TB/day/project egress, no daily request count limit if under per-minute quotas; method weights: Read=5, Edit=50, List=100, Download=200, Other=5; exponential backoff min((2^n) + random\_ms, maximum\_backoff) (32 or 64 s).
    - https://developers.google.com/workspace/drive/api/guides/handle-errors ->98 — 403 userRateLimitExceeded / rateLimitExceeded / dailyLimitExceeded and 429 rateLimitExceeded; advice to batch requests and use exponential backoff.

Let's double check for any banned Unicode mathematical symbols (≤, ≥, ×, →, ±) in our prose:

- Instead of ≤, write <= (in backticks) or "at most".
- Instead of ≥, write >= (in backticks) or "at least".
- Instead of ×, write "x" or "times".
- Instead of →, write -> (or "to").
- Instead of ± as math notation in prose, write "plus/minus" or backticked `±` when quoting a string/label.
- Let's make sure NO citations appear inside fenced code blocks (```...```)!
- Let's make sure every single item follows the exact structure requested by the user:**Short answer**, **Evidence links**, **Recommended implementation**.
- And at the very end, on a new line:Would you like me to do a more in-depth research instead and propose a research plan?

Everything is verified, concise, tightly structured, and completely faithful to the evidence. Let's write the final response.\#\# 1. Google Drive API v3: If-Match / ETag, headRevisionId, revisions.list, and Optimistic Concurrency

### Short answer

- **If-Match / ETag on files.update (multipart and resumable)**: **No / UNVERIFIED in official docs.** Google Drive API v3 removed the etag JSON property present in v22, official Drive v3 upload and file references do not document an If-Match concurrency contract6, and developer curl testing reports Drive v3 silently ignores If-Match headers on PATCH uploads and DELETE7. Exact server behavior specifically across uploadType=resumable initiation/chunk PUT vs uploadType=multipart is **UNVERIFIED** in official docs.
- **headRevisionId always present for JSON files?**: **Mostly yes for My Drive JSON files when requested via fields, with caveats.** Drive v3 classifies JSON files as "Blob" files (raw text/binary content, unlike Google Workspace docs/shortcuts)13, and headRevisionId is populated for blob files with content stored in Drive when explicitly requested in the fields query parameter4. However, whether headRevisionId is omitted for items in **Shared Drives** or for newly created 0-byte metadata-only JSON placeholders is **UNVERIFIED** from truncated official documentation11.
- **revisions.list with drive.file scope**: **Yes.** https://www.googleapis.com/auth/drive.file is explicitly listed as a valid OAuth scope for revisions.list (on files created or opened by the app)15, subject to the user's capabilities.canReadRevisions permission11. Note that revisions.list may omit older revisions15, and downloading a historical blob revision requires setting keepForever (Keep Forever) on it first18.
- **Best safe pattern for optimistic concurrency**: **Preflight files.get check (headRevisionId / version / md5Checksum) + deterministic local field-level HLC/CRDT merge + PATCH upload + postflight revisions.list race check**7 (and isolate per-device append-only history chunks so concurrent devices never overwrite the same log file).

### Evidence links

- Drive v2 to v3 field differences (etag removed in v3): https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference?hl=pt-br2
- Drive v3 files resource (headRevisionId for binary/blob content, version, capabilities.canReadRevisions): https://developers.google.com/workspace/drive/api/reference/rest/v3/files11
- Drive file types classification (Blob vs Workspace doc): https://developers.google.com/workspace/drive/api/guides/about-files13
- Drive v3 If-Match route contract ambiguity discussion: https://discuss.google.dev/t/drive-api-v3-supported-if-match-contract-for-media-only-file-replacement/4103056
- Empirical test showing Drive v3 ignores If-Match and lacks server-enforced locks: https://stackoverflow.com/questions/79865579/is-raceless-optimistic-concurrency-possible-in-google-drive-v3-interface7
- Drive v3 revisions.list scopes: https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/list15
- Drive Manage file revisions (Keep Forever requirement before downloading old revisions): https://developers.google.com/workspace/drive/api/guides/manage-revisions18

### Recommended implementation

Because Drive v3 provides no server-enforced If-Match abort mechanism6 and your architecture syncs through a **Cloudflare Worker**, implement two layers of protection:

- **Per-file concurrency protocol in the Worker/sync engine**:
    - **Preflight**: Call GET /drive/v3/files/{fileId}?fields=id,headRevisionId,version,md5Checksum,modifiedTime,capabilities(canReadRevisions)4. Compare headRevisionId (falling back to version and md5Checksum if headRevisionId is absent) against lastSyncedHeadRevisionId. If changed, download via alt=media, run a deterministic Hybrid Logical Clock (HLC) field-level merge, and upload the merged JSON (uploadType=multipart for <= 5 MB, uploadType=resumable above 5 MB)9.
    - **Postflight**: Immediately inspect GET /drive/v3/files/{fileId}/revisions?fields=revisions(id,modifiedTime)&pageSize=1015. If an unexpected intermediate revision appeared between preflight and your PATCH, flag a race (to download an overwritten non-head blob revision if needed, call revisions.update with keepForever: true first before revisions.get?alt=media, noting Drive caps keepForever at 200 revisions per file)18.
- **Structural race elimination**: Store append-only attempts in per-device files (history/<chapterId>-<deviceId>-<seq>.json) and, if cross-device single-file writes must be strictly serialized, coordinate per-file upload leases inside a **Cloudflare Durable Object** rather than relying on Drive headers.

## 2. drive.file Scope + Google Picker Folder Access & Question Bank Pattern

### Short answer

- **Does picking a folder grant access to files added later in Drive UI?**: **No (and UNVERIFIED for newer 2026 Picker flags).** Official Google Issue Tracker summaries state that under drive.file, selecting a folder via Google Picker *"does not provide access to child items"*23, and Google Workspace Q&A evaluations (Oct 2026) confirm there is no documented guarantee that authorizing a parent folder exposes existing or newly added descendant files24. (Note: Google added an allow\_folder\_selection option in the updated desktop Picker in Mar 202627, but whether that propagates drive.file grants to externally added children is **UNVERIFIED**—treat it as not propagating.)
- **Recommended pattern for an externally authored read-only question bank**: Either **(a)** use Google Picker with **multi-file selection** (or a single consolidated bank JSON file) rather than folder-level grants so the user explicitly picks new/updated bank files26, or **(b)** serve the read-only question bank as versioned static JSON from GitHub Pages / Cloudflare R2 / public Worker endpoint so Drive OAuth is needed only for user-owned progress/, history/, and exports/.

### Evidence links

- Google Drive scopes guide (drive.file per-file/Picker access vs restricted scopes): https://developers.google.com/workspace/drive/api/guides/api-specific-auth20
- Google Issue Tracker \#332571420 (Picker folder selection does not grant child item access): https://issuetracker.google.com/issues/33257142023 (full thread extraction returned inaccessible23)
- Google Developer Forum evaluation of drive.file + parent folder descendants (Oct 2026): https://discuss.google.dev/t/personal-use-drive-readonly-app-on-netlify-verification-casa-exemption-and-permitted-scope/40632924
- Developer Picker workaround (disable folder selection, enable multiselect: true): https://stackoverflow.com/questions/79718793/can-i-download-all-files-from-a-selected-directory-using-only-drive-file-permiss26
- Google Picker allow\_folder\_selection update (Mar 2026): https://issuetracker.google.com/issues/32226748527
- Verification and annual CASA cost of drive.readonly / drive: https://www.agenticfabriq.com/blog/google-oauth-verification-casa30 and https://github.com/open-webui/open-webui/issues/2953729

### Recommended implementation

- Request **only** https://www.googleapis.com/auth/drive.file (non-sensitive) to avoid Google's 100-user cap, \~6-week restricted review, and annual CASA security audits20.
- In the Picker configuration for user-authored Drive banks, set multiselect: true (disabling folder selection via setSelectFolderEnabled(false) / setIncludeFolders(false) or guiding users inside the folder to select the chapter/bank JSONs directly)26, cache the returned fileIds locally, and expose a **Refresh / Import Bank Files from Drive** button whenever authors upload new chapters.
- Alternatively, if the author only publishes updates centrally and does not require private Drive ACLs per student, host the \~700-question read-only bank behind a versioned static CDN/Worker manifest and keep Drive exclusively for user progress and history.

## 3. GIS Token Client vs. Server-Side Refresh Token in Cloudflare Worker (2026)

### Short answer

- **GIS Token Client (initTokenClient)**: Access tokens last **3,600 seconds (1 hour)** and stay in JS memory only (no refresh tokens)31. **Background silent renewal (prompt: '' without user interaction) is NOT supported** in the GIS Token Model: Google docs explicitly require a **user gesture** (requestAccessToken() inside a click handler) whenever an access token expires35. FedCM migration guides govern google.accounts.id (Sign-In One Tap / Button)37, whereas initTokenClient uses an OAuth 2.0 popup UX35; whether initTokenClient gains silent FedCM token renewal in 2026 without a popup/user gesture is **UNVERIFIED**.
- **Recommended in 2026 for a Worker-backed sync app**: Use **GIS Authorization Code Model (google.accounts.oauth2.initCodeClient, ux\_mode: 'popup') exchanging codes in your Cloudflare Worker for a server-side refresh\_token**42, using **only drive.file** scope20. This eliminates hourly user re-auth popups and lets the Worker flush queued changes seamlessly across long study sessions42.

### Evidence links

- GIS JS Reference (initTokenClient, initCodeClient, expires\_in, prompt default 'select\_account'): https://developers.google.com/identity/oauth2/web/reference/js-reference31
- Access token 1-hour (3600 seconds) lifetime: https://developers.google.com/identity/sign-in/android/authorize-access33 and https://developers.google.com/identity/protocols/oauth2/service-account32
- GIS Token Model guide (no refresh tokens, user gesture required on expiry): https://developers.google.com/identity/oauth2/web/guides/use-token-model35
- GIS Migration guide (requestAccessToken requires user gesture even after prior request; authorization does not require cookies): https://developers.google.com/identity/oauth2/web/guides/migration-to-gis36
- GIS Code Model guide (initCodeClient, ux\_mode: 'popup', X-Requested-With: XmlHttpRequest CSRF check): https://developers.google.com/identity/oauth2/web/guides/use-code-model44
- Choose authorization model comparison: https://developers.google.com/identity/oauth2/web/guides/choose-authorization-model42
- FedCM migration guide (applies to Google Sign-In One Tap / Button under restricted 3P cookies): https://developers.google.com/identity/gsi/web/guides/fedcm-migration37
- OAuth COOP setup (Cross-Origin-Opener-Policy: same-origin-allow-popups for popup UX): https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid39

### Recommended implementation

- **Use initCodeClient (ux\_mode: 'popup') + Cloudflare Worker**:
    - On the frontend, call google.accounts.oauth2.initCodeClient({ client\_id, scope: 'https://www.googleapis.com/auth/drive.file', ux\_mode: 'popup', callback }) and trigger client.requestCode() on Sign-In click36.
    - POST the one-time authorization code with X-Requested-With: XmlHttpRequest to your Cloudflare Worker44.
    - The Worker holds GOOGLE\_CLIENT\_SECRET, exchanges code at https://oauth2.googleapis.com/token (using the calling page's origin as redirect\_uri for popup mode)39, encrypts the refresh\_token in Cloudflare KV/D1 keyed to a Worker session ID, and returns an opaque session token (avoid relying on cross-origin third-party cookies between github.io and workers.dev, or serve both on one custom domain).
    - Publish the OAuth consent screen to **Production** (apps left in **Testing** suffer strict refresh-token expiration limits)46 and keep scope strictly to drive.file so routing Drive traffic through the Worker never triggers restricted-scope CASA audits20.
    - Keep a non-blocking **Re-sign-in Banner** as fallback because refresh tokens can still be revoked by the user or Google Workspace policy45.
    - (Note: If your GitHub Pages HTML needs Cross-Origin-Opener-Policy: same-origin-allow-popups for popup messaging and GitHub Pages cannot set custom response headers, verify popup callback delivery in Chrome/Firefox or proxy/host via Cloudflare Pages/custom domain39; **UNVERIFIED** on raw github.io defaults.)

## 4. MathLive (0.111.x+): Options, Commands, RTL Persian Text, and Focus/IME Bugs

### Short answer

- **Latest verified version**: **0.111.4** is the current version shown in official mathlive.io documentation47 (>= 0.110.0 is mandatory to patch CVE-2026-54705 XSS in \text{}/\mbox{})53; any newer patch release after 0.111.4 is **UNVERIFIED**.
- **mathModeSpace**: mf.mathModeSpace = '\\;' (or '\\:' / '\\,'; never ' ' because LaTeX skips ordinary whitespace)54. Note that pressing Space with a non-empty mathModeSpace also exits typeface commands like \mathbf (\#2208)55.
- **Newline / line break (Shift+Enter)**: Command 'addRowAfter' (via mf.executeCommand('addRowAfter')), which creates/extends a \displaylines{...} multiline construct57. Because Enter defaults to single-line insertLineBreak on line 1 (\#2650) and Shift+Enter is not bound to multiline creation by default56, intercept Shift+Enter on keydown and call mf.executeCommand('addRowAfter') (exact behavior when switching directly from text mode into addRowAfter without re-calling switchMode is **UNVERIFIED**—see \#255157).
- **Text mode & RTL Persian support**: Commands \['switchMode', 'text'\] / \['switchMode', 'math'\] (default keybindings Shift+Alt+T and Alt+=)47, mf.defaultMode = 'text' | 'math' | 'inline-math'54, and MathfieldElement.locale = 'farsi'61. **Crucial limitation**: MathLive maintainers explicitly confirm **<math-field> does not support RTL layout** (\#2544)64, and TeX math glyph metrics clash with Persian cursive contextual shaping (KaTeX\#729)65.
- **IME, first-click focus, & virtual keyboard focus-loss bugs**: MathLive routes typing through a Shadow DOM contenteditable element (.ML\_\_keyboard-sink)69. Real issues document intermittent disabled/unresponsive sinks requiring focus + blur + focus (\#2644)67, non-propagating clicks (\#1439)68, unclickable placeholders inside \displaylines (\#2619)60, and Chrome/Edge 133+ ghost-blurring .ML\_\_keyboard-sink after toggling the virtual keyboard (\#2588, where keydown fires but input stops; \#2300 addressed a cursor-move + virtual-keyboard focus loss in Nov 2025)69. Specific Persian OS IME composition behavior inside .ML\_\_keyboard-sink is **UNVERIFIED** in official docs.

### Evidence links

- MathLive API (mathModeSpace, defaultMode, smartMode, executeCommand): https://mathlive.io/mathfield/api/54
- MathLive Commands (switchMode, addRowAfter, addRowBefore, removeRow): https://mathlive.io/mathfield/guides/commands/59
- MathLive Keybindings (Shift+Alt+T, Alt+=) & Shortcuts (0.111.4): https://mathlive.io/mathfield/reference/keybindings/62 and https://mathlive.io/mathfield/guides/shortcuts/47
- MathLive Customizing (MathfieldElement.locale = 'farsi', Computer Modern fonts): https://mathlive.io/mathfield/guides/customizing/61
- CVE-2026-54705 (fixed in >= 0.110.0): https://nvd.nist.gov/vuln/detail/CVE-2026-5470553
- RTL unsupported (\#2544): https://github.com/arnog/mathlive/issues/254464
- Single-line vs multiline Enter / Ctrl+Enter (\#2650) & addRowAfter (\#2551) & \displaylines placeholder click bug (\#2619): https://github.com/arnog/mathlive/issues/265056, https://github.com/arnog/mathlive/issues/255157, https://github.com/arnog/mathlive/issues/261960
- .ML\_\_keyboard-sink disabled/focus bugs (\#2644, \#2588, \#2300, \#2388): https://github.com/arnog/mathlive/issues/264467, https://github.com/arnog/mathlive/issues/258869, https://github.com/arnog/mathlive/issues/230070, https://github.com/arnog/mathlive/issues/238871
- Changelog (accessibility role="group" / role="textbox", multiline copy \#3075, text-mode  preservation): https://mathlive.io/mathfield/changelog/52

### Recommended implementation

- **Pin mathlive >= 0.111.4**47. Note that 0.111.x removed mf.expression and mf.getValue('math-json'); extract MathJSON via MathfieldElement.computeEngine.parse(mf.getValue()).json52.
- **Do NOT put Persian RTL paragraphs inside <math-field>**64: Build each step as an ordered StepSegment\[\] flow combining native RTL dir="auto" text boxes (styled with Vazirmatn font100, native Space, native Shift+Enter, native OS IME) with LTR <bdi dir="ltr" style="unicode-bidi: isolate"><math-field> math islands.
- **Configure each <math-field> island** with:
    - MathfieldElement.locale = 'farsi' (when UI is Persian)61
    - mf.defaultMode = 'math'54
    - mf.smartMode = false (avoids English heuristics misinterpreting input)54
    - mf.mathModeSpace = '\\;'54
    - mf.mathVirtualKeyboardPolicy = 'manual' (optional if preventing auto-popup focus jumps)71
    - Layout-independent keybinding { key: 'shift+alt+\[KeyT\]', ifMode: 'math', command: \['switchMode', 'text'\] } (avoiding Shift+' dead-key issues)47
    - keydown interception for Shift+Enter -> mf.executeCommand('addRowAfter') (plus re-applying mode if inside inline text mode)57
    - Defensive .ML\_\_keyboard-sink blur() + focus() inside pointerdown (requestAnimationFrame) and window.mathVirtualKeyboard.addEventListener('virtual-keyboard-toggle', ...) to work around \#2588 and \#264467.

## 5. @notionhq/client v5.x: Default Notion-Version, 2026-03-11 / data\_source\_id, and Rate Limits

### Short answer

- **Default Notion-Version header**: **2025-09-03**, even though @notionhq/client has reached v5.31.0 and supports 2026-03-11 starting in v5.12.073.
- **Must 2026-03-11 and data\_source\_id be set explicitly?**: **Yes for both.** To use 2026-03-11, pass notionVersion: "2026-03-11" explicitly to new Client(...) (note breaking changes: in\_trash replaces archived, position replaces after, meeting\_notes replaces transcription)73. Since 2025-09-03 (required by v5.0.0+), Notion split databases into **Data Sources**, so querying uses /v1/data\_sources/{data\_source\_id}/query and creating pages requires parent: { data\_source\_id }79.
- **Rate-limit handling**: Notion enforces **180 req/min** (avg 3 req/s) on Free/Plus plans, **600 req/min** (avg 10 req/s) on Business/Enterprise plans, a separate \~3 req/s cap for querying a data source, and a shared per-workspace limit (Retry-After can exceed 60 s)85. @notionhq/client v5.x automatically retries 429 (rate\_limited) for all HTTP methods up to maxRetries: 2 by default, honoring Retry-After (capped at 60 s) plus jitter, and retries 500/503 only for GET/DELETE73.

### Evidence links

- @notionhq/client GitHub README (default 2025-09-03, 2026-03-11 support, retry options, dangerouslyAllowBrowser): https://github.com/makenotion/notion-sdk-js73
- Notion Versioning & SDK compatibility (v5.12.0+ supports 2026-03-11): https://developers.notion.com/reference/versioning77
- Notion Data Source object & 2025-09-03 database split: https://developers.notion.com/reference/data-source78 and https://developers.notion.com/reference/changes-by-version79
- Create pages in a data source (parent.data\_source\_id, Notion-Version: 2026-03-11): https://developers.notion.com/guides/data-apis/create-pages-in-a-data-source83
- Notion Request Limits & SDK retry policy: https://developers.notion.com/reference/request-limits85
- Notion retry idempotency warning for POST: https://www.runxbuild.com/blog/notion-api-rate-limits/86

### Recommended implementation

- Pin @notionhq/client >= 5.12.0 inside the **Cloudflare Worker** (never bundle Notion tokens in the browser SPA73) and instantiate with new Client({ auth: env.NOTION\_TOKEN, notionVersion: '2026-03-11', retry: { maxRetries: 3, maxRetryDelayMs: 60000 } })73.
- Retrieve the data\_source\_id via notion.databases.retrieve (data\_sources array) during setup83, and send timer completions via parent: { type: 'data\_source\_id', data\_source\_id }82.
- **Deduplicate POST retries**: Because a dropped connection after POST /v1/pages may have already created the Notion page86, configure maxRetries: 0 on non-idempotent page creation or perform an explicit lookup via notion.dataSources.query filtering by your Session ID UUID property before creating a page, forwarding any 429 Retry-After duration back to the SPA outbox when workspace limits exceed 60 s85.

## 6. pagehide/visibilitychange + keepalive/sendBeacon on Tab Close & Firefox Private Windows

### Short answer

- **Flushing outbox on tab close (pagehide/visibilitychange + fetch keepalive / sendBeacon)**: Chrome docs recognize pagehide and visibilitychange + navigator.sendBeacon() / fetch(..., { keepalive: true }) as the standard unload pattern87, **however**, queued payload size is strictly limited to **64 KiB (65,536 bytes)**88, keepalive fetches remain bound by CORS rules90, and exact delivery reliability on abrupt desktop Chrome vs Firefox tab closes (including Firefox's exact version-specific fetch keepalive + CORS preflight behavior on unload) is **UNVERIFIED**. Furthermore, sendBeacon cannot attach custom Authorization headers, and Drive sync requires multi-step preflight/merge/postflight rounds that exceed single-request beacons.
- **Web Locks + BroadcastChannel in Firefox private windows**: BroadcastChannel is strictly isolated per storage partition—normal Firefox windows and private browsing windows cannot message each other93, and ungranted/third-party contexts throw SecurityError96. Whether navigator.locks is fully available per private-window partition, degraded, or throws SecurityError in **Firefox Private Browsing**, and whether two tabs in the *same* Firefox private window share a BroadcastChannel, is **UNVERIFIED** in available docs.

### Evidence links

- Chrome unload pattern (pagehide + visibilitychange + sendBeacon / fetch keepalive): https://developer.chrome.com/blog/fetch-later-api-origin-trial87
- MDN Navigator.sendBeacon() (64 KiB limit shared with fetch keepalive): https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon88
- WHATWG Fetch Standard (keepalive flag & CORS filtering): https://fetch.spec.whatwg.org/90
- MDN BroadcastChannel (same storage partition rule & SecurityError under blocked storage): https://developer.mozilla.org/en-US/docs/Web/API/Broadcast\_Channel\_API92 (DE partition note: https://developer.mozilla.org/de/docs/Web/API/Broadcast\_Channel\_API93) and https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Storage\_Access\_Policy96
- Mozilla Bug \#1421099 (normal vs Firefox private browsing BroadcastChannel isolation): https://bugzilla.mozilla.org/show\_bug.cgi?id=142109994
- navigator.locks defensive feature-check reference: https://github.com/blixvip/stick/blob/main/docs/WEB.md91

### Recommended implementation

- **Treat IndexedDB—not unload beacons—as your durability guarantee**: Write every mutation to IndexedDB + sync\_outbox before any network call. Trigger normal async Drive/Worker flushes immediately when document.visibilityState === 'hidden' (via visibilitychange), which runs far earlier and more reliably than tab teardown.
- **Optional pagehide beacon scope**: Only use fetch(workerUrl, { method: 'POST', keepalive: true, ... }) on pagehide for tiny (<= 64 KiB, single-request)88 timer-pause checkpoints to your Cloudflare Worker—never for Drive chapter JSONs or multi-step preflight merges. Any unacknowledged Drive changes remain in sync\_outbox and flush automatically on next app open or via a surviving sibling tab.
- **Defensive multi-tab coordination**: Wrap new BroadcastChannel(...) in try/catch (SecurityError)96 and check 'locks' in navigator. If navigator.locks.request('ms\_sync\_leader', { ifAvailable: true }, ...) is missing or throws in a Firefox private window, fall back cleanly to an IndexedDB heartbeat lease in app\_meta (and warn private-browsing users that closing all private windows wipes local storage91).

## 7. Debounced Autosave Interval for Drive Sync vs. 2026 Per-User Quotas

### Short answer

Use a **two-tier debounce**: **150–300 ms** locally to IndexedDB (or immediate on step blur) and **2,500–3,000 ms (2.5–3 s) debounce with a 10–15 s max-wait cap** for Drive uploads, plus immediate flush on high-intent actions (Final Submit, question switch, visibilitychange: hidden). In 2026, Google Drive API v3 enforces **325,000 quota units/minute/user/project** and **1,000,000 units/minute/project** (1 TB/day egress; no daily request count cap within per-minute limits), charging 5 units per Read (files.get), 50 per Edit (PATCH), 100 per List (files.list / revisions.list), and 200 per Download97. Although 325,000 units/minute easily permits \~2,000 sync cycles/minute mathematically, Drive still imposes undocumented backend burst checks returning 403 userRateLimitExceeded or 429 rateLimitExceeded (UNVERIFIED exact single-file per-second write ceiling)97.

### Evidence links

- Google Drive API v3 Usage Limits (2026 per-minute per-user/project quotas & method unit weights, backoff formula): https://developers.google.com/workspace/drive/api/guides/limits97
- Google Drive API Error Handling (403 userRateLimitExceeded, 429 rateLimitExceeded, batching & backoff): https://developers.google.com/workspace/drive/api/guides/handle-errors98

### Recommended implementation

- **Outbox coalescing**: Key dirty state by chapterId in Dexie's sync\_outbox so 50 keystrokes inside 3 seconds collapse into a single pending upload rather than 50 queued requests.
- **Quota-efficient save loop**:
    - **Typing debounce**: 2,500–3,000 ms trailing debounce with a 12,000 ms max-wait interval during continuous writing (NEEDS TESTING with real editing cadence), plus immediate flush on Final Submit or visibilitychange === 'hidden'.
    - **Cache fileIds in IndexedDB**: Avoid calling files.list (100 units) on every save; use cached fileIds so preflight files.get (5 units) + PATCH upload (50 units) costs just 55 quota units (or 155 when listing revisions)97.
    - **Serialize per fileId**: Allow at most 1 active upload per Drive file (>= 2,000 ms minimum spacing between sequential updates to the same file) and retry 403 userRateLimitExceeded / 429 / 5xx with Drive's documented jittered backoff: min((2 \*\* attempt) \* 1000 + randomMs(0..1000), 64000)97.

Would you like me to do a more in-depth research instead and propose a research plan?

#### Works cited

- Vergleichsreferenz für Drive API Version 2 und Version 3, [https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference?hl=de](https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference?hl=de)
- Referência de comparação da API Drive v2 e v3, [https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference?hl=pt-br](https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference?hl=pt-br)
- Drive API v2 与v3 比较参考文档, [https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference?hl=zh-cn](https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference?hl=zh-cn)
- Return user info | Google Drive, [https://developers.google.com/workspace/drive/api/guides/user-info](https://developers.google.com/workspace/drive/api/guides/user-info)
- Improve performance | Google Drive, [https://developers.google.com/workspace/drive/api/guides/performance](https://developers.google.com/workspace/drive/api/guides/performance)
- Drive API v3: supported If-Match contract for media-only file, [https://discuss.google.dev/t/drive-api-v3-supported-if-match-contract-for-media-only-file-replacement/410305](https://discuss.google.dev/t/drive-api-v3-supported-if-match-contract-for-media-only-file-replacement/410305)
- Is raceless optimistic concurrency possible in google drive v3, [https://stackoverflow.com/questions/79865579/is-raceless-optimistic-concurrency-possible-in-google-drive-v3-interface](https://stackoverflow.com/questions/79865579/is-raceless-optimistic-concurrency-possible-in-google-drive-v3-interface)
- Method: files.update | Google Drive, [https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update)
- Upload file data | Google Drive, [https://developers.google.com/workspace/drive/api/guides/manage-uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- Google Drive - Dateidaten hochladen, [https://developers.google.com/workspace/drive/api/guides/manage-uploads?hl=de](https://developers.google.com/workspace/drive/api/guides/manage-uploads?hl=de)
- REST Resource: files | Google Drive, [https://developers.google.com/workspace/drive/api/reference/rest/v3/files](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)
- REST Resource: files | Google Drive, [https://developers.google.com/workspace/drive/api/reference/rest/v2/files](https://developers.google.com/workspace/drive/api/reference/rest/v2/files)
- Files and folders overview | Google Drive, [https://developers.google.com/workspace/drive/api/guides/about-files](https://developers.google.com/workspace/drive/api/guides/about-files)
- Search for files and folders | Google Drive, [https://developers.google.com/workspace/drive/api/guides/search-files](https://developers.google.com/workspace/drive/api/guides/search-files)
- Method: revisions.list | Google Drive, [https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/list](https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/list)
- Method: revisions.delete | Google Drive, [https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/delete](https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/delete)
- Manage long-running operations | Google Drive, [https://developers.google.com/workspace/drive/api/guides/long-running-operations](https://developers.google.com/workspace/drive/api/guides/long-running-operations)
- Manage file revisions | Google Drive, [https://developers.google.com/workspace/drive/api/guides/manage-revisions](https://developers.google.com/workspace/drive/api/guides/manage-revisions)
- Method: files.copy | Google Drive, [https://developers.google.com/workspace/drive/api/reference/rest/v3/files/copy](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/copy)
- Choose Google Drive API scopes, [https://developers.google.com/workspace/drive/api/guides/api-specific-auth](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- Add custom file properties | Google Drive, [https://developers.google.com/workspace/drive/api/guides/properties](https://developers.google.com/workspace/drive/api/guides/properties)
- Method: revisions.update | Google Drive, [https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/update](https://developers.google.com/workspace/drive/api/reference/rest/v3/revisions/update)
- \[332571420\] - Issue Tracker, [https://issuetracker.google.com/issues/332571420](https://issuetracker.google.com/issues/332571420)
- Personal-use drive.readonly app on Netlify: verification/CASA, [https://discuss.google.dev/t/personal-use-drive-readonly-app-on-netlify-verification-casa-exemption-and-permitted-scope/406329](https://discuss.google.dev/t/personal-use-drive-readonly-app-on-netlify-verification-casa-exemption-and-permitted-scope/406329)
- Accessing Contents of a Folder With drive.file Scope - Stack Overflow, [https://stackoverflow.com/questions/77772682/accessing-contents-of-a-folder-with-drive-file-scope-google-drive-api](https://stackoverflow.com/questions/77772682/accessing-contents-of-a-folder-with-drive-file-scope-google-drive-api)
- Can I download all files from a selected directory using only drive.file, [https://stackoverflow.com/questions/79718793/can-i-download-all-files-from-a-selected-directory-using-only-drive-file-permiss](https://stackoverflow.com/questions/79718793/can-i-download-all-files-from-a-selected-directory-using-only-drive-file-permiss)
- Google Drive Picker For iOS and Android - Issue Tracker, [https://issuetracker.google.com/issues/322267485](https://issuetracker.google.com/issues/322267485)
- \[511738736\] - Issue Tracker, [https://issuetracker.google.com/issues/511738736](https://issuetracker.google.com/issues/511738736)
- Google Drive picker should request only the drive.file scope to avoid, [https://github.com/open-webui/open-webui/issues/29537](https://github.com/open-webui/open-webui/issues/29537)
- Google OAuth Verification and CASA for AI Apps - Agentic Fabriq, [https://www.agenticfabriq.com/blog/google-oauth-verification-casa](https://www.agenticfabriq.com/blog/google-oauth-verification-casa)
- Google Account Authorization JavaScript API reference | Web guides, [https://developers.google.com/identity/oauth2/web/reference/js-reference](https://developers.google.com/identity/oauth2/web/reference/js-reference)
- Using OAuth 2.0 for Server to Server Applications | Authorization, [https://developers.google.com/identity/protocols/oauth2/service-account](https://developers.google.com/identity/protocols/oauth2/service-account)
- Authorize access to Google user data | Identity - Android Developers, [https://developers.google.com/identity/sign-in/android/authorize-access](https://developers.google.com/identity/sign-in/android/authorize-access)
- Google Account Linking with OAuth, [https://developers.google.com/identity/account-linking/oauth-linking](https://developers.google.com/identity/account-linking/oauth-linking)
- Use the token model | Web guides - Google for Developers, [https://developers.google.com/identity/oauth2/web/guides/use-token-model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- Migrate to Google Identity Services | Web guides, [https://developers.google.com/identity/oauth2/web/guides/migration-to-gis](https://developers.google.com/identity/oauth2/web/guides/migration-to-gis)
- Migrate to FedCM | Web guides - Google for Developers, [https://developers.google.com/identity/gsi/web/guides/fedcm-migration](https://developers.google.com/identity/gsi/web/guides/fedcm-migration)
- Google Sign-In for server-side apps | Web guides, [https://developers.google.com/identity/sign-in/web/server-side-flow](https://developers.google.com/identity/sign-in/web/server-side-flow)
- Setup | Web guides | Google for Developers, [https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)
- Sign In With Google Release Notes | Web guides, [https://developers.google.com/identity/gsi/web/reference/release-notes](https://developers.google.com/identity/gsi/web/reference/release-notes)
- Sign in with Google JavaScript API reference | Web guides, [https://developers.google.com/identity/gsi/web/reference/js-reference](https://developers.google.com/identity/gsi/web/reference/js-reference)
- Choose a user authorization model | Web guides, [https://developers.google.com/identity/oauth2/web/guides/choose-authorization-model](https://developers.google.com/identity/oauth2/web/guides/choose-authorization-model)
- How user authorization works | Web guides - Google for Developers, [https://developers.google.com/identity/oauth2/web/guides/how-user-authz-works](https://developers.google.com/identity/oauth2/web/guides/how-user-authz-works)
- Use Code Model | Web guides - Google for Developers, [https://developers.google.com/identity/oauth2/web/guides/use-code-model](https://developers.google.com/identity/oauth2/web/guides/use-code-model)
- Using OAuth 2.0 to Access Google APIs | Authorization, [https://developers.google.com/identity/protocols/oauth2](https://developers.google.com/identity/protocols/oauth2)
- OAuth app state overview - Google for Developers, [https://developers.google.com/identity/protocols/oauth2/production-readiness/overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- Keybindings and Inline Shortcuts - MathLive, [https://mathlive.io/mathfield/guides/shortcuts/](https://mathlive.io/mathfield/guides/shortcuts/)
- Units and Quantities - MathLive, [https://mathlive.io/compute-engine/guides/units/](https://mathlive.io/compute-engine/guides/units/)
- MathLive SDKs, [https://mathlive.io/sdk/](https://mathlive.io/sdk/)
- Patterns and Rules - MathLive, [https://mathlive.io/compute-engine/guides/patterns-and-rules/](https://mathlive.io/compute-engine/guides/patterns-and-rules/)
- MathJSON Format - MathLive, [https://mathlive.io/math-json/](https://mathlive.io/math-json/)
- Mathfield Changelog - MathLive, [https://mathlive.io/mathfield/changelog/](https://mathlive.io/mathfield/changelog/)
- CVE-2026-54705 Detail - NVD, [https://nvd.nist.gov/vuln/detail/CVE-2026-54705](https://nvd.nist.gov/vuln/detail/CVE-2026-54705)
- Mathfield API Reference - MathLive, [https://mathlive.io/mathfield/api/](https://mathlive.io/mathfield/api/)
- Option to Disable Automatic `\mathbf` Extension to Subsequent, [https://github.com/arnog/mathlive/issues/2208](https://github.com/arnog/mathlive/issues/2208)
- Inconsistent Behavior of Enter Key vs Ctrl+Enter for Line Breaks in, [https://github.com/arnog/mathlive/issues/2650](https://github.com/arnog/mathlive/issues/2650)
- Multiline Invalid Latex · Issue \#2551 · arnog/mathlive - GitHub, [https://github.com/arnog/mathlive/issues/2551](https://github.com/arnog/mathlive/issues/2551)
- Backspace on virtual keyboard needs to delete new line · Issue \#2132, [https://github.com/arnog/mathlive/issues/2132](https://github.com/arnog/mathlive/issues/2132)
- Commands - MathLive, [https://mathlive.io/mathfield/guides/commands/](https://mathlive.io/mathfield/guides/commands/)
- Placeholders in a multi-line environment not focusable with pointer, [https://github.com/arnog/mathlive/issues/2619](https://github.com/arnog/mathlive/issues/2619)
- Customizing a Mathfield - MathLive, [https://mathlive.io/mathfield/guides/customizing/](https://mathlive.io/mathfield/guides/customizing/)
- Keyboard Shortcuts - MathLive, [https://mathlive.io/mathfield/reference/keybindings/](https://mathlive.io/mathfield/reference/keybindings/)
- Can't shift between text and math mode using keyboard shortcut with, [https://github.com/arnog/mathlive/issues/1830](https://github.com/arnog/mathlive/issues/1830)
- \[Bug\] Incorrect Caret Positioning in RTL · Issue \#2544 · arnog/mathlive, [https://github.com/arnog/mathlive/issues/2544](https://github.com/arnog/mathlive/issues/2544)
- Add support for Persian & Arabic alphabet in text and eastern-arabic, [https://github.com/KaTeX/KaTeX/issues/729](https://github.com/KaTeX/KaTeX/issues/729)
- Text runs are serialized without \text{} when defaultMode is ... - GitHub, [https://github.com/arnog/mathlive/issues/3078](https://github.com/arnog/mathlive/issues/3078)
- Bug Report: MathLive Plugin - Textarea Remains Disabled \#2644, [https://github.com/arnog/mathlive/issues/2644](https://github.com/arnog/mathlive/issues/2644)
- click events inside of mathlive input not propagating out · Issue \#1439, [https://github.com/arnog/mathlive/issues/1439](https://github.com/arnog/mathlive/issues/1439)
- Virtual keyboard issue \#2588 - arnog/mathlive - GitHub, [https://github.com/arnog/mathlive/issues/2588](https://github.com/arnog/mathlive/issues/2588)
- Physical keyboard does not write anything to the math field (in some, [https://github.com/arnog/mathlive/issues/2300](https://github.com/arnog/mathlive/issues/2300)
- Hide virtual keyboard always · Issue \#2388 · arnog/mathlive - GitHub, [https://github.com/arnog/mathlive/issues/2388](https://github.com/arnog/mathlive/issues/2388)
- Virtual keyboard acting weird on desktop · Issue \#2587 - GitHub, [https://github.com/arnog/mathlive/issues/2587](https://github.com/arnog/mathlive/issues/2587)
- makenotion/notion-sdk-js: Official Notion JavaScript Client - GitHub, [https://github.com/makenotion/notion-sdk-js](https://github.com/makenotion/notion-sdk-js)
- notion\_sdk - Hex.pm, [https://hex.pm/packages/notion\_sdk](https://hex.pm/packages/notion_sdk)
- Notion API, update a checkbox value in a database - Flavio Copes, [https://flaviocopes.com/notion-api-update-a-checkbox-value-in-a-database/](https://flaviocopes.com/notion-api-update-a-checkbox-value-in-a-database/)
- Notion SDK for JavaScript - Browse /v5.31.0 at SourceForge.net, [https://sourceforge.net/projects/notion-sdk-for-js.mirror/files/v5.31.0/](https://sourceforge.net/projects/notion-sdk-for-js.mirror/files/v5.31.0/)
- Versioning - Notion Docs - Notion API, [https://developers.notion.com/reference/versioning](https://developers.notion.com/reference/versioning)
- Data source - Notion Docs, [https://developers.notion.com/reference/data-source](https://developers.notion.com/reference/data-source)
- Changes by version - Notion Docs, [https://developers.notion.com/reference/changes-by-version](https://developers.notion.com/reference/changes-by-version)
- Notion API (2025-09-03) | Get Started - Postman, [https://developers.notion.com/guides/resources/notion-s-api-workspace](https://developers.notion.com/guides/resources/notion-s-api-workspace)
- Query a data source - Notion Docs, [https://developers.notion.com/reference/query-a-data-source](https://developers.notion.com/reference/query-a-data-source)
- Upgrade guide - Notion Docs, [https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03](https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03)
- Create a page in a data source - Notion Docs, [https://developers.notion.com/guides/data-apis/create-pages-in-a-data-source](https://developers.notion.com/guides/data-apis/create-pages-in-a-data-source)
- Create a page - Notion Docs, [https://developers.notion.com/reference/post-page](https://developers.notion.com/reference/post-page)
- Request limits - Notion Docs, [https://developers.notion.com/reference/request-limits](https://developers.notion.com/reference/request-limits)
- Notion API Rate Limits: Three Requests a Second and How to Live, [https://www.runxbuild.com/blog/notion-api-rate-limits/](https://www.runxbuild.com/blog/notion-api-rate-limits/)
- The fetchLater API Origin Trial | Blog - Chrome for Developers, [https://developer.chrome.com/blog/fetch-later-api-origin-trial](https://developer.chrome.com/blog/fetch-later-api-origin-trial)
- Navigator: sendBeacon() method - Web APIs | MDN, [https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon)
- Navigator: sendBeacon()-Methode - Web-APIs | MDN, [https://developer.mozilla.org/de/docs/Web/API/Navigator/sendBeacon](https://developer.mozilla.org/de/docs/Web/API/Navigator/sendBeacon)
- Fetch Standard, [https://fetch.spec.whatwg.org/](https://fetch.spec.whatwg.org/)
- stick/docs/WEB.md at main - blixvip - GitHub, [https://github.com/blixvip/stick/blob/main/docs/WEB.md](https://github.com/blixvip/stick/blob/main/docs/WEB.md)
- Broadcast Channel API - MDN Web Docs, [https://developer.mozilla.org/en-US/docs/Web/API/Broadcast\_Channel\_API](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)
- Broadcast Channel API - Web-APIs - MDN Web Docs - Mozilla, [https://developer.mozilla.org/de/docs/Web/API/Broadcast\_Channel\_API](https://developer.mozilla.org/de/docs/Web/API/Broadcast_Channel_API)
- blob URLs do not respect OriginAttributes segregation, [https://bugzilla.mozilla.org/show\_bug.cgi?id=1421099](https://bugzilla.mozilla.org/show_bug.cgi?id=1421099)
- Storage access policy: Block cookies from trackers - MDN Web Docs, [https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Storage\_Access\_Policy](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Storage_Access_Policy)
- Usage limits | Google Drive, [https://developers.google.com/workspace/drive/api/guides/limits](https://developers.google.com/workspace/drive/api/guides/limits)
- Resolve errors | Google Drive, [https://developers.google.com/workspace/drive/api/guides/handle-errors](https://developers.google.com/workspace/drive/api/guides/handle-errors)
- Mathfield Changelog - MathLive, [https://cortexjs.io/mathlive/changelog/](https://cortexjs.io/mathlive/changelog/)
- Persian Right — RTL & Font for AI Chatbots - Firefox Addons, [https://addons.mozilla.org/en-US/firefox/addon/persian-rtl-font-for-chatbots/](https://addons.mozilla.org/en-US/firefox/addon/persian-rtl-font-for-chatbots/)
- Agents Md Persian by MiladJoodi — AI Skill for Any LLM | TypingMind, [https://www.typingmind.com/skills/miladjoodi-agents-md-persian](https://www.typingmind.com/skills/miladjoodi-agents-md-persian)

