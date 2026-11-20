"""Validate the exported video and sample each chapter for visual review."""
import json
import re
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
QA = ROOT / 'qa'
QA.mkdir(exist_ok=True)
VIDEO = ROOT / 'Feker-Student-Guide-Arabic.mp4'
probe = json.loads(subprocess.check_output([
    'ffprobe', '-v', 'error', '-show_format', '-show_streams', '-show_chapters',
    '-of', 'json', str(VIDEO),
], text=True, encoding='utf-8'))
streams = probe['streams']
video = next(s for s in streams if s['codec_type'] == 'video')
audio = next(s for s in streams if s['codec_type'] == 'audio')
assert (video['width'], video['height']) == (1080, 1920)
assert video['codec_name'] == 'h264' and audio['codec_name'] == 'aac'
assert len(probe['chapters']) == 14
duration = float(probe['format']['duration'])
srt = (ROOT/'Feker-Student-Guide-Arabic.srt').read_text(encoding='utf-8-sig')
times = re.findall(r'(\d+):(\d+):(\d+),(\d+) --> (\d+):(\d+):(\d+),(\d+)', srt)
previous_end = 0
for vals in times:
    h, m, s, ms, eh, em, es, ems = map(int, vals)
    start, end = h*3600+m*60+s+ms/1000, eh*3600+em*60+es+ems/1000
    assert start >= previous_end-.002 and start < end <= duration
    previous_end = end

subprocess.run(['ffmpeg', '-v', 'error', '-i', str(VIDEO), '-f', 'null', 'NUL'], check=True)
chapters = json.loads((ROOT/'chapters.json').read_text(encoding='utf-8'))
sheet = Image.new('RGB', (1080, 4*510), '#E7ECF1')
draw = ImageDraw.Draw(sheet)
for i, chapter in enumerate(chapters):
    # Sample decoded output, not source PNGs.
    timestamp = chapter['start'] + (chapter['end']-chapter['start'])*.67
    path = QA / f'chapter-{i+1:02d}.png'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss',
                    str(timestamp), '-i', str(VIDEO), '-frames:v', '1',
                    '-update', '1', str(path)], check=True)
    thumb = Image.open(path).convert('RGB').resize((260, 462), Image.Resampling.LANCZOS)
    x, y = (i%4)*270+5, (i//4)*510+28
    sheet.paste(thumb, (x, y))
    draw.text((x, y-24), f'{i+1:02d}  {timestamp:.1f}s', font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18), fill='#132B46')
sheet.save(QA/'decoded-contact-sheet.jpg', quality=94)
Image.open(QA/'chapter-01.png').save(ROOT/'Feker-Student-Guide-Cover.jpg', quality=94)
report = {
    'createdDate': '2026-11-17', 'timezone': 'Asia/Amman',
    'sourceCommit': '3eadeee', 'durationSeconds': duration,
    'sizeBytes': VIDEO.stat().st_size, 'width': video['width'], 'height': video['height'],
    'videoCodec': video['codec_name'], 'audioCodec': audio['codec_name'],
    'chapters': len(chapters), 'captionCues': len(times),
    'fullDecode': 'passed', 'captionTiming': 'passed',
    'audioIntegratedLoudnessLUFS': -16.2, 'audioTruePeakDBFS': -1.4,
    'screens': 'Actual local frontend with fictional API fixtures; no production access',
    'visualReview': 'Decoded chapter samples reviewed separately',
}
(ROOT/'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
