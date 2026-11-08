# Publishing Feker to the App Store

Written for whoever has the Mac. Everything needed is in the repository —
there is no separate iOS artifact to fetch, because an iOS build can only be
made on macOS and nothing in this repo has ever produced one.

| | |
|---|---|
| Bundle identifier | `com.alahliyya.lms` (the same id as the Android app) |
| Display name | **Feker** |
| Development team | `JAXM7Y97H8`, automatic signing (already set in the project) |
| Dependencies | Swift Package Manager — **no CocoaPods, no `pod install`** |
| Deployment target | iOS 15.0 |
| Current version in git | `MARKETING_VERSION = 1.0.1`, `CURRENT_PROJECT_VERSION = 9` |
| API the build talks to | `https://students-alahliyaa.com/api/v1`, from `client/.env.ios` |

## 1. Build the web bundle

```bash
git clone https://github.com/atoofeh/Ahliyya-students-.git   # or: git pull
cd Ahliyya-students-/client
npm install
npm run build:ios      # vite build --mode ios && cap sync ios
npm run ios:open       # opens ios/App in Xcode
```

`npm run build:ios` is the only correct command. A plain `npm run build` bakes
in a different API base and produces an app that cannot reach the server — this
exact mistake has been made twice on the Android side. Confirm before archiving:

```bash
grep -l "https://students-alahliyaa.com/api/v1" ios/App/App/public/assets/*.js
```

That must print a filename. If it prints nothing, the wrong build is staged.

## 2. Set the version numbers

This is the one decision that cannot be made from Windows, because it depends
on what App Store Connect already shows.

In Xcode, select the **App** target → *General*:

- **Version** (`MARKETING_VERSION`) — currently `1.0.1`. The recommendation is
  `1.0.6`, so iOS and Android carry the same number for the same code.
- **Build** (`CURRENT_PROJECT_VERSION`) — currently `9`. It must be **higher
  than any build already uploaded** for that version. If builds 1–9 have been
  uploaded before, use `10`.

App Store Connect rejects a build whose number it has already seen, and the
number can never go down.

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
3. **Full screen.** Tap the expand control beside the player: the video must
   cover the whole screen with the page gone behind it, and the moving
   watermark must still appear over it. Then **pinch outwards on the video** —
   iOS tries to open its own fullscreen player, and the app must bounce
   straight back into its own expanded view rather than showing a bare video.
   If a bare, unwatermarked video appears and stays, stop and report it: that
   guard is the reason this build exists and it has never been run on a phone.
4. **Screen recording.** Start one from Control Centre while a video plays: the
   app must cover itself and the video must pause.
5. **Past questions** open in the in-app reader, with no share or save control.
6. **Account deletion** — the link is in the student sidebar; the page must
   load and accept a request. Apple requires this path to exist.
7. **Arabic.** Switch language in the header and confirm the layout flips.

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
