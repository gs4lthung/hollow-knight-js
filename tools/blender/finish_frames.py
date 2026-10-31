"""Downscale supersampled Blender renders into final game frames.

  python tools/blender/finish_frames.py <raw_dir> <out_dir> <anim>:<w>x<h> [...] [--ground] [--mirror] [--outline=N]

Each <raw_dir>/<anim>/<anim>_NN.png (rendered at an exact multiple of w x h) is shrunk
with premultiplied alpha to w x h. With --ground, every frame of an animation is moved
down by the same amount so its lowest frame stands on the bottom edge; the animation's
own up/down motion is kept; --settle-each instead puts every frame on the bottom edge.
--mirror flips frames left-right (the Blender scenes face
left; the Warden's code expects art facing right). --outline=N adds an N-pixel ink rim
around the silhouette (the hero kit). Prints any frame that touches the
left, right or top edge.
"""
import os
import sys

import numpy as np
from PIL import Image


def shrink(path, w, h):
    a = np.asarray(Image.open(path).convert("RGBA"), dtype=np.float64) / 255.0
    ss = a.shape[1] // w
    assert a.shape[0] == h * ss and a.shape[1] == w * ss, (path, a.shape, w, h)
    pre = np.concatenate([a[..., :3] * a[..., 3:], a[..., 3:]], axis=2)
    pre = pre.reshape(h, ss, w, ss, 4).mean(axis=(1, 3))
    alpha = pre[..., 3:]
    rgb = np.where(alpha > 1e-6, pre[..., :3] / np.maximum(alpha, 1e-6), 0)
    return np.concatenate([rgb, alpha], axis=2)


def lowest_row(img):
    rows = np.nonzero(img[..., 3].max(axis=1) > 0.03)[0]
    return rows[-1] if len(rows) else img.shape[0] - 1


def outline(img, r):
    """Heavy ink rim around the silhouette (like the base hero sprites), r pixels wide."""
    a = img[..., 3]
    h, w = a.shape
    pad = np.pad(a, r)
    grown = a.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r + r:
                grown = np.maximum(grown, pad[r + dy:r + dy + h, r + dx:r + dx + w])
    ink = np.zeros_like(img); ink[..., :3] = 0.02; ink[..., 3] = np.clip(grown * 1.5, 0, 1)
    out_a = a + ink[..., 3] * (1 - a)
    rgb = (img[..., :3] * a[..., None] + ink[..., :3] * ink[..., 3:] * (1 - a[..., None])) / np.maximum(out_a[..., None], 1e-6)
    return np.concatenate([rgb, out_a[..., None]], axis=2)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    ground = "--ground" in sys.argv
    mirror = "--mirror" in sys.argv
    settle_each = "--settle-each" in sys.argv  # every frame on the baseline, not just the lowest one
    ink = next((int(a.split("=")[1]) for a in sys.argv if a.startswith("--outline=")), 0)
    raw, out = args[0], args[1]
    for spec in args[2:]:
        anim, size = spec.split(":")
        w, h = map(int, size.split("x"))
        files = sorted(f for f in os.listdir(os.path.join(raw, anim)) if f.endswith(".png"))
        frames = [shrink(os.path.join(raw, anim, f), w, h) for f in files]
        if mirror:
            frames = [np.ascontiguousarray(f[:, ::-1]) for f in frames]
        if ink:
            frames = [outline(f, ink) for f in frames]
        shift = h - 1 - max(lowest_row(f) for f in frames) if ground else 0
        os.makedirs(os.path.join(out, anim), exist_ok=True)
        for f, img in zip(files, frames):
            a = img[..., 3]  # checked before the shift, so clipping in the render itself shows up
            if a[:, 0].max() > 0.03 or a[:, -1].max() > 0.03 or a[0].max() > 0.03:
                print(f"EDGE {anim}/{f}")
            if settle_each:
                shift = h - 1 - lowest_row(img)
            if shift:
                img =np.concatenate([np.zeros_like(img[:shift]), img[:-shift]]) if shift > 0 else np.concatenate([img[-shift:], np.zeros_like(img[:-shift])])
            Image.fromarray(np.round(img * 255).astype(np.uint8), "RGBA").save(os.path.join(out, anim, f))
        print(f"{anim}: {len(files)} frames -> {w}x{h} (shift {shift})")


if __name__ == "__main__":
    main()
