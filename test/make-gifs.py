#!/usr/bin/env python3
"""把 readme-shots.cjs --gif 抓下来的帧序列拼成 GIF（依赖系统 Pillow）。

    python3 test/make-gifs.py
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FRAMES = ROOT / '.playtest' / 'gif-frames'
OUT = ROOT / 'screenshots'
WIDTH = 640


def build(prefix: str, out_name: str) -> None:
    files = sorted(FRAMES.glob(f'{prefix}-[0-9]*.png'))
    durations = json.loads((FRAMES / f'{prefix}-times.json').read_text())
    assert len(files) == len(durations), (len(files), len(durations))
    deltas = [round(d) for d in durations]

    frames = []
    for f in files:
        im = Image.open(f).convert('RGB')
        h = round(im.height * WIDTH / im.width)
        frames.append(im.resize((WIDTH, h), Image.LANCZOS))

    # 全序列共用一张自适应调色板，避免帧间闪色
    board = Image.new('RGB', (WIDTH * 2, frames[0].height * 2))
    board.paste(frames[0], (0, 0))
    board.paste(frames[len(frames) // 3], (WIDTH, 0))
    board.paste(frames[2 * len(frames) // 3], (0, frames[0].height))
    board.paste(frames[-1], (WIDTH, frames[0].height))
    palette = board.quantize(colors=256)

    quantized = [f.quantize(palette=palette, dither=Image.FLOYDSTEINBERG) for f in frames]
    quantized[0].save(
        OUT / out_name, save_all=True, append_images=quantized[1:],
        duration=deltas, loop=0, optimize=True,
    )
    size_mb = (OUT / out_name).stat().st_size / 1e6
    print(f'{out_name}: {len(frames)} frames, {sum(deltas)/1000:.1f}s, {size_mb:.2f} MB')


build('gp', 'gameplay.gif')
build('boss', 'boss-fight.gif')
