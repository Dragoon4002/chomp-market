#!/usr/bin/env bash
# EggMerger art generator. Needs ffmpeg (with librsvg + libwebp) and python3 stdlib.
# Writes games/eggmerger/build/art/* + build/hero.webp + build/thumb.webp.
# Run from anywhere: bash games/eggmerger/art-gen.sh
set -euo pipefail
R="$(cd "$(dirname "$0")/../.." && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
python3 - "$R" "$T" <<'PY'
import os, sys, math, random, subprocess
R, T = sys.argv[1], sys.argv[2]
P = f'{R}/games/brawler/client/public'
B = f'{R}/games/eggmerger/build'
A = f'{B}/art'
os.makedirs(A, exist_ok=True)
O = '#1b1426'
random.seed(7)

def ff(*a):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *a], check=True)

def W(name, s):
    p = f'{T}/{name}'
    open(p, 'w').write(s)
    return p

def svg(w, h, body, defs=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
            f'<defs>{defs}</defs>{body}</svg>')

ALPHA = ['-c:v', 'libwebp', '-quality', '90', '-pix_fmt', 'yuva420p', '-frames:v', '1']
OPAQ = ['-c:v', 'libwebp', '-quality', '88', '-pix_fmt', 'yuv420p', '-frames:v', '1']

# ---------- eggs t1..t4: upscale into 256 square, centered ----------
for i, e in enumerate(['teal', 'purple', 'gold', 'hatch'], 1):
    ff('-i', f'{P}/ui/egg-{e}.webp', '-vf',
       'scale=256:256:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,'
       'pad=256:256:(ow-iw)/2:(oh-ih)/2:color=black@0', *ALPHA, f'{A}/t{i}.webp')

# ---------- portrait frame (512) ----------
def under(c1, c2, c3):
    rays = ''.join(
        f'<polygon points="256,256 {256+240*math.cos(a-.07):.1f},{256+240*math.sin(a-.07):.1f} '
        f'{256+240*math.cos(a+.07):.1f},{256+240*math.sin(a+.07):.1f}" fill="#fff" opacity=".07"/>'
        for a in [k*math.pi/8 for k in range(16)])
    d = (f'<radialGradient id="g" cx=".45" cy=".38" r=".7"><stop offset="0" stop-color="{c1}"/>'
         f'<stop offset=".5" stop-color="{c2}"/><stop offset="1" stop-color="{c3}"/></radialGradient>')
    return svg(512, 512, f'<circle cx="256" cy="256" r="232" fill="url(#g)"/>{rays}', d)

def over(c1, c2, c3):
    d = (f'<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{c1}"/>'
         f'<stop offset=".45" stop-color="{c2}"/><stop offset="1" stop-color="{c3}"/></linearGradient>'
         '<radialGradient id="vig"><stop offset=".72" stop-color="#000" stop-opacity="0"/>'
         '<stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>'
         '<linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".6"/>'
         '<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
         '<radialGradient id="stud" cx=".35" cy=".3"><stop offset="0" stop-color="#fff6c0"/>'
         '<stop offset=".5" stop-color="#f2c94c"/><stop offset="1" stop-color="#9a6216"/></radialGradient>')
    studs = ''.join(
        f'<circle cx="{256+226*math.cos(a):.1f}" cy="{256+226*math.sin(a):.1f}" r="10" fill="url(#stud)" stroke="{O}" stroke-width="4"/>'
        for a in [math.pi/4 + k*math.pi/2 for k in range(4)])
    b = (f'<circle cx="256" cy="256" r="214" fill="url(#vig)"/>'
         f'<ellipse cx="190" cy="120" rx="105" ry="38" transform="rotate(-28 190 120)" fill="url(#gl)" opacity=".55"/>'
         f'<circle cx="256" cy="256" r="226" fill="none" stroke="url(#rim)" stroke-width="26"/>'
         f'<path d="M50 220 A208 208 0 0 1 300 30" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="5" stroke-linecap="round"/>'
         f'<circle cx="256" cy="256" r="240" fill="none" stroke="{O}" stroke-width="11"/>'
         f'<circle cx="256" cy="256" r="213" fill="none" stroke="{O}" stroke-width="6"/>{studs}')
    return svg(512, 512, b, d)

CLIP = "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*clip(214.5-hypot(X-256,Y-256),0,1)'"

def portrait(out, src, chain, cols):
    u, o = W('u.svg', under(*cols)), W('o.svg', over(*cols))
    ff('-i', u, '-i', src, '-i', o, '-filter_complex',
       f'[1]{chain},format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0,{CLIP}[c];'
       '[0][c]overlay=format=auto[u];[u][2]overlay=format=auto', *ALPHA, out)

TITLE = f'{P}/title/1.png'
# name: (crop size, x, y) in title/1.png (1980x1280); None = head.png fallback
CROPS = {
    'torfen':   (270, 340, 270, 'purple caped spear'),
    'makvel':   (270, 1225, 555, 'green ram-horn spear'),
    'lortor':   None,
    'grodrasu': (270, 1445, 140, 'teal visor knight'),
    'bramdra':  (270, 525, 640, 'red-skin teal helm'),
}
RIMS = [  # light, main, dark (disc + rim), one per tier
    ('#9ff7ec', '#22b8aa', '#0c4f55'),  # t5 teal
    ('#ffb3dc', '#e8429a', '#6a1048'),  # t6 magenta
    ('#ffd7a0', '#f08a24', '#7a3608'),  # t7 orange
    ('#ffa8a8', '#d9363e', '#5e0f1c'),  # t8 crimson
    ('#b6caff', '#3d6bff', '#15235e'),  # t9 royal blue
]
GOLD = ('#fff3b0', '#f2b632', '#7a4a08')
for i, n in enumerate(CROPS, 5):
    c = CROPS[n]
    if c:
        s, x, y, _ = c
        portrait(f'{A}/t{i}.webp', TITLE, f'crop={s}:{s}:{x}:{y},scale=470:470:flags=lanczos', RIMS[i-5])
    else:  # ponytail: lortor (blue skin, white horns) is not in title art; upscaled head.png
        portrait(f'{A}/t{i}.webp', f'{P}/chars/{n}/cutout/head.png',
                 'scale=400:-2:flags=lanczos,unsharp=5:5:0.8', RIMS[i-5])

# ---------- burst (512) ----------
def burst(sz=512):
    c = sz/2
    rays = ''
    for k in range(24):
        a = k*math.pi/12
        L = c*(0.98 if k % 2 == 0 else 0.66)
        h = 0.075 if k % 2 == 0 else 0.05
        rays += (f'<polygon points="{c},{c} {c+L*math.cos(a-h):.1f},{c+L*math.sin(a-h):.1f} '
                 f'{c+L*math.cos(a+h):.1f},{c+L*math.sin(a+h):.1f}" fill="url(#ray)"/>')
    sp = ''
    for _ in range(14):
        a, r, s = random.uniform(0, 6.28), random.uniform(.25, .85)*c, random.uniform(.03, .06)*sz
        x, y = c+r*math.cos(a), c+r*math.sin(a)
        sp += (f'<path d="M{x} {y-s}Q{x} {y} {x+s*.35} {y}Q{x} {y} {x} {y+s}Q{x} {y} {x-s*.35} {y}Q{x} {y} {x} {y-s}Z" '
               f'fill="#fffbe6" filter="url(#sg)"/>')
    d = (f'<radialGradient id="ray" gradientUnits="userSpaceOnUse" cx="{c}" cy="{c}" r="{c}">'
         '<stop offset="0" stop-color="#fffbe0" stop-opacity="1"/><stop offset=".35" stop-color="#ffd23f" stop-opacity=".9"/>'
         '<stop offset="1" stop-color="#ff8a00" stop-opacity="0"/></radialGradient>'
         '<radialGradient id="glo"><stop offset="0" stop-color="#fff" stop-opacity="1"/>'
         '<stop offset=".25" stop-color="#ffe066" stop-opacity=".85"/><stop offset=".6" stop-color="#ffab1f" stop-opacity=".3"/>'
         '<stop offset="1" stop-color="#ff7b00" stop-opacity="0"/></radialGradient>'
         '<filter id="sg" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="1.5" result="b"/>'
         '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')
    return svg(sz, sz, f'<circle cx="{c}" cy="{c}" r="{c*.75}" fill="url(#glo)"/>{rays}'
                       f'<circle cx="{c}" cy="{c}" r="{c*.22}" fill="url(#glo)"/>{sp}', d)
ff('-i', W('burst.svg', burst()), *ALPHA, f'{A}/burst.webp')

# ---------- elder (640): gold-rim bramdra + crown + glow + burst ----------
s, x, y, _ = CROPS['bramdra']
portrait(f'{T}/elderp.png', TITLE, f'crop={s}:{s}:{x}:{y},scale=470:470:flags=lanczos', GOLD)
crown = svg(320, 230, (
    f'<path d="M40 175 L22 60 L92 118 L160 22 L228 118 L298 60 L280 175 Z" fill="url(#cg)" stroke="{O}" stroke-width="9" stroke-linejoin="round"/>'
    f'<path d="M48 160 L36 82 M160 44 L112 120" stroke="#fff8d0" stroke-width="5" stroke-linecap="round" opacity=".8"/>'
    f'<rect x="32" y="160" width="256" height="50" rx="14" fill="url(#bg)" stroke="{O}" stroke-width="9"/>'
    f'<rect x="44" y="168" width="232" height="8" rx="4" fill="#fff6c0" opacity=".7"/>'
    + ''.join(f'<circle cx="{px}" cy="{py}" r="15" fill="url(#ball)" stroke="{O}" stroke-width="6"/>'
              for px, py in [(22, 58), (160, 20), (298, 58)])
    + f'<ellipse cx="160" cy="185" rx="22" ry="17" fill="url(#ruby)" stroke="{O}" stroke-width="6"/>'
    + ''.join(f'<ellipse cx="{px}" cy="185" rx="13" ry="11" fill="url(#gem)" stroke="{O}" stroke-width="5"/>' for px in (86, 234))
    + f'<ellipse cx="153" cy="179" rx="7" ry="4" fill="#fff" opacity=".8"/>'),
    '<linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a8"/>'
    '<stop offset=".5" stop-color="#f5b82e"/><stop offset="1" stop-color="#a8640c"/></linearGradient>'
    '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd85c"/>'
    '<stop offset="1" stop-color="#8a4e08"/></linearGradient>'
    '<radialGradient id="ball" cx=".35" cy=".3"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="#ffd84a"/>'
    '<stop offset="1" stop-color="#9a5a08"/></radialGradient>'
    '<radialGradient id="ruby" cx=".4" cy=".35"><stop offset="0" stop-color="#ff9ab0"/><stop offset=".5" stop-color="#e0203c"/>'
    '<stop offset="1" stop-color="#5a0614"/></radialGradient>'
    '<radialGradient id="gem" cx=".4" cy=".35"><stop offset="0" stop-color="#e6b8ff"/><stop offset=".5" stop-color="#9b3cf0"/>'
    '<stop offset="1" stop-color="#3a0a6a"/></radialGradient>')
glow = svg(640, 640, '<circle cx="320" cy="350" r="300" fill="url(#g)"/>',
           '<radialGradient id="g"><stop offset=".55" stop-color="#ffd23f" stop-opacity=".9"/>'
           '<stop offset="1" stop-color="#ff9a00" stop-opacity="0"/></radialGradient>')
ff('-i', W('eb.svg', burst(640)), '-i', W('eg.svg', glow), '-i', f'{T}/elderp.png', '-i', W('crown.svg', crown),
   '-filter_complex',
   '[0][1]overlay=format=auto[a];[2]scale=440:440[p];[a][p]overlay=100:150:format=auto[b];'
   '[3]rotate=-8*PI/180:c=none:ow=rotw(-8*PI/180):oh=roth(-8*PI/180)[c];[b][c]overlay=(W-w)/2-14:6:format=auto',
   *ALPHA, f'{A}/elder.webp')

# ---------- nest (800x1200, opaque) ----------
def blocks(x0, flip):
    out = ''
    for j, yy in enumerate(range(-30, 1200, 78)):
        off = 0 if j % 2 else -12
        x = (x0 + off) if not flip else (800 - x0 - off - 52)
        out += (f'<rect x="{x}" y="{yy}" width="52" height="74" rx="10" fill="url(#stone)" stroke="{O}" stroke-width="5"/>'
                f'<path d="M{x+8} {yy+8} H{x+44}" stroke="#8d78b4" stroke-width="3" stroke-linecap="round" opacity=".7"/>')
    return out
twigs = ''
for _ in range(70):
    x1 = random.uniform(-60, 820); y1 = random.uniform(1095, 1215)
    x2 = x1 + random.uniform(-160, 160); y2 = y1 + random.uniform(-40, 30)
    cx, cy = (x1+x2)/2 + random.uniform(-30, 30), min(y1, y2) - random.uniform(10, 50)
    col = random.choice(['#6b4226', '#8a5a33', '#5a3a5e', '#7a4c3a', '#4a2c40'])
    p = f'M{x1:.0f} {y1:.0f}Q{cx:.0f} {cy:.0f} {x2:.0f} {y2:.0f}'
    twigs += (f'<path d="{p}" fill="none" stroke="{O}" stroke-width="15" stroke-linecap="round"/>'
              f'<path d="{p}" fill="none" stroke="{col}" stroke-width="8" stroke-linecap="round"/>'
              f'<path d="{p}" fill="none" stroke="#c49a6c" stroke-width="2" stroke-linecap="round" opacity=".45" transform="translate(-1,-2)"/>')
motes = ''.join(
    f'<circle cx="{random.uniform(60,740):.0f}" cy="{random.uniform(240,1080):.0f}" r="{random.uniform(2,7):.1f}" '
    f'fill="{random.choice(["#c58cff","#7affc8","#ff8ad8"])}" opacity="{random.uniform(.15,.45):.2f}" filter="url(#bl)"/>'
    for _ in range(40))
runes = ''.join(
    f'<path d="M{400+250*math.cos(a):.0f} {720+250*math.sin(a):.0f} l10 -18 l10 18 l-10 18 z" fill="none" '
    f'stroke="#b07cff" stroke-width="3" opacity=".22"/>' for a in [k*math.pi/6 for k in range(12)])
nest = svg(800, 1200, (
    '<rect width="800" height="1200" fill="url(#bg)"/>'
    '<ellipse cx="400" cy="720" rx="330" ry="470" fill="url(#soft)"/>'
    '<circle cx="400" cy="720" r="290" fill="none" stroke="#b07cff" stroke-width="6" opacity=".10"/>'
    '<circle cx="400" cy="720" r="210" fill="none" stroke="#b07cff" stroke-width="3" stroke-dasharray="18 12" opacity=".10"/>'
    f'{runes}{motes}'
    '<rect x="0" y="0" width="130" height="1200" fill="url(#shL)"/><rect x="670" y="0" width="130" height="1200" fill="url(#shR)"/>'
    f'{blocks(-22, False)}{blocks(-22, True)}'
    '<rect x="0" y="1040" width="800" height="160" fill="url(#bot)"/>'
    f'{twigs}'
    '<rect x="0" y="0" width="800" height="200" fill="url(#lid)"/>'
    '<rect x="0" y="186" width="800" height="28" fill="#ff4fd8" opacity=".45" filter="url(#bl8)"/>'
    f'<line x1="0" y1="200" x2="800" y2="200" stroke="{O}" stroke-width="9"/>'
    '<line x1="0" y1="200" x2="800" y2="200" stroke="#ffb8f0" stroke-width="4" stroke-dasharray="26 14"/>'
    + ''.join(f'<path d="M{px} 182 l18 18 l-18 18 l-18 -18 z" fill="url(#gemL)" stroke="{O}" stroke-width="5"/>'
              for px in (70, 400, 730))
    + '<rect x="-10" y="-20" width="820" height="64" rx="22" fill="url(#stone)" stroke="#1b1426" stroke-width="8"/>'
    '<path d="M20 30 H780" stroke="#8d78b4" stroke-width="4" opacity=".6"/>'),
    '<radialGradient id="bg" cx=".5" cy=".6" r=".75"><stop offset="0" stop-color="#4f2c78"/>'
    '<stop offset=".5" stop-color="#2e1848"/><stop offset="1" stop-color="#0f0819"/></radialGradient>'
    '<radialGradient id="soft"><stop offset="0" stop-color="#b48cff" stop-opacity=".16"/>'
    '<stop offset="1" stop-color="#b48cff" stop-opacity="0"/></radialGradient>'
    '<linearGradient id="stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d4a7e"/>'
    '<stop offset="1" stop-color="#2a1e3e"/></linearGradient>'
    '<linearGradient id="shL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".6"/>'
    '<stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>'
    '<linearGradient id="shR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".6"/>'
    '<stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>'
    '<linearGradient id="bot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c0614" stop-opacity="0"/>'
    '<stop offset="1" stop-color="#0c0614" stop-opacity=".9"/></linearGradient>'
    '<linearGradient id="lid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0512" stop-opacity=".85"/>'
    '<stop offset="1" stop-color="#2a0f3a" stop-opacity=".35"/></linearGradient>'
    '<radialGradient id="gemL" cx=".4" cy=".35"><stop offset="0" stop-color="#ffd0f4"/><stop offset=".5" stop-color="#d23cc0"/>'
    '<stop offset="1" stop-color="#4a0a48"/></radialGradient>'
    '<filter id="bl"><feGaussianBlur stdDeviation="1.5"/></filter>'
    '<filter id="bl8" x="-.1" y="-2" width="1.2" height="5"><feGaussianBlur stdDeviation="8"/></filter>')
ff('-i', W('nest.svg', nest), *OPAQ, f'{A}/nest.webp')

# ---------- coin ----------
subprocess.run(['cp', f'{P}/ui/coin.webp', f'{A}/coin.webp'], check=True)

# ---------- logo ----------
TXT = 'font-family="C059, \'Century Schoolbook\', Georgia, serif" font-weight="bold" text-anchor="middle"'
def words(attrs):
    return (f'<text x="450" y="200" font-size="150" letter-spacing="6" {TXT} {attrs}>EGG</text>'
            f'<text x="450" y="340" font-size="128" letter-spacing="2" {TXT} {attrs}>MERGER</text>')
logo = svg(900, 420, (
    '<path d="M450 4 L500 70 L470 120 L430 120 L400 70 Z" fill="url(#gem)" stroke="#1b1426" stroke-width="8" stroke-linejoin="round"/>'
    '<path d="M450 4 L450 120 M400 70 H500" stroke="#f0c8ff" stroke-width="3" opacity=".6"/>'
    '<path d="M250 110 Q450 70 650 110 L700 90 L670 200 Q640 330 450 405 Q260 330 230 200 L200 90 Z" '
    'fill="url(#shield)" stroke="#1b1426" stroke-width="10" stroke-linejoin="round"/>'
    '<path d="M262 128 Q450 92 638 128" fill="none" stroke="#d8a8ff" stroke-width="5" opacity=".7"/>'
    + words(f'fill="{O}" stroke="{O}" stroke-width="26" stroke-linejoin="round" filter="url(#ds)"')
    + words('fill="url(#gold)" stroke="#5a2a06" stroke-width="10" stroke-linejoin="round"')
    + words('fill="url(#gold)"')),
    '<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe0"/>'
    '<stop offset=".42" stop-color="#ffd84a"/><stop offset=".52" stop-color="#f0a015"/><stop offset="1" stop-color="#9a520a"/></linearGradient>'
    '<linearGradient id="shield" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b4ff0"/>'
    '<stop offset=".6" stop-color="#5a1e9e"/><stop offset="1" stop-color="#2a0a55"/></linearGradient>'
    '<linearGradient id="gem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d0ff"/>'
    '<stop offset=".5" stop-color="#b04cff"/><stop offset="1" stop-color="#4a0f8a"/></linearGradient>'
    '<filter id="ds" x="-.1" y="-.2" width="1.2" height="1.5"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#000" flood-opacity=".6"/></filter>')
open(f'{A}/logo.svg', 'w').write(logo)
ff('-i', f'{A}/logo.svg', *ALPHA, f'{A}/logo.webp')

# ---------- hero (1600x900) ----------
back = svg(1600, 900, (
    '<rect width="1600" height="900" fill="url(#vig)"/>'
    '<ellipse cx="800" cy="610" rx="540" ry="120" fill="url(#in)"/>'
    f'<ellipse cx="800" cy="610" rx="540" ry="120" fill="none" stroke="{O}" stroke-width="58"/>'
    '<ellipse cx="800" cy="610" rx="540" ry="120" fill="none" stroke="url(#rim)" stroke-width="40"/>'),
    '<radialGradient id="vig" cx=".5" cy=".45" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/>'
    '<stop offset="1" stop-color="#05020a" stop-opacity=".75"/></radialGradient>'
    '<radialGradient id="in"><stop offset="0" stop-color="#e070ff"/><stop offset=".5" stop-color="#6a1fa0"/>'
    '<stop offset="1" stop-color="#1e0a33"/></radialGradient>'
    '<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a74b8"/>'
    '<stop offset="1" stop-color="#2a1e3e"/></linearGradient>')
front = svg(1600, 900, (
    f'<path d="M260 610 A540 120 0 0 0 1340 610 C1330 860 1150 960 800 960 C450 960 270 860 260 610 Z" '
    f'fill="url(#body)" stroke="{O}" stroke-width="12"/>'
    '<path d="M330 700 C360 820 480 880 600 900" fill="none" stroke="#9c86c8" stroke-width="10" stroke-linecap="round" opacity=".45"/>'
    + ''.join(f'<path d="M{px} {py} l16 -28 l16 28 l-16 28 z" fill="none" stroke="#7affc8" stroke-width="5" filter="url(#gw)"/>'
              for px, py in [(560, 800), (784, 820), (1008, 800)])
    + f'<path d="M260 610 A540 120 0 0 0 1340 610" fill="none" stroke="{O}" stroke-width="58"/>'
    '<path d="M260 610 A540 120 0 0 0 1340 610" fill="none" stroke="url(#rim)" stroke-width="40"/>'
    '<path d="M330 660 A540 120 0 0 0 800 730" fill="none" stroke="#e8dcff" stroke-width="6" stroke-linecap="round" opacity=".55"/>'),
    '<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3868"/>'
    '<stop offset="1" stop-color="#140c22"/></linearGradient>'
    '<linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a08ad0"/>'
    '<stop offset="1" stop-color="#3a2a56"/></linearGradient>'
    '<filter id="gw" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="4" result="b"/>'
    '<feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')

PILE = [  # cx, cy, diameter, tier  (back to front)
    (470, 540, 200, 8), (1130, 540, 210, 9), (640, 585, 150, 6), (960, 585, 160, 7),
    (360, 605, 140, 5), (1245, 610, 130, 4), (560, 625, 110, 3), (1045, 630, 110, 2),
    (800, 625, 120, 4), (290, 650, 90, 2), (1320, 655, 90, 3), (705, 655, 85, 1), (895, 655, 95, 1),
]
COINS = [(560, 180, 90, -20), (1050, 150, 80, 25), (470, 340, 70, 40), (1140, 330, 100, -35), (640, 90, 60, 10),
         (960, 70, 65, -15), (1260, 220, 60, 30), (360, 230, 55, -40), (700, 470, 60, 15), (910, 480, 70, -25),
         (1350, 420, 50, 20), (250, 420, 50, -10)]
ins = [f'{P}/title/5.png', W('back.svg', back)]
fc = ['[0]scale=1600:900,eq=brightness=-0.06:saturation=1.15,format=rgba[bg]', '[bg][1]overlay=format=auto[l1]']
cur = 'l1'
def add(path, filt, x, y):
    global cur
    ins.append(path); k = len(ins) - 1
    fc.append(f'[{k}]{filt}[i{k}]'); fc.append(f'[{cur}][i{k}]overlay={x}:{y}:format=auto[l{k}]'); cur = f'l{k}'
for cx, cy, d, t in PILE:
    add(f'{A}/t{t}.webp', f'scale={d}:{d}', cx - d//2, cy - d//2)
add(W('front.svg', front), 'null', 0, 0)
add(f'{A}/burst.webp', 'scale=880:880', 800-440, 330-440)
add(f'{A}/elder.webp', 'scale=440:440', 800-220, 340-230)
for cx, cy, d, a in COINS:
    # coins tinted gold for the shower (source coin is silver)
    add(f'{A}/coin.webp', f'scale={d}:-1,format=rgba,colorchannelmixer=rr=1.25:gg=1.0:bb=0.35,rotate={a}*PI/180:c=none:ow=rotw({a}*PI/180):oh=roth({a}*PI/180)', cx-d//2, cy-d//2)
fc[-1] = fc[-1].rsplit('[', 1)[0] + '[base]'
ff(*sum([['-i', p] for p in ins], []), '-filter_complex', ';'.join(fc), '-map', '[base]', '-frames:v', '1', f'{T}/base.png')
ff('-i', f'{T}/base.png', '-i', f'{A}/logo.webp', '-filter_complex', '[1]scale=520:-1[g];[0][g]overlay=40:24', *OPAQ, f'{B}/hero.webp')
ff('-i', f'{T}/base.png', '-i', f'{A}/logo.webp', '-filter_complex',
   '[0]crop=900:900:350:0,scale=512:512[a];[1]scale=330:-1[g];[a][g]overlay=(W-w)/2:H-h-6', *OPAQ, f'{B}/thumb.webp')
PY
ls -la "$R/games/eggmerger/build/art" "$R/games/eggmerger/build/hero.webp" "$R/games/eggmerger/build/thumb.webp"
