# Feker for Windows

Written for whoever builds and distributes the desktop client.

| | |
|---|---|
| Source | `desktop/` — a third npm package, installed and built from its own directory |
| Output | `desktop/release/Feker-Setup-1.0.0.exe` (~116 MB, gitignored) |
| Installs | per user, no administrator rights |
| Runtime | Electron 45, loading `https://students-alahliyaa.com` |
| Platform reported | `windows` — one device, same as a browser |

## What it is, and what it is not

It is a hardened window onto the same site students already use. It is **not**
a second copy of the application: there is no bundled web build, no separate
API base, no offline mode. The page, the login and the API are the website's.

That is deliberate. Every fix to the website reaches every student the next
time they open the app, with no new installer to send — and the refresh-token
cookie works exactly as it does in a browser, because the origin is the same
one the cookie was issued for. An LMS needs the network for video and sign-in
regardless, so bundling a copy would buy nothing and cost a redistribution
every time anything changed.

## Why it exists

One reason, and it is worth being clear about it: **Windows excludes the
window from screen capture.** `setContentProtection(true)` maps to
`SetWindowDisplayAffinity` with `WDA_EXCLUDEFROMCAPTURE` on Windows 10 2004
and later, so a screen recorder or a screenshot gets an empty rectangle while
the student sees the lesson normally. It is the same protection the Android
app gets from `FLAG_SECURE`, and it is the one thing no web page can ask for.

This was measured, not assumed. With the app on screen showing a lesson page,
a `CopyFromScreen` capture of the window's own rectangle was compared against
the same rectangle after the app was closed: **0 of 5400 sampled points
differed**. The window is not dimmed or blacked in the capture — it is absent.

Everything else the app does is a smaller matter: no developer tools, no
view-source, no address bar, no second window, nowhere else to navigate, no
permission prompts, and a device id taken from the machine instead of browser
storage so clearing site data does not lock a student out of their account.

## What it does not stop

- **A camera pointed at the screen.** Nothing stops this, which is why the
  moving watermark stays.
- **The website.** A student who wants to record can open the same site in
  Chrome, where none of this applies. The app is for people who want a
  protected desktop device, not a way to force everyone onto one. Requiring
  the app for video would be a policy change on the server, not a setting here.
- **A virtual machine or a capture card** sitting below Windows.

## Build

```bash
cd desktop
npm install
npm run dist        # -> release/Feker-Setup-1.0.0.exe
npm start           # run it unpackaged, for development
```

`npm start` and the packaged app both fail silently inside a VS Code terminal,
because VS Code sets `ELECTRON_RUN_AS_NODE=1`, which makes any Electron binary
behave as plain Node: the main script then throws on `app.requestSingleInstanceLock`
and exits with no window. It is an artifact of that terminal and nothing to do
with the app. Launch from Explorer, from `cmd`, or clear the variable first.

## Code signing — read before sending it to students

The installer is **unsigned**. Windows SmartScreen will show *"Windows
protected your PC"* on first run, and a student has to click *More info →
Run anyway*. Nothing is wrong with the file; Microsoft simply has no reputation
record for it.

Three ways forward:

1. **Send it as is**, with the extra step explained in the message below. Free,
   and the warning fades as more people install it.
2. **An OV certificate** (roughly $200–400 a year, now requiring a hardware
   token or a cloud signing service). The warning softens but does not vanish
   until reputation accumulates.
3. **An EV certificate** (dearer, hardware token). SmartScreen trusts it
   immediately.

If a certificate is bought, add it to `desktop/package.json` under `build.win`
(`certificateFile` / `certificatePassword`, read from the environment — never
committed) and rebuild. **Keep any certificate and its password out of the
repository**, exactly like the Android keystore.

## Dependencies on the rest of the platform

The app runs against production today with no deployment at all — it behaves
as a protected browser. Two improvements need a deploy to switch on:

| Needs | For |
|---|---|
| **Website deploy** (`client/`) | `native.js` and `fingerprint.js` read the preload, so the app reports platform `windows` and uses the machine-derived device id instead of a random one in browser storage |
| **API deploy** (`server/`) | `windows` is accepted as a platform name, so the Security Center names the binding instead of filing it under `other` |

Neither is load-bearing. Without them the app still signs in, still blocks
capture, and still works — the device id is just per-profile rather than
per-machine, which is the ordinary web behaviour.

## Device identity

The id is `sha256("feker.desktop.device.v1:" + MachineGuid)`. The raw GUID
never leaves the process and is never sent anywhere. `MachineGuid` is written
once when Windows is installed and survives removing and reinstalling the app,
so a reinstall does not require an administrator device reset — the same
property the phones get from their platform ids.

A Windows that refuses the GUID falls back to a random id stored beside the
app's data. That one does not survive a reinstall, which is no worse than the
browser.

**A desktop binding occupies the student's one device slot.** It is not in
`NATIVE_PLATFORMS` or `isNativeAppPlatform`, so it does not inherit the
multi-device exception the phones have. A student who binds their laptop
cannot then also use their phone without an administrator reset — which is the
point of the app.

## Test on a real machine before sending it out

1. **Install** without administrator rights; a desktop shortcut appears.
2. **Sign in** as a student.
3. **Play a lesson video**, then start a screen recording (Xbox Game Bar,
   `Win+G`, or OBS). The recording must show nothing where the window is. This
   is the whole point — if the window appears, stop and report it.
4. **Press `F12`, `Ctrl+Shift+I`, `Ctrl+U`, `Ctrl+P`.** Nothing should happen.
5. **Right-click** the page: no context menu with inspect or save.
6. **A link to another site** must open in the normal browser, not in the app.
7. **Close and reopen**: still signed in (the cookie persists).
8. **Reinstall the app** and sign in again: it must *not* say the device is
   unauthorised. If it does, the machine fell back to the stored id.
9. **Pull the network cable**: the offline page appears, with a working
   *Try again*.
10. **Arabic**: switch language in the header; the layout flips.

## Message to send with the installer

> **Feker for Windows**
>
> This is the Feker app for a laptop or desktop. Install it if you want your
> computer to be your registered device instead of your phone — you get one
> device, so choosing this one means your phone will no longer sign in.
>
> When you open the installer Windows may say "Windows protected your PC".
> Click **More info**, then **Run anyway** — this happens with any new program
> that Microsoft has not seen before.
>
> Lessons will not appear in a screen recording or a screenshot taken on your
> computer. That is intended.
>
> ---
>
> **فكر لويندوز**
>
> هذا تطبيق فكر للحاسوب المحمول أو المكتبي. ثبّته إذا أردت أن يكون حاسوبك هو
> جهازك المسجّل بدل الهاتف — لديك جهاز واحد فقط، فاختيار الحاسوب يعني أن هاتفك
> لن يستطيع تسجيل الدخول بعد ذلك.
>
> قد تظهر رسالة من ويندوز تقول "Windows protected your PC". اضغط **More info**
> ثم **Run anyway** — يحدث هذا مع أي برنامج جديد لم تتعرّف عليه مايكروسوفت بعد.
>
> لن تظهر الدروس في تسجيل الشاشة أو في لقطة الشاشة على حاسوبك، وهذا مقصود.
