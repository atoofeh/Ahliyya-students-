# Publishing Feker to the App Store

Written for whoever has the Mac. Everything needed is in the repository —
there is no separate iOS artifact to fetch, because an iOS build can only be
made on macOS.

**Build 11 replaces build 10.** Build 10 shipped with WebKit's own media
controls over every lesson video: a full-screen arrow and a
picture-in-picture button, either of which lifts the video out of the player
and away from its watermark. The attributes meant to remove them are Chromium
features that Safari ignores, so the player now draws its own controls on
WebKit and those two buttons do not exist. The app carries its own copy of the
web bundle, so this reaches an installed app only through a new build.

| | |
|---|---|
| Bundle identifier | `com.alahliyya.lms` (the same id as the Android app) |
| Display name | **Feker** |
| Development team | `JAXM7Y97H8`, automatic signing (already set in the project) |
| Dependencies | Swift Package Manager — **no CocoaPods, no `pod install`** |
| Deployment target | iOS 15.0 |
| Version in git | `MARKETING_VERSION = 1.0.7`, `CURRENT_PROJECT_VERSION = 11` |
| API the build talks to | `https://students-alahliyaa.com/api/v1`, from `client/.env.ios` |

## 1. Build the web bundle

```bash
git clone https://github.com/atoofeh/Ahliyya-students-.git   # or: git pull
cd Ahliyya-students-/client
npm install
npm run build:ios      # vite build --mode ios && cap sync ios
npm run ios:open       # opens ios/App in Xcode
```

`npm run build:ios` is not optional. `ios/App/App/public` — the web bundle the
app actually runs — is a build artifact and is deliberately not in git, so a
fresh clone has no copy of it at all and an older checkout has a stale one.
Everything in this release lives in that bundle, not in the Swift code.

`npm run build:ios` is the only correct command. A plain `npm run build` bakes
in a different API base and produces an app that cannot reach the server — this
exact mistake has been made twice on the Android side. Confirm before archiving:

```bash
grep -l "https://students-alahliyaa.com/api/v1" ios/App/App/public/assets/*.js
```

That must print a filename. If it prints nothing, the wrong build is staged.

## 2. Version numbers

**Already set**: version `1.0.7`, build `11`. The version is unchanged because
1.0.7 has not been released to the public; only the build number moves, which
is what App Store Connect requires for a second upload of the same version.

If the Console still rejects it, a build above 11 exists already: in Xcode
select the **App** target → *General* and raise **Build**
(`CURRENT_PROJECT_VERSION`) above the highest number shown. The number can
never go down. Once 1.0.7 *is* public, the next upload needs a new
`MARKETING_VERSION` as well, not just a new build.

## 3. Signing

Signing is automatic and the team is already in the project. In Xcode, add the
Apple ID that belongs to team `JAXM7Y97H8` under *Settings → Accounts*, then
open *Signing & Capabilities* and confirm there is no red text. Nothing else
needs configuring.

**Do not add the Push Notifications capability.** Push is deliberately Android
only: `client/src/api/pushNotifications.js` refuses to register on iOS, because
this server speaks FCM and iOS would hand it an APNs token it cannot use. iOS
uses local notifications instead, and that path works. Adding the capability
would create an entitlement the app never uses.

## 4. Test on a real device before archiving

Run the app on a connected iPhone (not just the simulator — the simulator will
not show you the screen-recording behaviour) and check:

1. **Sign in** as a student account.
2. **Play a course video.** It must start within a few seconds.
3. **The player's own controls.** The video must carry the app's control bar —
   play, 10 seconds back and forward, a scrubber, mute — and **nothing else**.
   If a full-screen arrow or a picture-in-picture button appears in a corner
   of the video, those are WebKit's own controls and the app is serving an old
   bundle: section 1 was skipped. Both are ways out of the player, and
   whatever leaves the player leaves the watermark behind.
4. **Full screen.** Tap the expand control at the top corner: the video must
   cover the whole screen with the page gone behind it, and the moving
   watermark must still appear over it. Then **pinch outwards on the video** —
   iOS tries to open its own fullscreen player even with no button on screen,
   and the app must bounce straight back into its own expanded view rather
   than showing a bare video. If a bare, unwatermarked video appears and
   stays, stop and report it: that guard has never been run on a phone.
5. **Screen recording.** Start one from Control Centre while a video plays: the
   app must cover itself and the video must pause.
6. **Past questions** open in the in-app reader, with no share or save control.
7. **Account deletion** — the link is in the student sidebar; the page must
   load and accept a request. Apple requires this path to exist.
8. **Arabic.** Switch language in the header and confirm the layout flips.

## 5. Archive and upload

In Xcode: set the destination to *Any iOS Device (arm64)*, then
*Product → Archive*, then *Distribute App → App Store Connect → Upload*.

## 6. App Store Connect

| Field | Value |
|---|---|
| Privacy policy URL | `https://students-alahliyaa.com/privacy/` |
| Support URL | `https://students-alahliyaa.com/support/` |
| Account deletion | the support page explains it; the in-app route is `/account/deletion` |
| Export compliance | the app uses HTTPS only — standard encryption exemption |

Screenshots in `play-store-screenshots/` were sized for Play. Apple wants its
own sizes (6.9" and 6.5" iPhone at minimum), so retake them on the device or in
the simulator.

## 7. The thing most likely to get this rejected

**A reviewer signing in may be refused by the one-device rule.**

A student account is bound to a single device. Native apps are supposed to be
exempt — `DeviceService.isNativeAppPlatform` carves iOS and Android out — but
**that change is committed and not deployed**: production still runs the auth
code from before `45443fc`. An Apple reviewer signing in on their own iPhone
with a demo account that is already bound to someone else's phone will be told
their device is not authorised, and will reject the app as broken.

Resolve this *before* submitting, one of two ways:

- **Deploy the auth change** to production (`Device.js`, `Session.js`,
  `auth.service.js`, `device.service.js`). This is the real fix, and it loosens
  a security rule, so it is the owner's decision.
- **Or** create a demo account specifically for review, leave it bound to
  nothing, and give its credentials in *App Review Information*. Reset its
  device from the Security Center if review needs a second attempt.

Give the reviewer a working student account with at least one enrolled course —
an account that can see no content reads as a broken app.

## 8. Do not

- **Do not change the bundle identifier.** `com.alahliyya.lms` is the record
  Apple and Google both key on.
- **Do not commit anything from the Mac that is not source.** No provisioning
  profiles, no certificates, no `.p12`, no App Store Connect API key.
- **Do not archive a simulator build**, and do not archive with the destination
  left on a specific device.
- **Do not add the Push Notifications capability** — see section 3.

## 9. If something fails

- *Xcode cannot resolve packages* → *File → Packages → Reset Package Caches*.
  This project uses SPM; there is no Podfile and `pod install` will fail
  because there is nothing for it to install.
- *"Signing requires a development team"* → the Apple ID in Xcode is not a
  member of `JAXM7Y97H8`.
- *The app loads but every request fails* → the web bundle was built with
  `npm run build` instead of `npm run build:ios`. Rebuild and re-sync.
- *Videos do not play at all* → that is the server, not the app.
  `server/src/scripts/repair-video-index.js` on production scans for videos
  whose MP4 index sits after the media.
