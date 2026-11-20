"""Render a phone-friendly Arabic tutorial from actual local demo captures.

Pillow's RAQM handles Arabic shaping. Word timings come from narration, and
FFmpeg assembles H.264/AAC video with captions already visible in the frames.
"""
import argparse
import html
import json
import math
import re
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
W, H = 1080, 1920
SPEED = 1.08
LEAD, TAIL = 0.25, 0.45
FONT = 'C:/Windows/Fonts/tahoma.ttf'
BOLD = 'C:/Windows/Fonts/tahomabd.ttf'
CAPTURE = ROOT / 'capture'
OUT = ROOT / 'render'
OUT.mkdir(exist_ok=True)

SCREEN_ALIASES = {
    'login-empty.png': '01-login.png',
    'login-filled.png': '02-login-filled.png',
    'onboarding-email.png': '03-onboarding-email.png',
    'onboarding-code.png': '04-onboarding-code.png',
    'onboarding-password.png': '05-onboarding-password.png',
    'dashboard.png': '06-dashboard.png',
    'redeem.png': '07-redeem.png',
    'catalog.png': '08-catalog.png',
    'course.png': '09-course-video.png',
    'contents.png': '10-contents.png',
    'quiz.png': '12-quiz-runner.png',
    'assignment.png': '13-assignment.png',
    'qa.png': '14-qa.png',
    'past-papers.png': '15-past-papers.png',
    'grades.png': '17-grades.png',
    'help.png': '18-help.png',
}


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)


def measure(text, size=43, bold=False):
    return font(size, bold).getlength(text, direction='rtl')


def wrap(text, size, width):
    lines, line = [], ''
    for word in text.split():
        candidate = f'{line} {word}'.strip()
        if line and measure(candidate, size) > width:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines


def ar(draw, xy, text, size, fill='white', bold=False, anchor='ra'):
    draw.text(xy, text, font=font(size, bold), fill=fill, anchor=anchor,
              direction='rtl', language='ar', stroke_width=0)


def bg():
    yy, xx = np.mgrid[0:H, 0:W]
    blend = np.clip((xx / W * .28 + yy / H * .72), 0, 1)[..., None]
    a = np.array([11, 28, 51])
    b = np.array([24, 59, 88])
    img = Image.fromarray((a * (1 - blend) + b * blend).astype('uint8'), 'RGB').convert('RGBA')
    decor = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(decor)
    for box in [(-420, -460, 780, 740), (-320, -360, 680, 640), (680, 1300, 1500, 2120)]:
        d.ellipse(box, outline=(209, 176, 104, 23), width=2)
    return Image.alpha_composite(img, decor)


BACKGROUND = bg()


def find_screen(name):
    for candidate in [SCREEN_ALIASES.get(name, ''), name]:
        if candidate and (CAPTURE / candidate).exists():
            return CAPTURE / candidate
    raise FileNotFoundError(f'Missing capture {name}')


def selected_screen(scene, caption_index):
    if scene['id'].startswith('03-') and caption_index == 0:
        return find_screen('onboarding-email.png')
    if scene['id'].startswith('08-') and caption_index == 0:
        return find_screen('contents.png')
    variants = {
        ('09-quizzes', 0): '11-quiz-intro.png',
        ('09-quizzes', 2): '12c-quiz-confirm.png',
        ('09-quizzes', 3): '12b-quiz-submit.png',
        ('12-practice', 2): '16b-practice-selected.png',
        ('12-practice', 3): '16c-practice-verdict.png',
        ('13-results', 1): '17b-grades-score.png',
        ('14-help', 0): '19-navigation.png',
        ('14-help', 2): '20-support.png',
    }
    variant = variants.get((scene['id'], caption_index))
    if variant and (CAPTURE / variant).exists():
        return CAPTURE / variant
    return find_screen(scene['screen'])


def add_focus(image, screen_path, scene_id, caption_index, rect):
    """Point to real controls using their measured viewport coordinates."""
    metadata_path = CAPTURE / 'capture-metadata.json'
    if not metadata_path.exists():
        return image
    targets = {
        ('02-sign-in', 0): ['تسجيل الدخول'],
        ('02-sign-in', 1): ['أبقِ الدخول مفتوحاً'],
        ('03-verify-email', 0): ['إرسال رمز التحقق'],
        ('03-verify-email', 1): ['تأكيد البريد'],
        ('03-verify-email', 2): ['إعادة إرسال الرمز'],
        ('04-password', 2): ['حفظ كلمة المرور والمتابعة'],
        ('06-redeem', 0): ['XXXX-XXXX-XX'],
        ('06-redeem', 1): ['التسجيل'],
        ('07-catalog', 0): ['ابحث عن دورة…'],
        ('08-lessons', 0): ['ابدأ هنا: قراءة البيانات\n20 دقيقة'],
        ('08-lessons', 3): ['احفظ هذا الدرس', 'وضع علامة مكتمل'],
        ('09-quizzes', 0): ['ابدأ'],
        ('09-quizzes', 2): ['تسليم الآن'],
        ('09-quizzes', 3): ['تسليم الاختبار'],
        ('10-assignments', 1): ['نص الإجابة', 'تسليم الواجب'],
        ('11-questions', 1): ['إرسال السؤال'],
        ('12-practice', 0): ['فتح'],
        ('12-practice', 2): ['تحقّق'],
    }.get((scene_id, caption_index), [])
    if not targets:
        return image
    metadata = json.loads(metadata_path.read_text(encoding='utf-8-sig'))
    entries = metadata['screens'].get(screen_path.stem, [])
    overlay = Image.new('RGBA', image.size)
    d = ImageDraw.Draw(overlay)
    sx, sy = (rect[2]-rect[0])/430, (rect[3]-rect[1])/700
    for target in targets:
        match = next((e for e in entries if e['text'] == target), None)
        if not match:
            continue
        b = match['box']
        if b['y'] < 0 or b['y']+b['height'] > 702:
            continue
        x0 = rect[0]+b['x']*sx-7
        y0 = rect[1]+b['y']*sy-7
        x1 = x0+b['width']*sx+14
        y1 = y0+b['height']*sy+14
        d.rounded_rectangle((x0-4, y0-4, x1+4, y1+4), radius=15,
                            outline=(11, 28, 51, 150), width=6)
        d.rounded_rectangle((x0, y0, x1, y1), radius=12,
                            outline=(222, 177, 72, 255), width=5)
    return Image.alpha_composite(image, overlay)


def render_frame(scene, index, total, caption, caption_index, path):
    img = BACKGROUND.copy()
    d = ImageDraw.Draw(img)
    gap, left, span = 8, 65, 950
    bw = (span - (total - 1) * gap) / total
    for i in range(total):
        x = left + i * (bw + gap)
        color = '#D4B674' if i <= index else '#3B526A'
        d.rounded_rectangle((x, 30, x + bw, 36), radius=3, fill=color)
    ar(d, (1008, 61), scene['kicker'], 28, '#D4B674')
    title_size = 55
    while measure(scene['title'], title_size, True) > 860:
        title_size -= 1
    ar(d, (1008, 103), scene['title'], title_size, bold=True)
    d.text((72, 68), f'{index+1:02d} / {total}', font=font(25), fill='#C1CDD9')
    ar(d, (1008, 177), 'شاشات توضيحية • بيانات تجريبية', 24, '#ADBBCB')

    # Actual frontend viewport; its aspect is preserved within a soft frame.
    rect = (90, 215, 990, 1680)
    shadow = Image.new('RGBA', (W, H))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((76, 218, 1004, 1700), radius=43, fill=(0, 0, 0, 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(20))
    img = Image.alpha_composite(img, shadow)
    screen_path = selected_screen(scene, caption_index)
    screen = Image.open(screen_path).convert('RGB')
    target = (rect[2] - rect[0], rect[3] - rect[1])
    ratio = min(target[0] / screen.width, target[1] / screen.height)
    fitted = screen.resize((round(screen.width * ratio), round(screen.height * ratio)), Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', target, '#F7F9FC')
    canvas.paste(fitted, ((target[0] - fitted.width) // 2, 0))
    mask = Image.new('L', target)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, target[0]-1, target[1]-1), radius=30, fill=255)
    img.paste(canvas, rect[:2], mask)
    img = add_focus(img, screen_path, scene['id'], caption_index, rect)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle(rect, radius=30, outline='#65809A', width=2)

    # Captions are part of the video so they stay visible in messaging apps.
    panel = (55, 1711, 1025, 1866)
    d.rounded_rectangle(panel, radius=24, fill='#0A2039', outline='#40576B', width=1)
    size = 43
    lines = wrap(caption, size, 900)
    while len(lines) > 2 and size > 35:
        size -= 1
        lines = wrap(caption, size, 900)
    line_h = round(size * 1.48)
    y = 1711 + (155 - len(lines) * line_h) // 2 - 2
    for line in lines:
        ar(d, (540, y), line, size, '#FFFFFF', anchor='ma')
        y += line_h
    ar(d, (1010, 1880), 'فكر • دليل الطالب', 23, '#C3CED9')
    ar(d, (70, 1880), 'تعلّم بثقة، خطوة بخطوة', 22, '#D4B674', anchor='la')
    img.convert('RGB').save(path)


def normalized(text):
    return re.sub(r'[\W_\u064B-\u065F\u0670]+', '', html.unescape(text), flags=re.UNICODE)


def cues_for(scene, timing):
    events = timing['boundaries']
    captions = scene['captions']
    # Match text lengths, ignoring punctuation/diacritics, to word timestamps.
    event_ends, cumulative = [], 0
    for e in events:
        cumulative += len(normalized(e['text']))
        event_ends.append(cumulative)
    expected = len(normalized(scene['narration']))
    if cumulative != expected:
        raise ValueError(f"Caption alignment differs in {scene['id']}: {cumulative} != {expected}")
    starts, used = [], 0
    for cap in captions:
        word_index = next((i for i, end in enumerate(event_ends) if end > used), len(events)-1)
        starts.append(max(0, events[word_index]['offset'] / 1e7 / SPEED + LEAD - .07))
        used += len(normalized(cap))
    duration = timing['duration'] / SPEED + LEAD + TAIL
    cues = []
    for i, caption in enumerate(captions):
        start = 0 if i == 0 else starts[i]
        end = starts[i+1] if i+1 < len(starts) else duration
        cues.append({'start': start, 'end': end, 'text': caption})
    return cues, duration


def srt_time(t):
    ms = round(t*1000)
    return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d},{ms%1000:03d}'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--scene', type=int)
    args = parser.parse_args()
    scenes = json.loads((ROOT / 'storyboard.json').read_text(encoding='utf-8-sig'))
    all_cues, chapters, elapsed, videos = [], [], 0, []
    for index, scene in enumerate(scenes):
        if args.scene and args.scene != index + 1:
            continue
        timing = json.loads((ROOT / 'audio' / (scene['id'] + '.json')).read_text(encoding='utf-8'))
        cues, duration = cues_for(scene, timing)
        duration = math.ceil(duration * 30) / 30
        files = []
        for j, cue in enumerate(cues):
            path = OUT / f"{scene['id']}-{j:02d}.png"
            render_frame(scene, index, len(scenes), cue['text'], j, path)
            files.append(path)
            all_cues.append({**cue, 'start': cue['start']+elapsed, 'end': cue['end']+elapsed})
        chapters.append({'title': scene['title'], 'start': elapsed, 'end': elapsed+duration})
        elapsed += duration
        print(f"Rendered frames {scene['id']}: {duration:.2f}s", flush=True)
        if args.preview:
            continue
        concat = OUT / (scene['id'] + '.ffconcat')
        entries = ['ffconcat version 1.0']
        for path, cue in zip(files, cues):
            entries.extend([f"file '{path.name}'", f"duration {cue['end']-cue['start']:.7f}"])
        entries.append(f"file '{files[-1].name}'")
        concat.write_text('\n'.join(entries)+'\n', encoding='utf-8')
        video = OUT / (scene['id'] + '.mp4')
        videos.append(video)
        sources = [Path(__file__), ROOT/'storyboard.json',
                   ROOT/'audio'/(scene['id']+'.mp3'), ROOT/'audio'/(scene['id']+'.json')]
        sources += [selected_screen(scene, j) for j in range(len(cues))]
        if (CAPTURE/'capture-metadata.json').exists():
            sources.append(CAPTURE/'capture-metadata.json')
        if video.exists() and video.stat().st_mtime >= max(p.stat().st_mtime for p in sources):
            print('Reusing verified encoding:', video.name, flush=True)
            continue
        cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'warning', '-y',
               '-f', 'concat', '-safe', '0', '-i', str(concat),
               '-i', str(ROOT / 'audio' / (scene['id'] + '.mp3')),
               '-vf', f'fps=30,fade=t=in:st=0:d=0.15,fade=t=out:st={duration-.18:.4f}:d=0.18',
               '-af', f'atempo={SPEED},adelay=250:all=1,apad',
               '-t', f'{duration:.6f}', '-c:v', 'libx264', '-preset', 'veryfast',
               '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k',
               '-ar', '48000', '-movflags', '+faststart', str(video)]
        subprocess.run(cmd, check=True)
        print('Encoded:', video.name, flush=True)
    if args.preview or args.scene:
        return
    srt = []
    for i, cue in enumerate(all_cues, 1):
        srt.extend([str(i), f"{srt_time(cue['start'])} --> {srt_time(cue['end'])}", cue['text'], ''])
    (ROOT / 'Feker-Student-Guide-Arabic.srt').write_text('\n'.join(srt), encoding='utf-8-sig')
    metadata = [';FFMETADATA1', 'title=Feker — Arabic Student Guide', 'language=ara',
                'comment=Actual local frontend captures with fictional demonstration data.']
    for ch in chapters:
        metadata.extend(['[CHAPTER]', 'TIMEBASE=1/1000', f"START={round(ch['start']*1000)}",
                         f"END={round(ch['end']*1000)}", 'title='+ch['title']])
    (OUT / 'chapters.txt').write_text('\n'.join(metadata)+'\n', encoding='utf-8')
    (OUT / 'videos.ffconcat').write_text('ffconcat version 1.0\n'+''.join(f"file '{v.name}'\n" for v in videos), encoding='utf-8')
    target = ROOT / 'Feker-Student-Guide-Arabic.mp4'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'warning', '-y',
                    '-f', 'concat', '-safe', '0', '-i', str(OUT/'videos.ffconcat'),
                    '-i', str(OUT/'chapters.txt'), '-map_metadata', '1', '-map_chapters', '1',
                    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k',
                    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000',
                    '-movflags', '+faststart', str(target)], check=True)
    (ROOT / 'chapters.json').write_text(json.dumps(chapters, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Completed {target.name}: {elapsed:.2f}s', flush=True)


if __name__ == '__main__':
    main()
