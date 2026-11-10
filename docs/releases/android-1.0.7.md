# Publishing Feker 1.0.7 to Google Play

Written for Codex and whoever holds Play Console access. The build is done and
verified — your job is to re-verify it, sideload-test it, and upload it. **The
upload is manual**: there is no service account or fastlane in this repo, so
nobody can push to Play from the command line.

| | |
|---|---|
| Package | `com.alahliyya.lms` (label **Feker**) |
| versionCode / versionName | **10** / **1.0.7** |
| Upload this | `Feker-1.0.7.aab` (repo root, 6,956,777 bytes) |
| Sideload test build | `Feker-1.0.7.apk` (repo root, 7,304,179 bytes — same code, signed, release config) |
| Signed by | `CN=Students Alahliyya`, SHA-256 `09340f795faa304bb7503055ba9ec8356814986df3ef9ca07f21ccab72ecdf71` |
| Built from | `main` @ `345866e` |

Both artifacts are gitignored. Do not commit them.

**`Feker-1.0.6.aab` and `Feker-1.0.6.apk` are also at the repo root and are
superseded.** They are version code 9, built before this release. Play is
already serving 1.0.6 as code 8. Upload the 1.0.7 files and nothing else.

## What changed since the version on Play

- **Reordering by dragging.** The up/down arrows in a course's Curriculum and
  Videos are gone. Each row ends with a grip: hold it and drag the row. A
  lesson can be dragged into another section. The keyboard still works —
  focus a grip, then Space and the arrow keys.
- **Deleting asks first**, everywhere, in the app's own dialog and language,
  naming what is about to go. The curriculum previously deleted a section and
  all its lessons on a single tap with no question asked.
- **A way back** from the privacy policy and the support page, which are plain
  pages outside the app and previously had no route back into it.
- **Full screen on a video actually covers the screen.** It never did: the
  player was resized to the screen but left sitting in the page.
- Safe-area padding on the privacy and support pages, so neither sits under
  the status bar on an edge-to-edge phone.

## 1. Re-verify the build

From the repo root. Every line should pass before anything is uploaded.

```bash
# Rebuild from source (optional, but proves the artifact matches main)
cd client && npm install && npm run build:android
cd android && JAVA_HOME="C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot" ./gradlew.bat bundleRelease assembleRelease

# The packaged web bundle must call the absolute API, not a relative path
grep -l "https://students-alahliyaa.com/api/v1" app/src/main/assets/public/assets/*.js

# Signature and version (build-tools 36.0.0)
SDK="C:/Users/User/AppData/Local/Android/Sdk/build-tools/36.0.0"
"$SDK/apksigner.bat" verify --print-certs app/build/outputs/apk/release/app-release.apk
"$SDK/aapt2.exe" dump badging app/build/outputs/apk/release/app-release.apk | head -1

# No server secret may ship inside the package
cd ../.. && node scripts/scan-apk-secrets.mjs client/android/app/build/outputs/apk/release/app-release.apk
```

Expected: `CN=Students Alahliyya` with the SHA-256 above, `versionCode='10'
versionName='1.0.7'`, and `PASS: no server secret found in the APK.`

If the signature block is missing entirely, `client/android/keystore.properties`
was not found — see section 5.

## 2. Sideload test before uploading

`adb install -r Feker-1.0.7.apk` on a real phone, then:

1. **Sign in** as a student.
2. **Play a course video**, and tap the expand control: the video must cover
   the whole screen with the page gone behind it, and the moving watermark
   must still appear over it. Collapse must bring the lesson back.
3. **Past questions** open in the in-app reader, with no download button.
4. **Teacher account → a course → Curriculum.** Press and hold the grip at the
   end of a lesson row, drag it to another position, release, then reload the
   page: the new order must have held. Repeat dragging a lesson into a
   different section, and dragging a whole section.
5. **Delete a lesson.** A dialog must appear naming the lesson. Cancel must
   leave it alone; confirm must remove it.
6. **Privacy policy** from the sidebar: the Back control at the top must
   return to the app, and must not sit under the status bar.
7. **Account deletion** — the link is in the student sidebar; the page must
   load and accept a request (Play requires this path to exist).

Dragging is the new thing here and the one that most needs a real finger: it
starts after a short press-and-hold, so a quick swipe should still scroll the
page rather than pick a row up.

A debug build must never be published: debug permits cleartext traffic to a LAN
dev server. Only use the artifacts named above.

## 3. What a human does in the Play Console

1. Play Console → **Feker** → *Release* → **Production** (or *Testing →
   Internal testing* first, which is safer).
2. **Create new release**, upload `Feker-1.0.7.aab`.
3. If Play rejects it with *"Version code 10 has already been used"*: raise
   `versionCode` in `client/android/app/build.gradle` above whatever the
   Console shows as highest, rebuild (section 1), upload again. Never lower it.
4. Paste the release notes below into **English (United States)** and
   **Arabic**.
5. Review and **start rollout**. A staged rollout (20%) is reasonable.

## 4. Release notes

**English (en-US)**

```
Drag to reorder sections, lessons and videos — hold the handle and move it.
Deleting now asks you to confirm first.
Full screen on a video fills the whole screen properly.
The privacy policy and support pages now have a Back button.
Fixes and polish throughout, in both Arabic and English.
```

**Arabic (ar)**

```
اسحب لإعادة ترتيب الوحدات والدروس ومقاطع الفيديو — اضغط مطوّلاً على المقبض وحرّكه.
يطلب الحذف تأكيدًا قبل تنفيذه.
يملأ وضع ملء الشاشة الشاشة بالكامل كما ينبغي.
أضيف زر رجوع إلى صفحتي سياسة الخصوصية والدعم.
إصلاحات وتحسينات عامة، بالعربية والإنجليزية.
```

Both are inside Play's 500-character limit per language.

## 5. Store listing items this release depends on

| Console field | Value |
|---|---|
| Privacy policy | `https://students-alahliyaa.com/privacy/` |
| Data safety → account deletion | `https://students-alahliyaa.com/support/` |

Store graphics are in the repo root: `Feker-Play-Store-Icon-512.png`,
`Feker-Play-Store-Feature-Graphic-1024x500.png`, and `play-store-screenshots/`.

**The website must be deployed before or with this release.** The app loads its
pages from `students-alahliyaa.com`, so the privacy and support back buttons
only appear once the new web build is live there.

## 6. Do not

- **Do not generate a new keystore.** The upload key is
  `client/android/alahliyya-upload.jks` with `client/android/keystore.properties`.
  Both are gitignored and must stay out of the repository and out of any log.
- **Do not change `applicationId`.** Changing `com.alahliyya.lms` creates a new
  app rather than an update.
- **Do not commit the `.aab` or `.apk`.**
- **Do not publish a debug build**, and do not upload the 1.0.6 files.

## 7. If something fails

- *Gradle cannot find the SDK* → `client/android/local.properties` holds
  `sdk.dir`; it is machine-specific and gitignored.
- *Gradle refuses to run on this Java* → it needs JDK 21. JDK 24 will not work.
- *Upload rejected as unsigned* → `keystore.properties` was missing at build
  time; the build silently produces an unsigned artifact so a clean checkout is
  never blocked. Restore it and rebuild.
- *Dragging does nothing on the phone* → the grip needs `touch-none`, or the
  browser claims the gesture for scrolling. It is set in
  `client/src/components/DragHandle.jsx`; check that file first.
