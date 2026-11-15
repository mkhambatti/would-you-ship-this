"""Assemble the README recording from the frames scripts/captures.mjs took of the real page."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
frames = sorted((ROOT / "data" / "work" / "frames").glob("*.png"))
import json

meta = json.loads((ROOT / "data" / "work" / "frames" / "meta.json").read_text())
KEEP = 3  # use every third capture
frames = frames[::KEEP]
STEP = round(meta["ms"] / meta["frames"] * KEEP)  # real elapsed time per kept frame

images, durations = [], []
previous = None
for path in frames:
    im = Image.open(path).convert("RGB")
    im = im.resize((im.width * 3 // 4, im.height * 3 // 4), Image.LANCZOS)
    if previous is not None and im.tobytes() == previous:
        durations[-1] += STEP
        continue
    previous = im.tobytes()
    images.append(im)
    durations.append(STEP)
durations[-1] += 1500
palette = images[len(images) // 2].quantize(colors=48, method=Image.MEDIANCUT, dither=Image.NONE)
out = [im.quantize(palette=palette, dither=Image.NONE) for im in images]
target = ROOT / "docs" / "demo.gif"
out[0].save(target, save_all=True, append_images=out[1:], duration=durations, loop=0, optimize=True)
print(f"{target.name}: {len(out)} frames from {len(frames)} captures, {sum(durations) / 1000:.1f}s, {target.stat().st_size / 1e6:.2f} MB")
