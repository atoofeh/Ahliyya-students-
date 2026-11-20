# Session playback reset investigation

Investigated November 18, 2026 (Asia/Amman). Read-only application investigation; no application source changes, deployment, service restart, student-account access, or media/key changes.

## Revised assessment after student-report clarification

The latest user clarification identifies the affected content as "bio" and reports resets "every 4 minutes as well". This directly corroborates the player's 240,000-ms renewal timer and makes its source-replacement/resume defect the high-confidence cause of the four-minute Bio resets. No physical-device trace or installed-build verification has been obtained, so this is timing corroboration rather than a captured end-to-end incident.

Earlier clarification described irregular timing in the Feker iPhone/iPad app and only the video area going black. Association with calls, Control Centre, locking, or switching apps remains unknown. Additional irregular incidents may have another trigger; the four-minute finding should not be generalized to every blackout without evidence. The timer measures elapsed time since the stream source was assigned, not the video's displayed timestamp or time spent actively watching; pauses, seeks, suspension, and request completion can change that relationship.

The code's only explicit recurring video-source replacement is the four-minute renewal. The player lacks media error/stall/reload telemetry. An exact lesson identifier, incident timestamp, installed app build, and device-side media/network trace would establish the trigger for any remaining irregular incidents.

The native capture cover in `client/ios/App/App/LmsNativePlugin.swift:123-195` covers the entire app window with a message and does not seek or reload video. This is a weaker match for video-only blackness followed by rewind.

Capacitor's native recovery handler (`client/node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift:158-162`) resets its bridge and reloads the entire WebView if its content process terminates. The [pinned upstream 8.5.0 source](https://github.com/ionic-team/capacitor/blob/8.5.0/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift) confirms that behavior. No device evidence establishes a termination here, and the reported video-only symptom makes this less likely. A whole-page reload should also retrieve the latest successful server progress (`server/src/modules/courses/courses.service.js:152-167`); returning fully to zero would need additional progress loss or failed restoration.

## Primary finding: replacing the stream URL resets playback

`client/src/components/VideoPlayer.jsx:179-199` renews the signed stream URL every 240,000 ms. The playing branch calls `setSrc(fresh)` at line 194. The video element directly uses this state as its `src` at line 461, so this changes the active media resource immediately. Contrary to the comment, it does not defer until a seek. This path preserves neither the live position nor the playing state.

The `loadedmetadata` handler at lines 469-474 applies the original `startAt` again. `client/src/pages/student/CoursePlayer.jsx:264-265` obtains that value from the curriculum progress loaded when the course opened and supplies a no-op `onProgress`. New lessons therefore return to zero; resumed lessons can return to an old saved position.

The source replacement invokes media loading, which resets playback position according to the [HTML media loading algorithm](https://html.spec.whatwg.org/multipage/media.html#media-element-load-algorithm).

The server issues a 300-second stream token (`server/src/modules/videos/videos.service.js:350-353`) and rejects expired tokens at the next stream request (`server/src/core/signedUrl.js:40`). Removing renewal alone would leave an expiry problem.

## Deployed-code evidence

Public HTTPS GETs identified the current website entry asset `index-5A2FShr0.js`, course asset `CoursePlayer-DBoSvOgU.js`, and shared player asset [DownloadButton-B07sXY6p.js](https://students-alahliyaa.com/assets/DownloadButton-B07sXY6p.js).

The player asset is 14,055 bytes, SHA-256 `2681d5ece0968de0bc7f75cc874276f1438bceae758a31d08f49e1203bb303b1`. It contains the same renewal behavior:

```js
let{currentTime:t,paused:n}=e,r=await J();
n?(e.src=r,e.currentTime=t):T(r)
// interval: 24e4
```

`T` updates the state used by the video `src`. The live metadata handler also reapplies `startAt`, and the live CoursePlayer has the same no-op progress callback.

The local embedded iOS asset `client/ios/App/App/public/assets/DownloadButton-BPmtViV-.js` contains the same behavior, SHA-256 `395df4e9219ccfb02d4743978d0fdbaae9ad5b4a682acd0c4ba137847edf1e4d`. This establishes what the local iOS payload contains, not what is installed on any affected student's device.

## Reproduction

`reproduce.mjs` mounts the actual, unchanged React VideoPlayer through local Vite. Every API request is mocked, and a generated synthetic video is served. It captures and invokes the actual 240,000-ms interval callback while playback is active, without advancing or mocking media time.

Chromium reproduction confirmed:

| Initial saved position | Position before renewal | Position after renewal | State after renewal |
| --- | --- | --- | --- |
| 0 seconds | About 12.1 seconds | 0 seconds | Paused |
| 7 seconds | About 12.1 seconds | 7 seconds | Paused |

Events include `emptied`, `loadstart`, then `loadedmetadata`. No page errors occurred. Raw observations are in `results.json`. A local WebKit playback attempt is recorded separately there; there has been no physical iPhone/iPad reproduction.

A follow-up using `node reproduce.mjs --media-reload` invokes the browser's actual video `load()` without renewing the token, using the unchanged component and synthetic media. Chromium again loses the active position (about 12.1 seconds), restoring zero or the original seven-second starting point. This confirms the stale restoration is broader than token renewal. It does not simulate or prove the specific iOS event that causes an unexpected reload. Results are in `media-reload-results.json`.

## Secondary finding: suffix byte ranges

Independent execution of the actual `VideoService.stream` with synthetic encrypted data and stubbed models confirmed:

| Request for a 1,000-byte fixture | Result |
| --- | --- |
| `bytes=501-713` | Correct 213 decrypted bytes |
| `bytes=100-` | Correct final 900 bytes |
| `bytes=-100` | Incorrect first 101 bytes rather than final 100 bytes |
| Expired stream token | `401 STREAM_TOKEN_EXPIRED` |

The parser at `server/src/modules/videos/videos.service.js:381-384` treats a suffix length as an end offset. This is a real server defect, but no captured request from an affected device links it to the reported incident. Codec/container compatibility and native capture/fullscreen protection were inspected; the four-minute source swap is the closer match for a video that plays and then returns to its beginning.

## Confidence and corrective direction

The renewal defect is confirmed in source, current public website assets, local iOS assets, and a local Chromium reproduction. The user's subsequent report of four-minute Bio resets strongly corroborates this cause. It is shared player behavior rather than an established Apple-only engine defect. A physical-device trace showing renewal followed by reset would provide end-to-end confirmation; any additional irregular incidents remain unassigned.

Correct renewal must preserve the live playback position and playback state through a resource change, and apply the original saved resume position only on initial load. Renewal failures and media errors also need deliberate handling. No fix was implemented as part of this diagnosis.
