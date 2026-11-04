"""Synthesises the element heroes' sound effects (original, procedurally made).

    python tools/audio/make_hero_sfx.py

Writes assets/game/audio/hero_<element>_<attack|skill>.wav (22.05 kHz mono 16-bit).
Pure standard library, so it runs anywhere Python 3 does. The seed is fixed, so
re-running gives the same files; tweak the recipes below and re-run to change them.
"""

import math
import os
import random
import struct
import wave

RATE = 22050
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "game", "audio")
rng = random.Random(7)


def silence(seconds):
    return [0.0] * int(seconds * RATE)


def noise(n):
    return [rng.uniform(-1, 1) for _ in range(n)]


def envelope(n, attack, release, curve=2.0):
    """Linear attack, then a curved decay to 0 over the rest."""
    a = max(1, int(attack * RATE))
    out = []
    for i in range(n):
        if i < a:
            out.append(i / a)
        else:
            t = (i - a) / max(1, n - a)
            out.append((1 - t) ** curve * (1 if release else 1))
    return out


def bandpass(signal, centre, q=2.0):
    """State-variable band-pass; centre may be a number or a per-sample list."""
    low = band = 0.0
    out = []
    for i, x in enumerate(signal):
        fc = centre[i] if isinstance(centre, list) else centre
        f = 2 * math.sin(math.pi * min(fc, RATE / 6) / RATE)
        high = x - low - band / q
        band += f * high
        low += f * band
        out.append(band)
    return out


def lowpass(signal, cutoff):
    a = math.exp(-2 * math.pi * cutoff / RATE)
    y = 0.0
    out = []
    for x in signal:
        y = (1 - a) * x + a * y
        out.append(y)
    return out


def sine_sweep(seconds, f0, f1, curve=1.0):
    n = int(seconds * RATE)
    phase = 0.0
    out = []
    for i in range(n):
        t = (i / n) ** curve
        phase += 2 * math.pi * (f0 + (f1 - f0) * t) / RATE
        out.append(math.sin(phase))
    return out


def mix(*layers):
    n = max(len(layer) for layer, _ in layers)
    out = [0.0] * n
    for layer, gain in layers:
        for i, v in enumerate(layer):
            out[i] += v * gain
    return out


def mul(a, b):
    return [x * y for x, y in zip(a, b)]


def place(base, layer, at, gain=1.0):
    start = int(at * RATE)
    for i, v in enumerate(layer):
        if start + i < len(base):
            base[start + i] += v * gain
    return base


def crackles(seconds, count, length=0.012):
    out = silence(seconds)
    for _ in range(count):
        pop = mul(bandpass(noise(int(length * RATE)), rng.uniform(1500, 4000), 1.5),
                  envelope(int(length * RATE), 0.001, True, 3))
        place(out, pop, rng.uniform(0, seconds - length), rng.uniform(0.5, 1.2))
    return out


def bubble(seconds, f0, f1):
    n = int(seconds * RATE)
    return mul(sine_sweep(seconds, f0, f1, 0.5), envelope(n, 0.004, True, 2.5))


def swish(seconds, f0, f1, q=1.6):
    """A blade through the air: noise swept through a band-pass."""
    n = int(seconds * RATE)
    centre = [f0 + (f1 - f0) * math.sin(math.pi * i / n) for i in range(n)]
    shape = [math.sin(math.pi * min(1, i / n * 1.4)) ** 2 for i in range(n)]
    return mul(bandpass(noise(n), centre, q), shape)


def normalise(signal, peak=0.85):
    top = max(1e-9, max(abs(v) for v in signal))
    # gentle fade-out on the last 10 ms so nothing clicks
    fade = int(0.01 * RATE)
    out = [v / top * peak for v in signal]
    for i in range(1, fade + 1):
        out[-i] *= i / fade
    return out


def save(name, signal):
    path = os.path.normpath(os.path.join(OUT, name))
    with wave.open(path, "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, v)) * 32767)) for v in normalise(signal)))
    print("wrote", path)


# --- Fire (Ember): roaring whoosh with crackles
def fire_attack():
    d = 0.22
    return mix((swish(d, 900, 2600), 1.0), (crackles(d, 6), 0.35))


def fire_skill():
    d = 0.75
    n = int(d * RATE)
    roar = mul(lowpass(noise(n), 900), envelope(n, 0.06, True, 1.6))
    whoosh = swish(d, 500, 1800, 1.2)
    thump = mul(sine_sweep(0.25, 140, 50), envelope(int(0.25 * RATE), 0.003, True, 2))
    return mix((roar, 1.2), (whoosh, 0.8), (crackles(d, 18), 0.4), (thump, 0.7))


# --- Earth (Bastion): heavy, low, with a stone crack
def earth_attack():
    d = 0.25
    thud = mul(sine_sweep(0.18, 120, 55), envelope(int(0.18 * RATE), 0.002, True, 2))
    return mix((swish(d, 400, 1100, 1.3), 0.9), (thud, 0.6))


def earth_skill():
    d = 0.85
    n = int(d * RATE)
    rumble = mul(lowpass(noise(n), 160), envelope(n, 0.02, True, 1.3))
    boom = mul(sine_sweep(0.5, 90, 35), envelope(int(0.5 * RATE), 0.002, True, 1.8))
    crack = mul(bandpass(noise(int(0.08 * RATE)), 2200, 0.9), envelope(int(0.08 * RATE), 0.001, True, 3))
    out = mix((rumble, 2.2), (boom, 1.0))
    place(out, crack, 0.0, 0.9)
    place(out, crack, 0.09, 0.5)
    return out


# --- Water (Tide): splashy swish and a rising run of bubbles
def water_attack():
    d = 0.22
    out = mix((swish(d, 1200, 3000, 2.2), 0.9))
    place(out, bubble(0.06, 500, 1400), 0.08, 0.35)
    return out


def water_skill():
    d = 0.95
    n = int(d * RATE)
    splash = mul(lowpass(noise(n), 2500), envelope(n, 0.01, True, 2.2))
    out = mix((splash, 0.7))
    for i in range(14):
        f0 = rng.uniform(300, 700)
        place(out, bubble(rng.uniform(0.05, 0.1), f0, f0 * rng.uniform(2, 3)), 0.05 + i * 0.05, rng.uniform(0.3, 0.6))
    return out


# --- Wind (Zephyr): airy, high swish and a swirling gust
def wind_attack():
    d = 0.18
    return mix((swish(d, 1800, 4200, 1.2), 1.0))


def wind_skill():
    d = 1.2
    n = int(d * RATE)
    centre = [700 + 500 * math.sin(2 * math.pi * 3.2 * i / RATE) + 600 * i / n for i in range(n)]
    gust = mul(bandpass(noise(n), centre, 4.0), [math.sin(math.pi * i / n) for i in range(n)])
    hiss = mul(lowpass(noise(n), 4000), [0.15 * math.sin(math.pi * i / n) for i in range(n)])
    return mix((gust, 1.0), (hiss, 1.0))


if __name__ == "__main__":
    save("hero_fire_attack.wav", fire_attack())
    save("hero_fire_skill.wav", fire_skill())
    save("hero_earth_attack.wav", earth_attack())
    save("hero_earth_skill.wav", earth_skill())
    save("hero_water_attack.wav", water_attack())
    save("hero_water_skill.wav", water_skill())
    save("hero_wind_attack.wav", wind_attack())
    save("hero_wind_skill.wav", wind_skill())
