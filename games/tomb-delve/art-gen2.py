#!/usr/bin/env python3
# Tomb Delve "L" placeholder art (reference battle-screen style: gold/amber torchlight,
# sandstone, maroon banners, teal accents, winged scarabs). Writes hand-built SVGs.
# Usage: python3 art-gen2.py [outdir]   (default: src/public/art next to this file)
import os, sys, math, random

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src/public/art')
INK = '#1a0c06'
TEAL, TEAL_D, TEAL_L = '#1fa3a0', '#0d5a5e', '#7fe8dc'
MAR, MAR_D = '#8a1a2c', '#4a0a16'
PARCH = '#f6e3b8'


def write(path, s):
    p = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(s)


def svg(w, h, body, defs='', stretch=False):
    par = ' preserveAspectRatio="none"' if stretch else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"{par} '
            f'stroke-linejoin="round" stroke-linecap="round"><defs>{defs}</defs>{body}</svg>\n')


def _st(st):
    return ''.join(f'<stop offset="{s[0]}" stop-color="{s[1]}"' + (f' stop-opacity="{s[2]}"' if len(s) > 2 else '') + '/>' for s in st)


def lin(id, st, x1=0, y1=0, x2=0, y2=1):
    return f'<linearGradient id="{id}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">{_st(st)}</linearGradient>'


def rad(id, st, cx=.5, cy=.5, r=.5, fx=None, fy=None):
    f = f' fx="{fx}" fy="{fy}"' if fx is not None else ''
    return f'<radialGradient id="{id}" cx="{cx}" cy="{cy}" r="{r}"{f}>{_st(st)}</radialGradient>'


def glowr(id, c, a=.8):
    return rad(id, [(0, c, a), (.4, c, a * .45), (1, c, 0)])


def blur(id, sd):
    return (f'<filter id="{id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{sd}" result="b"/>'
            f'<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')


def soft(id, sd):
    return f'<filter id="{id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="{sd}"/></filter>'


GD = lin('gd', [(0, '#fff2b0'), (.3, '#f6c64e'), (.68, '#cf8a22'), (1, '#7a420e')])
GDH = lin('gdh', [(0, '#7a420e'), (.25, '#e0a032'), (.5, '#fff0a0'), (.75, '#e0a032'), (1, '#7a420e')], x2=1, y2=0)


def P(d, fill, sw=4, stroke=INK, extra=''):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{extra}/>'


def L(d, c, w, op=1, extra=''):
    o = f' opacity="{op}"' if op != 1 else ''
    return f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{w}"{o}{extra}/>'


def thick(d, c, w, ow=None):  # outlined thick stroke
    return L(d, INK, w + (ow or 8)) + L(d, c, w)


def E(cx, cy, rx, ry, fill, sw=4, stroke=INK, extra=''):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{extra}/>'


def C(cx, cy, r, fill, sw=4, stroke=INK, extra=''):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{extra}/>'


def cham(x, y, w, h, c):
    return f'M{x+c} {y}H{x+w-c}L{x+w} {y+c}V{y+h-c}L{x+w-c} {y+h}H{x+c}L{x} {y+h-c}V{y+c}Z'


def rr(x, y, w, h, r):
    return (f'M{x+r} {y}H{x+w-r}Q{x+w} {y} {x+w} {y+r}V{y+h-r}Q{x+w} {y+h} {x+w-r} {y+h}'
            f'H{x+r}Q{x} {y+h} {x} {y+h-r}V{y+r}Q{x} {y} {x+r} {y}Z')


def hexb(x, y, w, h, p):  # bar with pointed ends
    m = y + h / 2
    return f'M{x+p} {y}H{x+w-p}L{x+w} {m}L{x+w-p} {y+h}H{x+p}L{x} {m}Z'


def mirror(body, W):
    return f'{body}<g transform="translate({W} 0) scale(-1 1)">{body}</g>'


def g(body, tr='', extra=''):
    t = f' transform="{tr}"' if tr else ''
    return f'<g{t}{extra}>{body}</g>'


# ---------- hieroglyphs (stroke-only, ~26 unit cell, centred) ----------
GLY = [
    'M0 -2C-6 -4 -6 -12 0 -12C6 -12 6 -4 0 -2ZM-7 -1H7M0 -2V12',
    'M-10 0Q0 -8 10 0Q0 6 -10 0ZM-2 -1H2M-4 4L-6 11M2 4Q6 10 9 8',
    'M-8 11L-2 2Q-6 -4 -2 -9Q3 -11 4 -6L10 -5L4 -3Q6 3 2 6L8 11',
    'M-10 -3L-6 1L-2 -3L2 1L6 -3L10 1M-10 5L-6 9L-2 5L2 9L6 5L10 9',
    'M0 12V-6Q5 -10 2 -12Q-4 -8 0 -6M-5 2Q0 -1 5 2',
    'M-7 0A7 7 0 1 0 7 0A7 7 0 1 0 -7 0M-1 0H1',
    'M-10 10H6Q10 10 10 6V-4Q10 -9 6 -9Q2 -9 3 -5',
    'M-3 12V-10H3V12M-8 -8H8M-8 -4H8M-8 0H8',
    'M-2 12V-12Q8 -4 -2 4',
    'M-11 4H6Q10 4 10 0Q10 -3 6 -3H-2L-11 -5Z',
    'M-9 12V-3Q-9 -11 0 -11Q9 -11 9 -3V12M-9 12H9',
    'M-10 -10L10 10M-10 10L10 -10',
]
GLYDEFS = ''.join(f'<path id="h{i}" d="{d}" fill="none" stroke="currentColor" vector-effect="non-scaling-stroke"/>'
                  for i, d in enumerate(GLY))


def gly(x, y, s, i):
    return f'<use href="#h{i % len(GLY)}" transform="translate({x:.0f} {y:.0f}) scale({s:.2f})"/>'


def gcol(xc, y0, y1, cell, color, sw, rng, op=1):
    out, y = [], y0 + cell / 2
    while y + cell / 2 <= y1:
        out.append(gly(xc, y, cell / 26, rng.randrange(len(GLY))))
        y += cell * 1.08
    o = f' opacity="{op}"' if op != 1 else ''
    return f'<g style="color:{color}" stroke-width="{sw}"{o}>{"".join(out)}</g>'


def grow(x0, x1, yc, cell, color, sw, rng, op=1):
    out, x = [], x0 + cell / 2
    while x + cell / 2 <= x1:
        out.append(gly(x, yc, cell / 26, rng.randrange(len(GLY))))
        x += cell * 1.15
    o = f' opacity="{op}"' if op != 1 else ''
    return f'<g style="color:{color}" stroke-width="{sw}"{o}>{"".join(out)}</g>'


# ---------- wings + winged scarab ----------
def wing(ln, H, n=4, fill='url(#gd)', band=TEAL, sw=3):
    """Egyptian wing pointing left from (0,0)."""
    s = ''
    for i in reversed(range(n)):
        l = ln * (1 - .16 * i)
        a = -H / 2 + i * H / n
        b = a + H / n + 5
        t = a - H * .28 * (1 - i / n)
        d = (f'M0 {a:.1f}C{-l*.4:.1f} {a-6:.1f} {-l*.8:.1f} {t:.1f} {-l:.1f} {t+2:.1f}'
             f'C{-l*.82:.1f} {t+H/n+3:.1f} {-l*.45:.1f} {b:.1f} 0 {b:.1f}Z')
        s += P(d, fill, sw)
        s += L(f'M{-l*.25:.1f} {(a+b)/2:.1f}H{-l*.85:.1f}', INK, sw * .5, .35)
    s += P(f'M2 {-H/2-3:.1f}C{-ln*.25:.1f} {-H/2-8:.1f} {-ln*.42:.1f} {-H/2-4:.1f} {-ln*.5:.1f} {-H/2+5:.1f}'
           f'C{-ln*.3:.1f} {-H/2+10:.1f} {-ln*.12:.1f} {-H/2+9:.1f} 2 {-H/2+12:.1f}Z', band, sw)
    return s


def wsc_body(fill='url(#gd)', sw=3):
    w = wing(100, 52, fill=fill, sw=sw)
    return (g(w, 'translate(-14 0)') + g(w, 'translate(14 0) scale(-1 1)') +
            L('M-8 -14L-20 -24M8 -14L20 -24M-12 12L-24 22M12 12L24 22', INK, sw * 1.6) +
            C(0, -34, 11, '#d9452a', sw) +
            E(0, 6, 18, 22, fill, sw) + L('M0 -14V28', INK, sw * .7) +
            E(0, -15, 12, 8, fill, sw))


WSC = f'<g id="wsc">{wsc_body()}</g>'


def flame(cx, by, s, cols=('#e8401a', '#ffa020', '#fff2a0')):
    d = 'M-40 0C-54 -30 -30 -52 -24 -82C-14 -62 -6 -68 -4 -104C16 -72 30 -62 24 -42C34 -52 40 -62 38 -74C56 -44 54 -16 40 0Z'
    return (f'<g transform="translate({cx} {by}) scale({s})">'
            f'<path d="{d}" fill="{cols[0]}" stroke="{INK}" stroke-width="3"/>'
            f'<path d="{d}" fill="{cols[1]}" transform="translate(0 -2) scale(.72)"/>'
            f'<path d="{d}" fill="{cols[2]}" transform="translate(2 -2) scale(.42)"/></g>')


def dust(rng, n, x0, x1, y0, y1, c='#ffd27a'):
    return ''.join(f'<circle cx="{rng.uniform(x0,x1):.0f}" cy="{rng.uniform(y0,y1):.0f}" r="{rng.uniform(1,3):.1f}" '
                   f'fill="{c}" opacity="{rng.uniform(.25,.7):.2f}"/>' for _ in range(n))


def stars(rng, n, W, H):
    return ''.join(f'<circle cx="{rng.uniform(0,W):.0f}" cy="{rng.uniform(0,H)**1.3/H**.3:.0f}" r="{rng.uniform(.6,2.4):.1f}" '
                   f'fill="#fff6dc" opacity="{rng.uniform(.3,1):.2f}"/>' for _ in range(n))


# ---------- room pieces ----------
PIL = lin('pil', [(0, '#4a2810'), (.2, '#b0763a'), (.45, '#eab66c'), (.7, '#b47a3e'), (1, '#3e200c')], x2=1, y2=0)
STONE = lin('stn', [(0, '#c08048'), (1, '#6a3c1c')])


def pillar(x, top, bot, w, rng, glow_side=0):
    cw = w * .5
    s = P(f'M{x} {top+50}H{x+w}V{bot-40}H{x}Z', 'url(#pil)', 5)
    s += f'<rect x="{x+w*.22:.0f}" y="{top+80}" width="{w*.56:.0f}" height="{bot-top-150}" fill="#3a1c08" opacity=".28" stroke="{INK}" stroke-opacity=".5" stroke-width="2"/>'
    s += g(gcol(x + w / 2 + 1, top + 86, bot - 74, cw * .8, '#ffd99a', 2.6, random.Random(rng)), '', ' opacity=".35" transform="translate(1.5 1.5)"')
    s += gcol(x + w / 2, top + 86, bot - 74, cw * .8, '#3a1806', 2.6, random.Random(rng))
    # capital
    s += P(f'M{x-18} {top}H{x+w+18}L{x+w+6} {top+40}H{x-6}Z', 'url(#stn)', 5)
    s += P(f'M{x-6} {top+38}H{x+w+6}V{top+54}H{x-6}Z', 'url(#gd)', 4)
    s += L(''.join(f'M{x-10+i*(w+20)/7:.0f} {top+4}L{x-2+i*(w+4)/7:.0f} {top+36}' for i in range(1, 7)), INK, 2, .45)
    # base
    s += P(f'M{x-6} {bot-44}H{x+w+6}V{bot-30}H{x-6}Z', 'url(#gd)', 4)
    s += P(f'M{x-16} {bot-30}H{x+w+16}V{bot}H{x-16}Z', 'url(#stn)', 5)
    return s


def banner(x, y, w, h):
    d = f'M{x} {y+8}H{x+w}V{y+h-34}L{x+w/2} {y+h}L{x} {y+h-34}Z'
    i = 9
    di = f'M{x+i} {y+16}H{x+w-i}V{y+h-38}L{x+w/2} {y+h-i*1.4}L{x+i} {y+h-38}Z'
    return (P(d, 'url(#ban)', 4) + L(di, '#e8b04a', 3) +
            f'<use href="#wsc" transform="translate({x+w/2} {y+h*.42}) scale({w/260:.2f})"/>' +
            P(f'M{x-12} {y}H{x+w+12}V{y+12}H{x-12}Z', 'url(#gd)', 3) +
            C(x - 14, y + 6, 8, 'url(#gd)', 3) + C(x + w + 14, y + 6, 8, 'url(#gd)', 3) +
            C(x + w / 2, y + h + 6, 7, 'url(#gd)', 3))


def brazier(cx, by):
    return (C(cx, by - 40, 190, 'url(#fireglow)', 0, 'none') +
            P(f'M{cx-34} {by+110}L{cx-20} {by+30}H{cx+20}L{cx+34} {by+110}Z', 'url(#stn)', 4) +
            P(f'M{cx-46} {by+104}H{cx+46}V{by+124}H{cx-46}Z', 'url(#stn)', 4) +
            P(f'M{cx-26} {by+22}H{cx+26}V{by+36}H{cx-26}Z', 'url(#gd)', 3) +
            flame(cx, by + 2, 1.05) +
            P(f'M{cx-62} {by}H{cx+62}Q{cx+54} {by+30} {cx} {by+34}Q{cx-54} {by+30} {cx-62} {by}Z', 'url(#gd)', 4) +
            L(f'M{cx-50} {by+12}H{cx+50}', '#7a420e', 3, .7) +
            E(cx, by, 62, 7, '#5a2408', 3))


def anubis():
    """Seated jackal statue on plinth, facing right; local box x 0..190, y 70..450."""
    blk, rim = '#1c1412', '#c8702a'
    s = P('M-10 352H196V452H-10Z', 'url(#stn)', 5)
    s += P('M-10 352H196V366H-10Z', 'url(#gd)', 4)
    s += grow(0, 186, 408, 28, '#3a1806', 2.4, random.Random(7))
    # body
    s += P('M30 200C10 240 6 300 14 352H170C176 330 172 300 150 292L120 286C118 250 112 220 100 200Z', blk, 5)
    s += P('M110 284C134 280 162 286 176 300C180 318 174 340 164 352H120Z', blk, 5)  # knee
    s += P('M84 214C100 240 104 270 104 300H160C170 300 176 290 168 284L120 282C118 250 110 226 96 206Z', blk, 4)  # arm
    s += P('M14 300H118V330H14Z', 'url(#gd)', 4) + L('M30 304V328M48 304V328M66 304V328M84 304V328M102 304V328', TEAL_D, 4)
    # lappet (headdress) behind head
    s += P('M34 104C20 130 18 190 26 236L70 232C64 190 64 140 70 110Z', 'url(#gd)', 4)
    s += L('M22 150H66M22 170H66M22 190H66M24 210H68', '#1f3a5a', 6)
    # collar
    s += P('M40 196C60 222 100 226 120 204L112 186C96 200 64 200 50 184Z', 'url(#gd)', 4)
    s += L('M48 198C66 212 96 212 112 198', TEAL, 4)
    # neck + head
    s += P('M60 120C56 150 52 180 54 196C74 204 96 202 112 190C104 170 100 150 104 126Z', blk, 5)
    s += P('M50 112C48 86 72 70 98 78C112 82 120 94 128 104L178 122C186 126 184 136 176 138L132 144C116 156 96 160 76 150C60 144 52 128 50 112Z', blk, 5)
    s += P('M60 86L54 8L92 76Z', blk, 5) + P('M64 74L62 32L80 70Z', '#5a2a14', 0)
    s += P('M78 84L84 18L106 82Z', blk, 5)
    s += P('M98 100Q112 94 122 104Q110 108 98 100Z', '#ffcf4a', 2.5) + L('M122 104L134 102', '#ffcf4a', 2.5)
    s += L('M178 126L182 132', '#000', 5)
    # rim light
    s += L('M128 106L176 124M112 92Q120 98 126 104M168 292Q178 312 168 346M108 212Q118 250 120 282', rim, 3, .7)
    return s


def rune_ring(cx, cy, r, sy, rng, n_gly=18, op=1, inner=True):
    c = '#ffd25a'
    ne = ' vector-effect="non-scaling-stroke"'
    s = (f'<circle r="{r}" fill="none" stroke="{c}" stroke-width="5"{ne}/>'
         f'<circle r="{r*.9:.0f}" fill="none" stroke="{c}" stroke-width="2.5"{ne}/>')
    if inner:
        s += (f'<circle r="{r*.62:.0f}" fill="none" stroke="{c}" stroke-width="4"{ne}/>'
              f'<circle r="{r*.34:.0f}" fill="none" stroke="{c}" stroke-width="2.5"{ne}/>')
        s += ''.join(f'<path d="M{r*.62*math.cos(a):.0f} {r*.62*math.sin(a):.0f}L{r*.34*math.cos(a+.5):.0f} {r*.34*math.sin(a+.5):.0f}" stroke="{c}" stroke-width="2"{ne}/>'
                     for a in [i * math.pi / 4 for i in range(8)])
        rm = r * .76
        s += f'<g style="color:{c}" stroke-width="3">' + ''.join(
            f'<use href="#h{rng.randrange(len(GLY))}" transform="rotate({i*360/n_gly:.1f}) translate({rm:.0f} 0) rotate(90) scale({r/260:.2f})"/>'
            for i in range(n_gly)) + '</g>'
        s += ''.join(f'<path d="M{r*.9*math.cos(a):.0f} {r*.9*math.sin(a):.0f}L{r*math.cos(a):.0f} {r*math.sin(a):.0f}" stroke="{c}" stroke-width="2"{ne}/>'
                     for a in [i * math.pi / 36 for i in range(72)])
    o = f' opacity="{op}"' if op != 1 else ''
    return (E(cx, cy, r * 1.15, r * sy * 1.3, 'url(#runeglow)', 0, 'none') +
            f'<g filter="url(#rgl)"{o}><g transform="translate({cx} {cy}) scale(1 {sy})">{s}</g></g>')


def room():
    W, H = 1672, 941
    rng = random.Random(11)
    defs = (GD + GDH + PIL + STONE + GLYDEFS + WSC + blur('rgl', 4) +
            lin('wall', [(0, '#160904'), (.5, '#4e2812'), (1, '#7a4a22')]) +
            lin('floor', [(0, '#7c4c24'), (.4, '#5a3418'), (1, '#24130a')]) +
            lin('ban', [(0, '#a8243a'), (1, '#5a0c1a')]) +
            rad('door', [(0, '#3c1e0c'), (1, '#080302')], cy=.85, r=.8) +
            glowr('fireglow', '#ff9a30', .55) + glowr('cglow', '#ffb040', .4) + glowr('runeglow', '#ffc040', .45) +
            lin('dark', [(0, '#0a0402', 0), (.45, '#0a0402', .7), (1, '#0a0402', .94)]) +
            rad('vig', [(0, '#000', 0), (.6, '#000', 0), (1, '#000', .7)], r=.75) +
            '<pattern id="brk" width="96" height="40" patternUnits="userSpaceOnUse">'
            '<path d="M0 1H96M0 21H96M24 1V21M72 21V41" stroke="#1a0c06" stroke-opacity=".5" stroke-width="2.5" fill="none"/>'
            '<path d="M0 4H96M0 24H96" stroke="#f0b068" stroke-opacity=".1" stroke-width="2" fill="none"/></pattern>')
    b = f'<rect width="{W}" height="{H}" fill="#120804"/>'
    b += f'<rect width="{W}" height="420" fill="url(#wall)"/><rect width="{W}" height="420" fill="url(#brk)"/>'
    b += E(836, 250, 620, 280, 'url(#cglow)', 0, 'none')
    # floor
    b += f'<rect y="410" width="{W}" height="{H-410}" fill="url(#floor)"/>'
    ys, y, st = [], 418, 13
    while y < H:
        ys.append(y)
        y += st
        st *= 1.26
    vy, sp = 150, 86
    fl = ''.join(f'M0 {yy:.0f}H{W}' for yy in ys)
    seg = ''
    for r_, (ya, yb) in enumerate(zip(ys, ys[1:] + [H])):
        off = .5 if r_ % 2 else 0
        for k in range(-30, 31):
            kk = k + off
            xa = 836 + kk * sp * (ya - vy) / (418 - vy)
            xb = 836 + kk * sp * (yb - vy) / (418 - vy)
            if -50 < xa < W + 50 or -50 < xb < W + 50:
                seg += f'M{xa:.0f} {ya:.0f}L{xb:.0f} {yb:.0f}'
    b += L(fl + seg, '#1e0f06', 2.5, .6) + L(''.join(f'M0 {yy+3:.0f}H{W}' for yy in ys), '#e0a060', 1.5, .12)
    b += E(836, 470, 560, 170, 'url(#cglow)', 0, 'none')
    b += P(f'M0 400H{W}V420H0Z', '#3a1e0c', 3)
    # archway
    b += P('M612 420V150L676 64H996L1060 150V420Z', 'url(#stn)', 5)
    b += P('M650 420V164L700 104H972L1022 164V420Z', '#7a4620', 4)
    b += P('M694 420V184L730 142H942L978 184V420Z', 'url(#door)', 5)
    b += P('M792 420V262L812 238H860L880 262V420Z', '#2a1408', 3, extra=' opacity=".8"')
    b += L('M694 420L760 360H912L978 420M760 360V300M912 360V300', '#4a2810', 3, .6)
    b += P('M640 60H1032V78H640Z', 'url(#gd)', 4)
    b += g('<use href="#wsc"/>', 'translate(836 112) scale(.62)')
    for xx in (630, 1006):
        b += gcol(xx + 18, 170, 410, 30, '#3a1806', 2.4, rng, .9)
    # left half (mirrored)
    half = pillar(486, 36, 408, 92, 3)
    half += banner(338, 0, 104, 250)
    half += pillar(176, -24, 432, 136, 5)
    half += P('M120 436Q210 396 330 430Q250 446 120 436Z', '#a86e34', 3)
    half += brazier(252, 296)
    half += g(anubis(), 'translate(-4 0)')
    half += P('M-10 452Q80 420 200 448Q120 470 -10 470Z', '#b07a3a', 3)
    # rubble bottom corner
    half += ''.join(P(f'M{x} {y}l{w} -8l6 {h}l-{w+4} 10Z', 'url(#stn)', 4, extra=' opacity=".75"')
                    for x, y, w, h in [(-10, 760, 120, 70), (90, 800, 90, 60), (20, 850, 140, 80), (-6, 640, 70, 60)])
    b += f'<g id="half">{half}</g><use href="#half" transform="translate({W} 0) scale(-1 1)"/>'  # ponytail: <use> keeps file <40KB
    # rune circle (monster) + hero ring
    b += rune_ring(836, 446, 310, .2, rng)
    b += rune_ring(370, 548, 175, .2, rng, inner=False, op=.85)
    b += dust(rng, 30, 0, W, 60, 600)
    b += f'<rect y="560" width="{W}" height="{H-560}" fill="url(#dark)"/>'
    b += f'<rect width="{W}" height="{H}" fill="url(#vig)"/>'
    write('bg/room-l.svg', svg(W, H, b, defs))


def pyramid(cx, ay, by, hw, lit, shade, courses=True):
    s = P(f'M{cx} {ay}L{cx-hw} {by}H{cx}Z', shade, 4) + P(f'M{cx} {ay}L{cx+hw} {by}H{cx}Z', lit, 4)
    if courses:
        n = int((by - ay) / 18)
        s += L(''.join(f'M{cx-hw*(t/n):.0f} {ay+(by-ay)*t/n:.0f}H{cx+hw*(t/n):.0f}' for t in range(2, n)), INK, 1.5, .25)
    return s


def title():
    W, H = 1672, 941
    rng = random.Random(21)
    defs = (GD + lin('sky', [(0, '#1e0c34'), (.35, '#5a1e4a'), (.62, '#c8503a'), (.8, '#ffa448'), (1, '#ffd27a')]) +
            glowr('sun', '#fff0b0', 1) + glowr('sunh', '#ff9a40', .7) +
            lin('dark', [(0, '#0a0402', 0), (1, '#0a0402', .92)]) +
            lin('d1', [(0, '#b86a38'), (1, '#6a3420')]) + lin('d2', [(0, '#7a3e22'), (1, '#3a1a10')]) +
            lin('d3', [(0, '#3a1c10'), (1, '#140804')]))
    b = f'<rect width="{W}" height="{H}" fill="url(#sky)"/>' + stars(rng, 90, W, 320)
    b += C(1180, 600, 380, 'url(#sunh)', 0, 'none') + C(1180, 600, 110, 'url(#sun)', 0, 'none')
    b += L('M0 250Q300 230 620 262T1300 240T1672 250M200 300Q500 286 760 306', '#ffb070', 3, .25)
    b += pyramid(330, 400, 640, 250, '#d48a50', '#6a3420')
    b += pyramid(1420, 420, 640, 220, '#e09858', '#7a3e22')
    b += pyramid(836, 150, 660, 540, '#eaa860', '#6e3a20')
    b += P('M836 150L796 196H876Z', 'url(#gd)', 4)
    b += C(836, 150, 60, 'url(#sun)', 0, 'none', ' opacity=".6"')
    b += P(f'M0 600Q300 560 620 620T1200 610T{W} 590V{H}H0Z', 'url(#d1)', 4)
    b += P(f'M0 700Q400 640 820 700T{W} 680V{H}H0Z', 'url(#d2)', 4)
    b += P(f'M0 800Q500 740 1000 800T{W} 780V{H}H0Z', 'url(#d3)', 4)
    # palms + obelisks
    def palm(x, y, s):
        fr = ''.join(P(f'M0 -150Q{60*dx} {-190+dy} {120*dx} {-120+dy}Q{60*dx} {-160+dy} 0 -146Z', '#1a0c08', 2)
                     for dx, dy in [(-1, 0), (1, 0), (-.8, -40), (.8, -40), (-.5, 20), (.5, 20)])
        return g(L('M0 0Q10 -80 0 -150', '#1a0c08', 12) + fr, f'translate({x} {y}) scale({s})')
    b += palm(120, 720, 1.4) + palm(220, 740, 1.1) + palm(1560, 720, 1.4) + palm(1470, 750, 1)
    for x in (560, 1112):
        b += P(f'M{x-18} 700L{x-12} 470L{x} 450L{x+12} 470L{x+18} 700Z', '#2a140a', 3) + P(f'M{x-12} 470L{x} 450L{x+12} 470Z', 'url(#gd)', 2)
    b += f'<rect y="600" width="{W}" height="{H-600}" fill="url(#dark)"/>'
    write('bg/title-l.svg', svg(W, H, b, defs))


def camp():
    W, H = 1672, 941
    rng = random.Random(31)
    fx, fy = 900, 690
    defs = (GD + lin('sky', [(0, '#05061a'), (.5, '#1c1438'), (.8, '#3e2440'), (1, '#5a3038')]) +
            glowr('fire', '#ff8a2a', .75) + glowr('moon', '#fff6d8', .6) + glowr('tglow', '#ffb050', .9) +
            lin('tent', [(0, '#e8c48a'), (1, '#9a6a3a')]) + lin('tents', [(0, '#a07040'), (1, '#4a2a18')]) +
            lin('dark', [(0, '#05030a', 0), (1, '#05030a', .9)]) + lin('crate', [(0, '#a8703a'), (1, '#5a3418')]))
    b = f'<rect width="{W}" height="{H}" fill="url(#sky)"/>' + stars(rng, 160, W, 520)
    b += C(1360, 150, 160, 'url(#moon)', 0, 'none') + C(1360, 150, 52, '#fff4d0', 0, 'none') + C(1382, 138, 48, '#0c0a22', 0, 'none')
    b += g(pyramid(1200, 420, 560, 160, '#3a2440', '#24162e', False) + pyramid(1420, 450, 560, 120, '#3a2440', '#24162e', False), extra=' opacity=".9"')
    b += P(f'M0 560Q400 500 800 560T{W} 540V{H}H0Z', '#3a2228', 3)
    b += P(f'M0 640Q500 590 1000 640T{W} 620V{H}H0Z', '#2a1612', 3)
    b += C(fx, fy - 40, 520, 'url(#fire)', 0, 'none')
    # tent
    b += P('M260 700L470 380L700 700Z', 'url(#tents)', 5)
    b += P('M470 380L640 360L860 680L700 700Z', 'url(#tent)', 5)
    b += P('M410 700L470 470L540 700Z', '#2a140a', 4) + P('M440 700L470 520L500 700Z', 'url(#tglow)', 0, 'none')
    b += P('M470 470L410 700L380 700Z', '#c8a06a', 4)
    b += L('M470 380L440 330M640 360L680 320M260 700L200 720M860 680L930 700M700 700L740 722', '#cfa870', 3)
    b += L('M560 380V692', INK, 2, .3)
    # crates / lantern / tools
    for x, y, w, h in [(1120, 640, 120, 90), (1250, 660, 100, 70), (1150, 560, 90, 80)]:
        b += P(rr(x, y, w, h, 4), 'url(#crate)', 4) + L(f'M{x} {y}L{x+w} {y+h}M{x+w} {y}L{x} {y+h}M{x} {y+8}H{x+w}', INK, 2.5, .6)
    b += C(1195, 540, 60, 'url(#tglow)', 0, 'none') + P('M1180 548H1210V516H1180Z', '#ffd27a', 3) + P('M1176 516H1214L1195 500Z', '#3a2410', 3)
    b += thick('M1360 720L1300 470', '#8a5a33', 8) + P('M1282 470Q1300 440 1330 462L1318 476Z', '#9aa4b0', 3)
    # fire
    for a in range(10):
        t = a * math.pi / 5
        b += E(fx + 92 * math.cos(t), fy + 22 + 26 * math.sin(t), 22, 14, '#5a4a48', 3)
    b += thick(f'M{fx-80} {fy+30}L{fx+80} {fy-6}', '#6a3a1c', 20) + thick(f'M{fx-80} {fy-6}L{fx+80} {fy+30}', '#7a4422', 20)
    b += flame(fx, fy + 20, 1.6)
    b += dust(rng, 30, fx - 200, fx + 200, fy - 360, fy - 120, '#ffb050')
    b += P(f'M0 800Q300 770 700 800T{W} 790V{H}H0Z', '#140a08', 0, 'none', ' opacity=".8"')
    b += f'<rect y="620" width="{W}" height="{H-620}" fill="url(#dark)"/>'
    write('bg/camp-l.svg', svg(W, H, b, defs))


def corridors():
    W, H = 3344, 941

    def tiled(tile, P_):
        return f'<g id="t">{tile}</g>' if False else (
            f'<defs><g id="t">{tile}</g></defs>' + ''.join(f'<use href="#t" x="{k*P_}"/>' for k in range(-1, W // P_ + 1)))

    # far: opaque, period 836
    rng = random.Random(41)
    P_ = 836
    defs = (GD + PIL + STONE + GLYDEFS + WSC + glowr('tg', '#ffa040', .55) +
            lin('wall', [(0, '#1a0a04'), (.55, '#5e3416'), (.8, '#3a1e0c'), (1, '#120804')]) +
            '<pattern id="brk" width="76" height="36" patternUnits="userSpaceOnUse">'
            '<path d="M0 1H76M0 19H76M19 1V19M57 19V37" stroke="#1a0c06" stroke-opacity=".5" stroke-width="2.5" fill="none"/></pattern>')
    t = ''
    t += C(560, 360, 300, 'url(#tg)', 0, 'none')
    t += P('M110 170H350V560H110Z', '#4a2610', 5) + P('M122 182H338V548H122Z', '#3a1c0a', 2)
    for xx in (160, 230, 300):
        t += gcol(xx, 196, 540, 46, '#d89a50', 3, rng, .75)
    t += P('M100 150H360V172H100Z', 'url(#gd)', 4)
    t += g('<use href="#wsc"/>', 'translate(230 120) scale(.5)')
    t += P('M540 380H580L572 420H548Z', '#4a2a14', 4) + P('M528 372H592V384H528Z', 'url(#gd)', 3) + flame(560, 374, .7)
    t += P('M660 240H780V520H660Z', '#4a2610', 4)
    t += gcol(720, 254, 510, 50, '#d89a50', 3, rng, .75)
    body = f'<rect width="{W}" height="{H}" fill="url(#wall)"/><rect width="{W}" height="720" fill="url(#brk)"/>'
    body += P(f'M0 700H{W}V722H0Z', '#2a1408', 3)
    body += tiled(t, P_)
    body += L(''.join(f'M0 {y}H{W}' for y in (760, 810, 880)), '#0a0402', 3, .6)
    write('bg/corridor-far-l.svg', svg(W, H, body, defs))

    # mid: pillars + torches, transparent gaps, period 1672
    P_ = 1672
    defs = (GD + PIL + STONE + GLYDEFS + WSC + glowr('tg', '#ffa040', .6) + lin('ban', [(0, '#a8243a'), (1, '#5a0c1a')]))
    t = ''
    for i, x in enumerate((240, 1076)):
        t += C(x + 380, 360, 230, 'url(#tg)', 0, 'none')
        t += pillar(x, 60, 860, 150, 50 + i)
        tx = x + 380
        t += P(f'M{tx-16} 420H{tx+16}L{tx+10} 470H{tx-10}Z', '#4a2a14', 4) + P(f'M{tx-24} 410H{tx+24}V424H{tx-24}Z', 'url(#gd)', 3)
        t += L(f'M{tx} 470V520M{tx-30} 520H{tx+30}', '#3a2010', 6) + flame(tx, 414, .8)
    t += banner(240 + 20, 150, 110, 270)
    t += P(f'M-10 0H{P_+10}V46H-10Z', 'url(#stn)', 4) + P(f'M-10 46H{P_+10}V60H-10Z', 'url(#gd)', 3)
    t += grow(0, P_, 24, 30, '#3a1806', 2.4, random.Random(5))
    write('bg/corridor-mid-l.svg', svg(W, H, tiled(t, P_), defs))

    # near: dark foreground silhouettes, mostly transparent, period 1672
    sil, rim = '#120804', '#ff9a40'
    t = ''
    x = 980
    t += P(f'M{x} 0H{x+190}V{H}H{x}Z', sil, 0, 'none') + P(f'M{x-30} 0H{x+220}V70H{x-30}Z', sil, 0, 'none')
    t += P(f'M{x-24} {H-80}H{x+214}V{H}H{x-24}Z', sil, 0, 'none')
    t += L(f'M{x+2} 80V{H-84}', rim, 4, .4) + L(f'M{x+40} 120V{H-120}M{x+150} 120V{H-120}', '#000', 3, .5)
    r = random.Random(9)
    for cx in (220, 620, 1400):
        for _ in range(7):
            xx = cx + r.randint(-140, 140)
            w, h = r.randint(50, 120), r.randint(30, 90)
            t += P(f'M{xx-w//2} {H}L{xx-w//2+8} {H-h}L{xx+w//4} {H-h-14}L{xx+w//2} {H-h//2}L{xx+w//2} {H}Z', sil, 3, '#2a1408')
            t += L(f'M{xx-w//2+8} {H-h}L{xx+w//4} {H-h-14}', rim, 2, .35)
    t += P(f'M480 {H}V{H-150}Q480 {H-200} 520 {H-210}Q560 {H-200} 560 {H-150}V{H}Z', sil, 0, 'none')  # urn
    t += P(f'M500 {H-210}H540V{H-235}H500Z', sil, 0, 'none')
    t += L('M1310 0Q1330 120 1320 260M1340 0Q1356 80 1350 170', '#2a1408', 5)
    write('bg/corridor-near-l.svg', svg(W, H, tiled(t, P_), ''))


# ---------- UI ----------
def ui():
    D = GD + GDH
    # banner 800x80
    d = D + lin('mar', [(0, '#b02a40'), (.5, '#8a1a2c'), (1, '#4a0a16')]) + WSC
    w = wing(104, 44, sw=3)
    b = g(w, 'translate(112 42)') + g(w, 'translate(688 42) scale(-1 1)')
    b += P(hexb(84, 6, 632, 68, 28), 'url(#gd)', 4)
    b += P(hexb(96, 14, 608, 52, 22), 'url(#mar)', 3)
    b += L(hexb(106, 20, 588, 40, 17), '#e8b04a', 1.5, .7)
    b += P('M400 0L410 8L400 16L390 8Z', 'url(#gd)', 2.5) + P('M400 64L410 72L400 80L390 72Z', 'url(#gd)', 2.5)
    write('ui/banner.svg', svg(800, 80, b, d, True))

    # plate 460x80
    d = D + lin('dk', [(0, '#3a241a'), (1, '#140a06')])
    b = P(hexb(4, 8, 452, 64, 26), 'url(#gd)', 4) + P(hexb(14, 15, 432, 50, 20), 'url(#dk)', 3)
    b += L(hexb(24, 21, 412, 38, 15), '#e8b04a', 1.5, .5)
    b += P('M2 40L14 30L26 40L14 50Z', 'url(#gd)', 2.5) + P('M434 40L446 30L458 40L446 50Z', 'url(#gd)', 2.5)
    write('ui/plate.svg', svg(460, 80, b, d, True))

    # nameplates
    def panel(name, W_, acc, gem):
        d = D + lin('par', [(0, '#fff3d4'), (1, '#e6c88c')]) + rad('slot', [(0, '#5a1424'), (1, '#1e0408')])
        b = P(cham(6, 8, W_ - 12, 124, 20), 'url(#gd)', 4)
        b += P(cham(16, 18, W_ - 32, 104, 13), 'url(#par)', 3)
        b += L(cham(23, 25, W_ - 46, 90, 9), acc, 2)
        for x, y, sx, sy in [(6, 8, 1, 1), (W_ - 6, 8, -1, 1), (6, 132, 1, -1), (W_ - 6, 132, -1, -1)]:
            b += g(P('M0 0H30L22 8H8V22L0 30Z', 'url(#gd)', 2.5) + C(12, 12, 4, gem, 2), f'translate({x} {y}) scale({sx} {sy})')
        b += L(f'M150 64H{W_-36}', '#b0802a', 2, .6) + C(W_ / 2 + 50, 64, 3, '#b0802a', 0, 'none')
        b += C(76, 70, 56, 'url(#gd)', 4) + C(76, 70, 46, 'url(#slot)', 3) + L('M38 70A38 38 0 0 1 114 70', '#000', 3, .35)
        b += P('M76 118L84 128L76 138L68 128Z', gem, 2.5)
        write(f'ui/{name}.svg', svg(W_, 140, b, d, True))
    panel('panel-monster', 480, MAR, '#d9452a')
    panel('panel-hero', 440, TEAL_D, TEAL)

    # tray 1440x240
    rng = random.Random(51)
    d = D + PIL + GLYDEFS + rad('tr', [(0, '#561428'), (.7, '#2e0a14'), (1, '#1a0408')], r=.7) + WSC
    b = P(cham(44, 10, 1352, 220, 18), 'url(#gd)', 4)
    b += P(cham(54, 20, 1332, 200, 12), 'url(#tr)', 3)
    b += P('M54 22H1386V40H54Z', '#2a0810', 2) + P('M54 200H1386V218H54Z', '#2a0810', 2)
    b += grow(80, 1360, 31, 15, '#e8b04a', 1.6, rng, .8) + grow(80, 1360, 209, 15, '#e8b04a', 1.6, rng, .8)
    b += L('M60 46H1380M60 194H1380', '#e8b04a', 1.5, .5)
    def tpil():
        s = P('M10 22H62V218H10Z', 'url(#pil)', 4)
        s += P('M2 0H70L62 26H10Z', 'url(#gd)', 4) + P('M2 240H70L62 214H10Z', 'url(#gd)', 4)
        s += f'<rect x="20" y="36" width="32" height="168" fill="#2a1206" opacity=".35" stroke="{INK}" stroke-width="2"/>'
        s += gcol(36, 40, 200, 24, '#2a1206', 2.2, random.Random(3))
        return s
    b += mirror(tpil(), 1440)
    write('ui/tray.svg', svg(1440, 240, b, d, True))

    # btn 240x64
    d = D + lin('dk', [(0, '#4a2c1c'), (.5, '#2a160c'), (1, '#140804')])
    b = P(hexb(4, 4, 232, 56, 18), 'url(#gd)', 4) + P(hexb(12, 10, 216, 44, 13), 'url(#dk)', 3)
    b += L('M28 16H212', '#fff0b0', 1.5, .25) + L(hexb(18, 14, 204, 36, 10), '#e8b04a', 1, .4)
    write('ui/btn.svg', svg(240, 64, b, d, True))

    # btn-end 360x84
    d = D + lin('red', [(0, '#ff5a50'), (.45, '#d0242e'), (1, '#6a0810')])
    w = wing(70, 46, sw=3)
    b = g(w, 'translate(78 44)') + g(w, 'translate(282 44) scale(-1 1)')
    b += P(hexb(50, 6, 260, 72, 22), 'url(#gd)', 4) + P(hexb(60, 14, 240, 56, 17), 'url(#red)', 3)
    b += P('M78 18H282L276 34H84Z', '#fff', 0, 'none', ' opacity=".18"')
    b += L(hexb(66, 19, 228, 46, 13), '#ffd27a', 1.2, .5)
    write('ui/btn-end.svg', svg(360, 84, b, d, True))

    # modal 900x600
    d = D + lin('par', [(0, '#fff3d4'), (.5, '#f6e3b8'), (1, '#e2c084')]) + lin('mar', [(0, '#b02a40'), (1, '#4a0a16')]) + WSC
    b = P(cham(6, 6, 888, 588, 30), 'url(#gd)', 5)
    b += P(cham(20, 20, 860, 560, 20), 'url(#par)', 3)
    b += P('M20 40L40 20H860L880 40V100H20Z', 'url(#mar)', 3)
    b += P('M20 100H880V112H20Z', 'url(#gd)', 3)
    b += L(cham(32, 122, 836, 446, 14), MAR, 2, .7)
    for x, sx in [(60, 1), (840, -1)]:
        b += g('<use href="#wsc"/>', f'translate({x} 60) scale({.22*sx} .22)')
    for x, y, sx, sy in [(6, 6, 1, 1), (894, 6, -1, 1), (6, 594, 1, -1), (894, 594, -1, -1)]:
        b += g(P('M0 0H56L44 12H12V44L0 56Z', 'url(#gd)', 3) + C(18, 18, 7, TEAL, 2.5), f'translate({x} {y}) scale({sx} {sy})')
    for x, y, sx, sy in [(36, 128, 1, 1), (864, 128, -1, 1), (36, 562, 1, -1), (864, 562, -1, -1)]:
        b += g(L('M0 0Q30 2 40 0M0 0Q2 30 0 40M0 0L22 22', '#b0802a', 2.5, .7), f'translate({x} {y}) scale({sx} {sy})')
    write('ui/modal.svg', svg(900, 600, b, d, True))

    # hpbar 300x24
    b = P(rr(1.5, 1.5, 297, 21, 10.5), 'url(#gd)', 3) + P(rr(6, 6, 288, 12, 6), '#1a0806', 2) + L('M10 8H290', '#000', 2, .5)
    write('ui/hpbar.svg', svg(300, 24, b, GD, True))


# ---------- cards ----------
CARD = {
    'attack': ('#7a1220', ('#ff6a50', '#b01c2a', '#3a0610'), ('#ffe6d8', '#f2a894'), '#d9452a'),
    'skill': ('#0c4c58', ('#7ff4ff', '#1a8aa0', '#05262e'), ('#e6fcff', '#8fd8e0'), TEAL),
    'signature': ('#7a4a10', ('#ffe080', '#b8701c', '#3a1e06'), ('#fff4cc', '#f0c460'), '#f6c64e'),
}


def cards():
    for k, (bd, art, nm, gem) in CARD.items():
        d = (GD + rad('art', [(0, art[0]), (.5, art[1]), (1, art[2])], cy=.45, r=.7) +
             lin('nm', [(0, nm[0]), (1, nm[1])]) + lin('par', [(0, '#fff6dc'), (1, '#ead09a')]) +
             rad('coin', [(0, '#ffe890'), (1, '#c08020')]) +
             '<clipPath id="aw"><rect x="18" y="18" width="194" height="92" rx="5"/></clipPath>')
        b = P(rr(3, 3, 224, 194, 14), 'url(#gd)', 4)
        b += P(rr(9, 9, 212, 182, 10), bd, 2)
        b += P(rr(14, 14, 202, 100, 7), 'url(#gd)', 2)
        b += P(rr(18, 18, 194, 92, 5), 'url(#art)', 2)
        rays = ''.join(f'M115 66L{115+200*math.cos(a):.0f} {66+200*math.sin(a):.0f}' for a in [i * math.pi / 9 for i in range(18)])
        b += f'<g clip-path="url(#aw)">{L(rays, "#fff", 10, .08)}</g>'
        b += P('M8 106H222L215 121L222 136H8L15 121Z', 'url(#gd)', 3)
        b += P('M18 111H212L207 121L212 131H18L23 121Z', 'url(#nm)', 1.5)
        b += P(rr(17, 141, 196, 50, 6), 'url(#gd)', 2) + P(rr(22, 145, 186, 42, 4), 'url(#par)', 1.5)
        b += P('M115 186L123 193L115 200L107 193Z', gem, 2)
        b += C(204, 22, 6, gem, 2)
        b += C(25, 25, 21, 'url(#gd)', 3.5) + C(25, 25, 14.5, 'url(#coin)', 1.8)
        write(f'cards/l-frame-{k}.svg', svg(230, 200, b, d))


def cardart():
    def wrap(name, glowc, body, extra=''):
        d = GD + rad('glo', [(0, glowc, .85), (.45, glowc, .35), (1, glowc, 0)]) + extra
        write(f'cards/art/{name}.svg', svg(200, 110, E(100, 56, 96, 54, 'url(#glo)', 0, 'none') + body, d))

    steel = lin('stl', [(0, '#ffffff'), (.45, '#c8d4e4'), (.55, '#8a96aa'), (1, '#e6eef8')])
    def star(cx, cy, n, r1, r2, rot=0):
        pts = []
        for i in range(n * 2):
            a = rot + i * math.pi / n
            r = r1 if i % 2 == 0 else r2
            pts.append(f'{cx+r*math.cos(a):.1f} {cy+r*math.sin(a):.1f}')
        return 'M' + 'L'.join(pts) + 'Z'
    def sword(s=1):
        return (P('M-20 -7H60L76 0L60 7H-20Z', 'url(#stl)', 3) + L('M-14 0H58', '#6a7488', 2) +
                P('M-28 -20H-20V20H-28Z', 'url(#gd)', 3) + P('M-54 -5H-28V5H-54Z', '#5a2a14', 3) +
                L('M-48 -5V5M-40 -5V5M-34 -5V5', '#c8902a', 1.5) + C(-58, 0, 7, 'url(#gd)', 3))
    wrap('strike', '#ff3a2a', P(star(104, 54, 12, 54, 22, .1), '#ff4a3a', 0, 'none', ' opacity=".85"') +
         P(star(104, 54, 12, 30, 12), '#ffd27a', 0, 'none', ' opacity=".9"') +
         g(sword(), 'translate(100 58) rotate(-38) scale(1.05)'), steel)

    wrap('guard', '#3ab0ff',
         P('M100 6C118 14 138 14 150 10V48C150 78 128 96 100 106C72 96 50 78 50 48V10C62 14 82 14 100 6Z', 'url(#stl)', 4) +
         P('M100 16C114 22 130 22 140 19V48C140 72 122 87 100 95C78 87 60 72 60 48V19C70 22 86 22 100 16Z', 'url(#blu)', 3) +
         P('M100 16V95C78 87 60 72 60 48V19C70 22 86 22 100 16Z', '#fff', 0, 'none', ' opacity=".18"') +
         L('M100 22V88M66 46H134', '#cfe6ff', 3, .6) + C(100, 48, 9, 'url(#stl)', 3),
         steel + lin('blu', [(0, '#7ac8ff'), (1, '#1a48a8')]))

    boot = (P('M70 22H104V62L140 70Q156 74 154 92H66Z', 'url(#brn)', 4) +
            P('M66 92H154V100H66Z', '#3a1c0c', 3) + P('M68 22H106V34H68Z', 'url(#gd)', 3) +
            L('M104 62L94 72M112 64L104 74M120 66L112 76', '#3a1c0c', 2.5))
    wrap('leap', '#7fe8ff', L('M20 70H50M14 84H46M26 56H52', '#fff', 4, .6) +
         g(wing(64, 40, sw=2.5, band='#fff'), 'translate(76 36) rotate(-18)') + boot,
         lin('brn', [(0, '#c08048'), (1, '#6a3c1c')]))

    wrap('drain', '#ff2a3a',
         P('M100 8C112 34 134 50 134 72A34 34 0 0 1 66 72C66 50 88 34 100 8Z', 'url(#bld)', 4) +
         P('M84 60Q80 76 90 88', 'none', 5, '#fff', ' opacity=".5"') +
         P('M50 10L64 10L57 46Z', '#fff8ec', 3) + P('M136 10L150 10L143 46Z', '#fff8ec', 3) +
         P('M40 6Q100 26 160 6', 'none', 6, '#6a0a14') +
         P('M150 70C154 78 158 82 158 86A8 8 0 0 1 142 86C142 82 146 78 150 70Z', 'url(#bld)', 2.5) +
         P('M46 76C49 82 52 86 52 89A6 6 0 0 1 40 89C40 86 43 82 46 76Z', 'url(#bld)', 2.5),
         lin('bld', [(0, '#ff5a5a'), (1, '#7a0010')]))

    arrow = 'M36 86C30 40 90 14 140 36C158 44 164 56 160 66'
    wrap('evade', '#3ae0d0',
         L('M30 96C60 104 130 100 168 78', '#bff', 4, .5) + thick(arrow, TEAL_L, 12) +
         P('M148 54L176 62L156 84Z', TEAL_L, 4) +
         thick('M58 92C70 64 110 56 132 70', '#fff', 6, 6) + L('M14 40H40M8 56H34M18 72H36', '#fff', 4, .6))

    wrap('wall', '#ffc840',
         P('M68 4H132Q142 4 142 14V82Q142 96 100 108Q58 96 58 82V14Q58 4 68 4Z', 'url(#gd)', 4) +
         P('M72 14H128V80Q128 90 100 98Q72 90 72 80Z', '#9a5a14', 2.5) +
         g(f'<g id="wsc">{wsc_body(sw=4)}</g>', 'translate(100 54) scale(.26)') +
         ''.join(C(x, y, 3.5, '#fff0b0', 2) for x, y in [(66, 12), (134, 12), (66, 80), (134, 80), (100, 104)]))

    axe = (P('M-4 -60H4V60H-4Z', '#6a3c1c', 3) +
           P('M4 -50C30 -66 52 -48 50 -20C40 -32 22 -32 4 -22Z', 'url(#stl)', 3.5) +
           P('M-4 -50C-30 -66 -52 -48 -50 -20C-40 -32 -22 -32 -4 -22Z', 'url(#stl)', 3.5) +
           P('M-8 -58H8V-46H-8Z', 'url(#gd)', 3) + C(0, 62, 6, 'url(#gd)', 3))
    rage = ''.join(flame(x, 104, s, ('#c0141e', '#ff3a1a', '#ff9a3a')) for x, s in [(60, .55), (140, .55), (100, .75)])
    wrap('rampage', '#ff2a1a', rage + g(axe, 'translate(102 58) rotate(28) scale(.85)'), steel)

    dag = (P('M-12 -5H56L72 0L56 5H-12Z', 'url(#stl)', 3) + L('M-8 0H54', '#6a7488', 1.5) +
           P('M-20 -14H-12V14H-20Z', 'url(#gd)', 3) + P('M-42 -4H-20V4H-42Z', '#3a1a4a', 3) +
           C(-46, 0, 6, '#b05aff', 3))
    smoke = ''.join(E(x, y, rx, ry, '#4a1e6a', 0, 'none', f' opacity="{o}"')
                    for x, y, rx, ry, o in [(70, 70, 44, 30, .7), (120, 60, 50, 34, .6), (96, 80, 60, 24, .8), (140, 84, 30, 18, .5)])
    wrap('backstab', '#a040ff', smoke + L('M60 40Q80 30 96 44M120 34Q140 28 150 44', '#c890ff', 3, .5) +
         g(dag, 'translate(98 52) rotate(58) scale(1.05)'), steel)

    pouch = (P('M80 34Q72 50 60 62Q48 86 70 100H130Q152 86 140 62Q128 50 120 34Z', 'url(#brn)', 4) +
             P('M76 26H124L118 38H82Z', '#8a5a33', 3) + L('M80 36Q100 46 120 36', 'url(#gd)', 4) +
             C(100, 74, 14, 'url(#gd)', 3) + L('M100 66V82M94 74H106', '#7a420e', 2.5))
    hand = (P('M14 30Q34 22 56 26L82 22Q90 22 90 28Q90 34 82 34L70 36L86 38Q94 40 92 46Q90 50 82 50L66 50Q50 54 36 50L14 52Z', '#f0c8a0', 3.5) +
            P('M0 26H18V56H0Z', '#4a2a5a', 3))
    coins = ''.join(E(x, y, 9, 6, 'url(#gd)', 2.5) for x, y in [(150, 98), (164, 90), (40, 100), (172, 102)])
    wrap('pickpocket', '#ffd060', pouch + coins + g(hand, 'translate(30 6)'),
         lin('brn', [(0, '#b07a44'), (1, '#5a3418')]))


def icons():
    def w(name, body, d=''):
        write(f'icons/{name}.svg', svg(128, 128, body, GD + d))
    w('inventory', thick('M34 46Q34 14 64 14Q94 14 94 46', '#6a3c1c', 8) +
      P(rr(16, 40, 96, 74, 16), 'url(#br)', 5) +
      P('M16 56Q16 40 32 40H96Q112 40 112 56V70Q64 84 16 70Z', 'url(#br2)', 5) +
      P(rr(54, 62, 20, 22, 4), 'url(#gd)', 4) + C(64, 74, 3.5, INK, 0, 'none') +
      L('M26 96H102', '#3a1c0c', 3, .5), lin('br', [(0, '#b07a44'), (1, '#5a3418')]) + lin('br2', [(0, '#d09a5a'), (1, '#8a5a30')]))
    w('relic', P('M64 50C42 46 40 12 64 10C88 12 86 46 64 50ZM64 40C74 38 74 20 64 20C54 20 54 38 64 40Z', 'url(#gd)', 5,
                 extra=' fill-rule="evenodd"') +
      P('M22 50H106V66H22Z', 'url(#gd)', 5) + P('M56 64H72L78 118H50Z', 'url(#gd)', 5) +
      E(64, 58, 9, 9, TEAL, 3) + C(61, 55, 2.5, '#fff', 0, 'none'))
    card = lambda: P(rr(-22, -32, 44, 64, 6), 'url(#gd)', 4) + P(rr(-16, -26, 32, 52, 4), MAR, 2.5) + P('M0 -12L10 0L0 12L-10 0Z', 'url(#gd)', 2.5)
    w('deck', g(card(), 'translate(44 66) rotate(-16) scale(1.3)') + g(card(), 'translate(84 66) rotate(16) scale(1.3)') +
      g(card(), 'translate(64 62) scale(1.4)'))
    w('map', P('M18 40H110V104H18Z', 'url(#par)', 5) + E(18, 72, 8, 34, '#c8a060', 4) + E(110, 72, 8, 34, '#c8a060', 4) +
      L('M30 92Q50 70 66 84T96 60', MAR, 3.5, extra=' stroke-dasharray="6 6"') + L('M88 86L98 96M98 86L88 96', MAR, 4) +
      P('M64 70C46 50 44 38 44 32A20 20 0 0 1 84 32C84 38 82 50 64 70Z', '#d9452a', 5) + C(64, 32, 8, 'url(#gd)', 3),
      lin('par', [(0, '#fff3d4'), (1, '#e2c084')]))


# ---------- monsters (900x640, facing viewer) ----------
MW, MH = 900, 640


def shadow(rx=300):
    return E(450, 596, rx, 36, '#000', 0, 'none', ' opacity=".4"')


def mon(name, body, defs=''):
    write(f'monsters/l-{name}.svg', svg(MW, MH, body, GD + defs))


def m_scarab():
    iri = lin('iri', [(0, '#1d1238'), (.22, '#4b2f8f'), (.42, '#1f7f86'), (.58, '#3aa05a'), (.76, '#d6a630'), (1, '#5a2a10')], 0, 0, 1, 1)
    iri2 = lin('iri2', [(0, '#3a1a5a'), (.5, '#1f6a70'), (1, '#2a140a')], 0, 0, 1, 1)
    defs = iri + iri2 + glowr('eye', '#d4ff40', .9) + glowr('aura', '#ffb040', .35)
    legc = '#3a2014'

    def leg(pts, w=18):
        d = 'M' + 'L'.join(f'{x} {y}' for x, y in pts)
        s = thick(d, legc, w, 10) + L(d, '#8a5030', 3, .6)
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            s += P(f'M{mx-4:.0f} {my:.0f}L{mx-12:.0f} {my-16:.0f}L{mx+4:.0f} {my-4:.0f}Z', legc, 3)
        return s
    legs = (leg([(380, 300), (270, 190), (190, 240)], 20) + leg([(370, 350), (220, 320), (140, 440)], 20) +
            leg([(380, 410), (260, 450), (220, 570)], 20) + thick('M420 400Q380 330 350 130Q340 100 320 92', legc, 6, 6))
    shell = (P('M450 150C350 150 288 220 298 312C306 372 380 398 450 398Z', 'url(#iri)', 6) +
             L('M440 170C380 176 330 220 326 290', '#fff', 6, .3) + L('M420 200C380 214 356 250 352 290', '#bfffe0', 3, .3))
    spots = ''.join(C(x, y, r, '#ffe08a', 0, 'none', ' opacity=".5"') for x, y, r in [(360, 260, 4), (390, 320, 3), (340, 330, 3), (410, 240, 3)])
    pron = P('M450 330C380 330 340 362 346 410C356 450 410 466 450 466Z', 'url(#iri2)', 6) + L('M430 344C390 350 366 372 364 400', '#fff', 4, .3)
    mand = P('M418 498C392 520 384 548 400 566C408 550 420 540 434 530Z', '#2a140a', 5)
    half = legs + shell + spots + pron + mand
    s = shadow(380) + C(450, 330, 380, 'url(#aura)', 0, 'none') + mirror(half, MW)
    s += L('M450 150V398', INK, 5)
    s += E(450, 486, 62, 40, '#24120a', 6)
    s += P('M418 484Q450 470 482 484', 'none', 4, '#5a3020')
    s += E(422, 470, 13, 9, 'url(#eye)', 0, 'none') + E(478, 470, 13, 9, 'url(#eye)', 0, 'none')
    s += E(422, 470, 7, 5, '#eaff70', 2) + E(478, 470, 7, 5, '#eaff70', 2)
    s += P('M424 500Q450 528 476 500Q470 520 450 524Q430 520 424 500Z', '#5a0a14', 4)
    s += P('M432 504L436 514L440 506ZM460 506L464 514L468 504Z', '#fff4d0', 1.5)
    s += P('M436 518Q438 548 434 560Q440 566 444 556Q446 540 446 522Z', '#a8d420', 2.5)
    s += P('M458 520Q462 540 462 548Q467 552 470 546Q468 534 466 518Z', '#a8d420', 2.5)
    s += E(436, 574, 4, 6, '#a8d420', 2) + E(466, 560, 3, 5, '#a8d420', 2)
    # minis
    mleg = ''.join(thick(f'M{x0} {y0}L{x1} {y1}L{x2} {y2}', legc, 5, 5) for x0, y0, x1, y1, x2, y2 in
                   [(-14, -8, -38, -20, -46, -6), (-16, 4, -42, 6, -50, 22), (-12, 14, -30, 26, -34, 40)])
    mini = (mirror(mleg, 0) + E(0, 0, 26, 30, 'url(#iri)', 4) + L('M0 -28V28', INK, 3) +
            L('M-14 -18Q-20 0 -12 16', '#fff', 3, .35) + E(0, 30, 16, 10, '#24120a', 4) +
            C(-6, 30, 3, '#eaff70', 0, 'none') + C(6, 30, 3, '#eaff70', 0, 'none') + L('M-8 38L-12 46M8 38L12 46', INK, 3))
    s += f'<defs><g id="mini">{mini}</g></defs>'
    for x, y, sc in [(120, 330, .9), (780, 330, .9), (200, 470, 1.15), (700, 470, 1.15), (300, 560, 1.3), (610, 560, 1.3)]:
        s += f'<use href="#mini" transform="translate({x} {y}) scale({sc})"/>'
    mon('scarab', s, defs)


def m_mummy():
    defs = (WSC + lin('lin', [(0, '#f2e2b8'), (.6, '#cdb788'), (1, '#8a7650')]) + glowr('eye', '#40ffd0', .95) +
            glowr('aura', '#40ffd0', .22) +
            '<clipPath id="bd"><path d="M330 220Q450 186 570 220L558 446Q450 468 342 446Z"/></clipPath>'
            '<clipPath id="hd"><ellipse cx="450" cy="150" rx="74" ry="84"/></clipPath>')
    bandc = '#8a7650'
    def bands(x0, x1, y0, y1, step, tilt):
        return L(''.join(f'M{x0} {y+tilt*(i%2*2-1)}Q{(x0+x1)/2} {y+6} {x1} {y-tilt*(i%2*2-1)}' for i, y in enumerate(range(y0, y1, step))), bandc, 3)
    arm = thick('M346 244Q280 300 214 360', '#d6c296', 40, 10) + L('M330 262L318 250M310 284L296 270M290 300L276 292M266 324L252 312M242 342L230 334', bandc, 3)
    hand = P('M222 342Q190 352 180 380L168 410L182 412L194 388L190 420L204 420L210 392L214 422L228 420L228 388L240 400L250 392L236 362Z', '#bca878', 5)
    trail = P('M260 330Q240 380 262 430Q270 460 250 500L262 504Q286 460 276 424Q264 384 276 340Z', '#e0cfa2', 4)
    leg = P('M370 440L360 560Q350 586 380 590H430L436 450Z', 'url(#lin)', 5) + L('M362 480L432 490M360 520L432 528M360 556L430 562', bandc, 3)
    half = trail + arm + hand + leg
    s = shadow(260) + C(450, 300, 330, 'url(#aura)', 0, 'none') + mirror(half, MW)
    s += P('M330 220Q450 186 570 220L558 446Q450 468 342 446Z', 'url(#lin)', 6)
    s += f'<g clip-path="url(#bd)">{bands(320, 580, 200, 470, 18, 5)}</g>'
    s += P('M362 226Q450 290 538 226L530 252Q450 316 370 252Z', 'url(#gd)', 4) + L('M376 248Q450 300 524 248', TEAL, 5)
    s += g('<use href="#wsc"/>', 'translate(450 330) scale(.34)')
    s += P('M436 446L430 470H470L464 446Z', '#5a2a14', 3)
    s += E(450, 150, 74, 84, 'url(#lin)', 6)
    s += f'<g clip-path="url(#hd)">{bands(370, 530, 70, 240, 16, 4)}</g>'
    s += P('M382 126Q450 112 518 126L514 168Q450 178 386 168Z', '#1a0c06', 4)
    s += E(420, 148, 18, 12, 'url(#eye)', 0, 'none') + E(480, 148, 18, 12, 'url(#eye)', 0, 'none')
    s += E(420, 148, 8, 6, '#c8fff0', 2) + E(480, 148, 8, 6, '#c8fff0', 2)
    s += P('M410 196Q450 186 490 196L484 212L470 204L460 214L450 204L440 214L430 204L416 212Z', '#1a0c06', 3)
    s += P('M500 72Q560 60 600 120Q610 150 590 200L578 196Q594 150 580 122Q556 84 506 90Z', '#e0cfa2', 4)
    mon('mummy', s, defs)


def m_golem():
    rng = random.Random(61)
    defs = (GLYDEFS + lin('sst', [(0, '#e8b878'), (.5, '#c08048'), (1, '#6a3c1c')]) +
            lin('sst2', [(0, '#d09a5a'), (1, '#5a3018')]) + glowr('eye', '#40ffe0', .95) + glowr('aura', '#40e0d0', .2) +
            blur('tg', 3))
    teal = '#5ff4e6'
    def block(x, y, w, h, f='url(#sst)'):
        return P(f'M{x+6} {y}L{x+w} {y+4}L{x+w-4} {y+h}L{x} {y+h-6}Z', f, 6) + L(f'M{x+10} {y+8}L{x+w-10} {y+10}', '#ffe0a8', 3, .4)
    half = (block(300, 470, 110, 120) + block(196, 180, 120, 110) +  # leg, shoulder
            block(170, 290, 90, 120, 'url(#sst2)') +  # arm
            P('M140 400L268 392L284 520L150 540Z', 'url(#sst)', 6) +  # fist
            L('M160 440L270 436M164 474L274 470M170 506L278 500', INK, 4, .7) +
            L('M220 210L240 250L230 270', teal, 3, extra=' filter="url(#tg)"'))
    s = shadow(340) + C(450, 330, 360, 'url(#aura)', 0, 'none') + mirror(half, MW)
    s += P('M300 170L600 170L620 330L580 480L320 480L280 330Z', 'url(#sst)', 6)
    s += L('M290 260H610M300 380H600M450 170V260M380 260V380M520 260V380M450 380V480', INK, 3, .55)
    s += f'<g filter="url(#tg)">' + gcol(450, 270, 380, 40, teal, 3.5, rng) + gcol(380, 390, 470, 34, teal, 3, rng) + gcol(520, 390, 470, 34, teal, 3, rng) + '</g>'
    s += L('M330 200L350 240L340 280M560 300L540 340L560 370', teal, 3, extra=' filter="url(#tg)"')
    # head
    s += P('M380 60H520L530 170H370Z', 'url(#sst2)', 6)
    s += P('M372 70Q450 30 528 70L540 120L520 112L380 112L360 120Z', 'url(#gd)', 5)
    s += L('M380 80H520M376 96H524', '#1f3a5a', 5)
    s += P('M396 132H436V148H396ZM464 132H504V148H464Z', '#0a0604', 3)
    s += E(416, 140, 24, 14, 'url(#eye)', 0, 'none') + E(484, 140, 24, 14, 'url(#eye)', 0, 'none')
    s += E(416, 140, 9, 5, '#d0fff8', 0, 'none') + E(484, 140, 9, 5, '#d0fff8', 0, 'none')
    s += P('M410 158H490V166H410Z', '#0a0604', 2)
    for x, y, w in [(250, 100, 30), (640, 90, 24), (700, 230, 20), (190, 140, 18)]:
        s += P(f'M{x} {y}l{w} 4l-4 {w}l{-w} -4Z', 'url(#sst)', 4)
    mon('golem', s, defs)


def m_jackal():
    defs = (lin('fur', [(0, '#3a3240'), (1, '#121016')]) + lin('kilt', [(0, '#fff6e0'), (1, '#d8c8a0')]) +
            glowr('eye', '#ff3020', .95) + glowr('aura', '#ff6020', .2) + lin('stl', [(0, '#fff'), (.5, '#c8d4e4'), (1, '#7a8698')]))
    fur = 'url(#fur)'
    half = (thick('M350 210Q290 260 270 340', '#24202a', 44, 10) +  # upper arm
            P('M244 330L300 330L296 350L240 350Z', 'url(#gd)', 4) +
            thick('M270 350Q260 410 280 450', '#24202a', 38, 10) + C(282, 462, 26, '#24202a', 6) +
            P('M396 470L380 572Q376 594 400 596H436L440 470Z', fur, 6) + P('M376 560H436V576H376Z', 'url(#gd)', 4) +
            P('M378 92L356 -4L420 74Z', fur, 6) + P('M380 76L370 24L406 70Z', '#7a1a2c', 0, 'none') +
            P('M392 150Q340 170 330 260L350 300L396 250Z', 'url(#gd)', 5) + L('M388 174L344 190M384 200L338 220M382 226L336 248', '#1f3a5a', 7))
    s = shadow(280) + C(450, 300, 340, 'url(#aura)', 0, 'none') + mirror(half, MW)
    s += P('M350 200Q450 170 550 200L540 380Q450 400 360 380Z', fur, 6)
    s += L('M400 260Q450 280 500 260M410 320Q450 336 490 320M450 290V380', '#5a5262', 3, .7)
    s += P('M348 196Q450 260 552 196L546 226Q450 300 354 226Z', 'url(#gd)', 5) + L('M362 220Q450 280 538 220', TEAL, 6) + L('M372 236Q450 292 528 236', MAR, 4)
    s += P('M356 376H544L560 480H340Z', 'url(#kilt)', 6) + P('M356 376H544V398H356Z', 'url(#gd)', 4) + P('M430 398H470L476 480H424Z', 'url(#gd)', 4)
    s += L('M380 410L370 476M410 410L404 478M490 410L496 478M520 410L530 476', '#a89870', 2.5)
    # khopesh (right hand)
    s += thick('M618 462L640 410', '#3a2010', 10) + P('M636 414Q700 300 640 230Q690 260 690 330Q690 380 652 420Z', 'url(#stl)', 5)
    # staff (left hand)
    s += thick('M282 120V600', '#3a2010', 10) + P('M282 120L262 100L282 84L296 96Z', 'url(#gd)', 4) + P('M272 600H292L282 620Z', 'url(#gd)', 3)
    s += C(282, 462, 26, '#24202a', 6)
    # head
    s += P('M380 110Q450 70 520 110Q534 150 512 190L476 250Q450 268 424 250L388 190Q366 150 380 110Z', fur, 6)
    s += P('M426 232Q450 226 474 232L466 256Q450 266 434 256Z', '#0a0808', 4)
    s += L('M450 160V226', '#5a5262', 3, .6)
    s += P('M396 158Q412 146 432 160Q412 168 396 158ZM504 158Q488 146 468 160Q488 168 504 158Z', '#ff4030', 3)
    s += E(414, 158, 24, 16, 'url(#eye)', 0, 'none') + E(486, 158, 24, 16, 'url(#eye)', 0, 'none')
    s += L('M392 160L380 170M508 160L520 170', 'url(#gd)', 3)
    s += P('M420 100Q450 86 480 100L470 116H430Z', 'url(#gd)', 4)
    s += P('M438 262L444 276L450 264L456 276L462 262', 'none', 3, '#fff')
    mon('jackal', s, defs)


def m_elite():
    rng = random.Random(71)
    defs = (WSC + lin('robe', [(0, '#7a1a4a'), (.6, '#4a0c2e'), (1, '#1e0414')]) + lin('mask', [(0, '#fff2b0'), (.5, '#f0b840'), (1, '#9a5a10')]) +
            glowr('eye', '#d060ff', .95) + glowr('aura', '#9a40ff', .35) + lin('nem', [(0, '#1f3a8a'), (1, '#0e1c4a')]) + blur('pg', 3))
    half = (g(wing(330, 200, n=5, sw=5), 'translate(400 220) rotate(-8)') +
            P('M392 260Q330 340 280 600L360 580L380 620L420 590Z', 'url(#robe)', 6) +
            L('M300 590L340 470', '#e8b04a', 4, .6) +
            P('M380 110Q330 120 320 200Q318 260 344 300L400 280Z', 'url(#nem)', 6) +
            L('M332 170L392 160M326 200L390 196M326 230L392 230M332 260L396 262', 'url(#gd)', 7))
    s = C(450, 300, 420, 'url(#aura)', 0, 'none') + mirror(half, MW)
    s += P('M372 260Q450 240 528 260L560 600Q450 630 340 600Z', 'url(#robe)', 6)
    s += P('M436 260H464L470 610H430Z', 'url(#gd)', 4) + gcol(450, 290, 600, 26, MAR, 2.5, rng)
    s += P('M356 250Q450 320 544 250L536 290Q450 360 364 290Z', 'url(#gd)', 5) + L('M366 276Q450 338 534 276', TEAL, 6) + L('M376 292Q450 350 524 292', MAR, 4)
    # crossed crook & flail
    s += thick('M380 470L520 330', '#1f3a8a', 12) + L('M400 450L410 440M430 420L440 410M460 390L470 380M490 360L500 350', '#f6c64e', 8)
    s += P('M520 330Q540 300 520 286Q506 280 500 296', 'none', 10, 'url(#gd)')
    s += thick('M520 470L380 330', '#1f3a8a', 12) + L('M500 450L490 440M470 420L460 410M440 390L430 380', '#f6c64e', 8)
    s += ''.join(thick(f'M380 330Q{360-i*10} {330+i*8} {356-i*12} {372+i*6}', '#f6c64e', 5, 5) for i in range(3))
    s += thick('M340 420Q380 440 450 420Q520 440 560 420', '#7a1a4a', 30, 10)
    s += C(340, 420, 18, '#c8b090', 5) + C(560, 420, 18, '#c8b090', 5)
    # mask
    s += P('M390 100Q450 40 510 100L516 190Q500 250 450 262Q400 250 384 190Z', 'url(#mask)', 6)
    s += P('M380 90Q450 20 520 90L524 120Q450 80 376 120Z', 'url(#nem)', 5) + L('M392 72Q450 34 508 72', 'url(#gd)', 6)
    s += P('M450 36Q440 50 444 62Q450 70 456 62Q460 50 450 36Z', 'url(#gd)', 3) + C(450, 50, 3, MAR, 0, 'none')
    s += P('M402 150Q420 136 440 150Q420 160 402 150ZM498 150Q480 136 460 150Q480 160 498 150Z', '#1a0410', 3)
    s += E(421, 150, 26, 18, 'url(#eye)', 0, 'none') + E(479, 150, 26, 18, 'url(#eye)', 0, 'none')
    s += E(421, 150, 7, 5, '#f4d0ff', 0, 'none') + E(479, 150, 7, 5, '#f4d0ff', 0, 'none')
    s += L('M398 152L380 160M502 152L520 160M450 162V200', '#1a0c06', 3)
    s += P('M430 214Q450 222 470 214', 'none', 4)
    s += P('M436 254H464L460 300Q450 308 440 300Z', 'url(#nem)', 4) + L('M440 266H460M440 280H460', 'url(#gd)', 3)
    s += f'<g filter="url(#pg)">' + dust(rng, 40, 200, 700, 80, 600, '#d080ff') + '</g>'
    mon('elite', s, defs)


def m_mimic():
    rng = random.Random(81)
    defs = (GLYDEFS + WSC + lin('wd', [(0, '#c08048'), (1, '#5a3018')]) + lin('wd2', [(0, '#8a5a30'), (1, '#3a1c0c')]) +
            rad('maw', [(0, '#2a0408'), (.7, '#5a0a18'), (1, '#8a1a2c')], cy=.6) + glowr('eye', '#ffd020', .95) +
            lin('tng', [(0, '#ff7a8a'), (1, '#a01a3a')]))
    s = shadow(320)
    # lid (open, tilted back)
    s += P('M220 300L260 120H640L680 300Z', 'url(#wd2)', 6) + P('M250 150H650L660 196H240Z', 'url(#gd)', 5)
    s += P('M240 280L262 170H638L660 280Z', 'url(#maw)', 4)
    # top teeth
    s += ''.join(P(f'M{x} 280L{x+16} 330L{x+32} 280Z', '#fff4dc', 3) for x in range(250, 650, 34))
    # body
    s += P('M200 300H700L680 560H220Z', 'url(#wd)', 6)
    s += P('M240 300H660L630 380Q450 420 270 380Z', 'url(#maw)', 4)
    s += ''.join(P(f'M{x} {372+abs(x-450)*-.05:.0f}L{x+16} 318L{x+32} {372+abs(x-434)*-.05:.0f}Z', '#fff4dc', 3) for x in range(270, 640, 34))
    s += P('M400 360Q380 440 430 480Q470 510 500 470Q520 440 490 420Q470 400 480 360Z', 'url(#tng)', 5) + L('M444 380Q440 430 470 466', '#7a0a20', 3)
    s += P('M200 420H700V444H200Z', 'url(#gd)', 4) + P('M216 540H684V562H216Z', 'url(#gd)', 4)
    s += P('M232 444H668L660 540H240Z', TEAL_D, 4)
    s += g('<use href="#wsc"/>', 'translate(450 490) scale(.6)')
    s += gcol(270, 450, 536, 26, '#e8b04a', 2.5, rng) + gcol(630, 450, 536, 26, '#e8b04a', 2.5, rng)
    for x in (200, 700):
        s += P(f'M{x-14} 290H{x+14}V570H{x-14}Z', 'url(#gd)', 5)
    # eyes on lid
    for x in (380, 520):
        s += E(x, 220, 36, 24, '#fff6c0', 5) + E(x, 220, 30, 20, 'url(#eye)', 0, 'none') + E(x, 222, 7, 16, INK, 0, 'none')
    s += P('M330 188L420 206L414 190L336 176Z', INK, 3) + P('M570 188L480 206L486 190L564 176Z', INK, 3)
    # coins
    for x, y in [(170, 590), (200, 604), (720, 596), (740, 580), (690, 610), (240, 612), (150, 570)]:
        s += E(x, y, 20, 10, 'url(#gd)', 3)
    s += P('M200 560Q150 576 160 600L200 604Z', '#6a3a1c', 4) + P('M700 560Q752 576 740 600L700 604Z', '#6a3a1c', 4)
    mon('mimic', s, defs)


if __name__ == '__main__':
    room(); title(); camp(); corridors(); ui(); cards(); cardart(); icons()
    m_scarab(); m_mummy(); m_golem(); m_jackal(); m_elite(); m_mimic()
    print('ok', OUT)
