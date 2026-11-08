# Publishing Feker 1.0.6 to Google Play

Written for Codex. The build is already done and verified — your job is to
re-verify it, sideload-test it, and hand a human the exact steps for the
upload. **The final upload is manual**: there is no service account or
fastlane setup in this repo, so nobody can push to Play from the command line.

| | |
|---|---|
| Package | `com.alahliyya.lms` (label **Feker**) |
| versionCode / versionName | **7** / **1.0.6** |
| Upload this | `Feker-1.0.6.aab` (repo root, 6.9 MB) |
| Sideload test build | `Feker-1.0.6.apk` (repo root, 7.3 MB — same code, signed, release config) |
| Signed by | `CN=Students Alahliyya`, SHA-256 `09340f795faa304bb7503055ba9ec8356814986df3ef9ca07f21ccab72ecdf71` |
| Built from | `main` @ `26790dc` |

Both artifacts are gitignored. Do not commit them.

## 1. Re-verify the build

Run these from the repo root. Every one should pass before anything is uploaded.

```bash
# Rebuild from source (optional, but proves the artifact matches main)
cd client && npm run build:android
cd android && JAVA_HOME="C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot" ./gradlew.bat bundleRelease assembleRelease

# The web bundle inside the app must call the absolute API, not a relative path
grep -l "https://students-alahliyaa.com/api/v1" ../dist/assets/*.js   # must match something

# Signature and version (build-tools 36.0.0)
SDK="C:/Users/User/AppData/Local/Android/Sdk/build-tools/36.0.0"
"$SDK/apksigner.bat" verify --print-certs app/build/outputs/apk/release/app-release.apk
"$SDK/aapt2.exe" dump badging app/build/outputs/apk/release/app-release.apk | head -1

# No server secret may ship inside the package
cd ../.. && node scripts/scan-apk-secrets.mjs client/android/app/build/outputs/apk/release/app-release.apk
```

Expected: `CN=Students Alahliyya` with the SHA-256 above, `versionCode='7'
versionName='1.0.6'`, and `PASS: no server secret found in the APK.`

If the signature block is missing entirely, `client/android/keystore.properties`
was not found — see section 5.

## 2. Sideload test before uploading

Install `Feker-1.0.6.apk` on a real Android phone (`adb install -r
Feker-1.0.6.apk`) and check:

1. **Sign in** as a student account.
2. **Open a course video.** It must start within a few seconds. This release
   follows a server fix for videos that would not play at all; if a video still
   hangs, stop and report it rather than publishing.
3. **Past questions** open in the in-app reader, with no download button.
4. **Account deletion** — the link sits in the student sidebar; the page must
   load and accept a request (Play requires this path to exist).
5. **Teacher account**: open a course → Curriculum, move a section and a lesson,
   reload, and confirm the order held.

A debug build must never be published: debug permits cleartext traffic to a LAN
dev server. Only use the artifacts named above.

## 3. What a human does in the Play Console

Give these steps to whoever holds Play Console access for `com.alahliyya.lms`:

1. Play Console → **Feker** → *Release* → **Production**
   (or *Testing → Internal testing* first, which is safer for a first upload
   after a long gap).
2. **Create new release**.
3. Upload `Feker-1.0.6.aab`.
4. If Play rejects it with *"Version code 7 has already been used"*: raise
   `versionCode` in `client/android/app/build.gradle` to one above whatever the
   Console shows as the highest, rebuild (section 1), and upload again. Never
   lower it.
5. Paste the release notes from section 4 into **English (United States)** and
   **Arabic**.
6. Review and **start rollout**. A staged rollout (20%) is reasonable given this
   release follows a playback fix.

Review usually takes a few hours to a couple of days.

## 4. Release notes

**English (en-US)**

```
Videos now start playing right away, including long lectures.
Past questions open in the app with practice questions underneath.
You can report or block someone in a Q&A thread.
You can request account deletion from your account page.
Instructors can reorder sections, lessons and videos.
Fixes and polish throughout, in both Arabic and English.
```

**Arabic (ar)**

```
تبدأ مقاطع الفيديو بالعمل فورًا، بما في ذلك المحاضرات الطويلة.
تُفتح الأسئلة السابقة داخل التطبيق مع أسئلة تدريب تحتها.
يمكنك الإبلاغ عن مستخدم أو حظره في نقاشات الأسئلة والأجوبة.
يمكنك طلب حذف حسابك من صفحة الحساب.
يستطيع المدرّسون إعادة ترتيب الأقسام والدروس ومقاطع الفيديو.
إصلاحات وتحسينات عامة، بالعربية والإنجليزية.
```

Trim any line describing something that already shipped in the version
currently live on Play — check the Console's release history first. Play allows
500 characters per language.

## 5. Store listing items this release depends on

Confirm these in the Console; both URLs are live and were checked on 8 November:

| Console field | Value |
|---|---|
| Privacy policy | `https://students-alahliyaa.com/privacy/` |
| Data safety → account deletion | `https://students-alahliyaa.com/support/` |

The support page explains deletion in English and Arabic and links to the
in-app flow at `/account/deletion`. Play wants a URL a signed-out person can
read, which is why it is the support page and not the in-app route.

Store graphics already exist in the repo root: `Feker-Play-Store-Icon-512.png`,
`Feker-Play-Store-Feature-Graphic-1024x500.png`, and `play-store-screenshots/`.

## 6. Do not

- **Do not generate a new keystore.** The upload key is
  `client/android/alahliyya-upload.jks` with `client/android/keystore.properties`.
  Both are gitignored and must stay out of the repository and out of any log. A
  different key cannot update an existing Play listing — recovering from that
  needs a key reset request to Google.
- **Do not change `applicationId`.** It is `com.alahliyya.lms`; changing it
  creates a new app rather than an update.
- **Do not commit the `.aab` or `.apk`.**
- **Do not publish a debug build.**

## 7. If something fails

- *Gradle cannot find the SDK* → `client/android/local.properties` holds
  `sdk.dir`; it is machine-specific and gitignored.
- *Gradle refuses to run on this Java* → it needs JDK 21. JDK 24 will not work.
- *Upload rejected as unsigned* → `keystore.properties` was missing at build
  time; the build silently produces an unsigned artifact so a clean checkout is
  never blocked. Restore it and rebuild.
- *Videos still fail on the phone* → that is a server matter, not the app.
  `server/src/scripts/repair-video-index.js` on the production server scans
  stored videos and reports any whose MP4 index sits after the media.
