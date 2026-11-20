"""Generate the Arabic student guide voiceover and timing data.

Only fictional tutorial text is sent to the speech service.
Dependencies are isolated under this artifact directory.
"""
import asyncio
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'python-deps'))
import edge_tts


async def main():
    scenes = json.loads((ROOT / 'storyboard.json').read_text(encoding='utf-8-sig'))
    output = ROOT / 'audio'
    output.mkdir(exist_ok=True)
    for scene in scenes:
        path = output / (scene['id'] + '.mp3')
        timing_path = path.with_suffix('.json')
        if path.exists() and timing_path.exists():
            print('Already narrated:', scene['id'], flush=True)
            continue
        last_error = None
        for attempt in range(3):
            try:
                voice = edge_tts.Communicate(
                    scene['narration'], 'ar-JO-SanaNeural', rate='-3%',
                    boundary='WordBoundary',
                )
                boundaries = []
                with path.open('wb') as audio:
                    async for chunk in voice.stream():
                        if chunk['type'] == 'audio':
                            audio.write(chunk['data'])
                        elif chunk['type'] in ('WordBoundary', 'SentenceBoundary'):
                            boundaries.append({k: chunk[k] for k in ('type', 'offset', 'duration', 'text')})
                duration = float(subprocess.check_output([
                    'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                    '-of', 'default=nw=1:nk=1', str(path),
                ], text=True).strip())
                timing_path.write_text(json.dumps({
                    'voice': 'ar-JO-SanaNeural', 'duration': duration,
                    'boundaries': boundaries,
                }, ensure_ascii=False, indent=2), encoding='utf-8')
                print(f"Narrated {scene['id']}: {duration:.2f}s, {len(boundaries)} word boundaries", flush=True)
                break
            except Exception as exc:
                last_error = exc
                if attempt == 2:
                    raise
                await asyncio.sleep(2)
        if last_error and not timing_path.exists():
            raise last_error


if __name__ == '__main__':
    asyncio.run(main())
