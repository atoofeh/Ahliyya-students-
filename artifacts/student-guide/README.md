# Feker Arabic student walkthrough

The finished video is **Feker-Student-Guide-Arabic.mp4** (portrait 1080 × 1920,
approximately 4 minutes 30 seconds). Arabic narration and visible Arabic captions
cover sign-in, conditional first-time setup, enrollment codes, lessons, quizzes,
assignments, moderated questions, practice, results, and support.

**Feker-Student-Guide-Arabic.srt** is the separate caption file. The MP4 already
contains visible captions and 14 chapter markers. **chapters.json** contains the
chapter times. **Feker-Student-Guide-Cover.jpg** is an optional poster image.

The screens are captured from the repository frontend using local fictional API
responses, not production accounts. All account information, codes, course
content, marks, and verification codes shown are demonstration data. No app code,
production service, account, media key, or release artifact was changed.

Created November 17, 2026 (Asia/Amman), based on frontend source at commit
`3eadeee`. The narration is synthesized in Arabic using the Sana voice. Sources
and timing data remain in this folder for revisions:

- `storyboard.json`: reviewed Arabic narration, captions, and screen mapping.
- `capture/capture.mjs`: isolated local demo capture; all external hosts blocked.
- `capture/filename-map.json`: numbered screenshots and convenient aliases.
- `capture/capture-metadata.json`: measured control positions for highlights.
- `narrate.py`: speech and word timing generation.
- `render.py`: frame composition, captions, chapter markers, and MP4 assembly.
- `verify.py` and `verification.json`: codec, timing, decode, and visual samples.

The scripts require Python with Pillow/NumPy and FFmpeg on PATH. Voice generation
uses `edge-tts`, isolated in `python-deps`; capture uses Playwright under `tools`
and an installed Chrome browser. These dependencies are separate from the app's
packages. Re-render with `python artifacts/student-guide/render.py` and verify
with `python artifacts/student-guide/verify.py`.
