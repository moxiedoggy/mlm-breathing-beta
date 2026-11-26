"""Builds assets/voice/music.m4a: a soft, slow background pad for breathing sessions.

It is made from scratch here (no samples, no licence needed): two gentle chords that
drift into each other once a minute, in a range a phone speaker can play. The level is
set in the audio itself, well under the voice, because iPhones ignore page volume.

Run on a Mac from the project folder:  python3 scripts/build_music.py
"""
import math, os, struct, subprocess, tempfile, wave

SR = 44100
LOOP = 60            # seconds; every wave completes whole cycles, so it repeats seamlessly
REPEATS = 6          # 6 minutes: longer than the longest session, so it never restarts
LEVEL_DB = -40.0     # average level; the voice sits near -29.5

def q(f):            # nearest pitch that fits the loop exactly
    return round(f * LOOP) / LOOP

# (pitch, loudness, swell cycles per loop, swell phase)
CHORD_A = [(146.83, 1.0, 2, 0.0), (220.00, 0.9, 3, 1.1), (293.66, 0.8, 4, 2.0),
           (369.99, 0.55, 5, 0.5), (440.00, 0.45, 3, 2.6)]
CHORD_B = [(146.83, 1.0, 2, 0.0), (196.00, 0.9, 3, 1.7), (246.94, 0.7, 5, 0.9),
           (293.66, 0.7, 4, 2.9), (392.00, 0.45, 2, 1.3)]
SHIMMER = [(659.26, 0.10, 1, 0.4), (880.00, 0.06, 2, 2.2)]

def voices(notes):
    out = []
    for f, amp, m, ph in notes:
        f = q(f)
        out.append((2 * math.pi * f, 2 * math.pi * (f + 12 / LOOP), amp,
                    2 * math.pi * m / LOOP, ph))
    return out

def main():
    A, B, S = voices(CHORD_A), voices(CHORD_B), voices(SHIMMER)
    n = SR * LOOP
    sin = math.sin
    loop = [0.0] * n
    for i in range(n):
        t = i / SR
        wa = math.cos(math.pi * t / LOOP) ** 2      # chord A fades out as chord B fades in
        v = 0.0
        for group, w in ((A, wa), (B, 1.0 - wa), (S, 1.0)):
            if w < 0.001:
                continue
            g = 0.0
            for w1, w2, amp, lw, ph in group:
                swell = 0.6 + 0.4 * sin(lw * t + ph)
                tone = sin(w1 * t) + sin(w2 * t) + 0.12 * sin(2 * w1 * t)
                g += amp * swell * tone
            v += w * g
        loop[i] = v
    rms = math.sqrt(sum(x * x for x in loop) / n)
    k = 10 ** (LEVEL_DB / 20) / rms
    loop = [x * k for x in loop]
    peak = max(abs(x) for x in loop)
    data = loop * REPEATS
    fi, fo = 4 * SR, 6 * SR
    for i in range(fi):
        data[i] *= (i / fi) ** 2
    for i in range(fo):
        data[-1 - i] *= (i / fo) ** 2
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'music.wav')
        w = wave.open(wav, 'w'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        step = SR * 10
        for a in range(0, len(data), step):
            w.writeframes(struct.pack('<%dh' % len(data[a:a + step]),
                                      *[int(x * 32767) for x in data[a:a + step]]))
        w.close()
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '64000', wav,
                        os.path.join(root, 'assets', 'voice', 'music.m4a')], check=True)
    print('music: %d s, average %.1f dB, peak %.1f dB' % (len(data) / SR, LEVEL_DB, 20 * math.log10(peak)))

main()
