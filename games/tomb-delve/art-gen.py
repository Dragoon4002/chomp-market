# Tomb Delve placeholder art generator. Writes hand-built SVGs into OUT.
import os, sys, random, math

OUT = sys.argv[1]
O = '#1b1426'
TEAL, TEAL_D, TEAL_L = '#2fa3a0', '#1f7570', '#8fdccf'
SAND, SAND_D, SAND_DD = '#e8c88a', '#c99a5b', '#8a5a33'
GOLD, GOLD_D, GOLD_L = '#f2c94c', '#c8902a', '#ffe9a0'
PURP, PURP_D, PURP_L = '#4a2c5e', '#2b1a3d', '#7a4c8c'
STEEL, STEEL_D = '#b8c2cf', '#7d8798'
BRONZE = '#c47a3a'
WOOD, WOOD_L = '#8a5a33', '#a8703f'
HORN = '#f0e2c0'


def svg(w, h, body, sw=8, defs=''):
    d = f'<defs>{defs}</defs>' if defs else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            f'fill="none" stroke="{O}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round">{d}{body}</svg>\n')


def write(path, s):
    p = os.path.join(OUT, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w').write(s)


def rr(x, y, w, h, r):
    return (f'M{x+r} {y}H{x+w-r}Q{x+w} {y} {x+w} {y+r}V{y+h-r}Q{x+w} {y+h} {x+w-r} {y+h}'
            f'H{x+r}Q{x} {y+h} {x} {y+h-r}V{y+r}Q{x} {y} {x+r} {y}Z')


def ell(cx, cy, rx, ry):  # ellipse as subpath (for evenodd holes)
    return f'M{cx-rx} {cy}a{rx} {ry} 0 1 0 {2*rx} 0a{rx} {ry} 0 1 0 {-2*rx} 0Z'


def radial(id, stops):
    s = ''.join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    return f'<radialGradient id="{id}">{s}</radialGradient>'


def linear(id, stops, x2=0, y2=1):
    s = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return f'<linearGradient id="{id}" x1="0" y1="0" x2="{x2}" y2="{y2}">{s}</linearGradient>'


def glow(id, c):
    return radial(id, [(0, c, .9), (.45, c, .35), (1, c, 0)])


SHADOW = f'<ellipse cx="256" cy="468" rx="150" ry="24" fill="{O}" opacity=".25" stroke="none"/>'


def limb(d, w, c):  # outlined thick stroke (tails, handles, arms)
    return f'<path d="{d}" stroke="{O}" stroke-width="{w+16}"/><path d="{d}" stroke="{c}" stroke-width="{w}"/>'


HORNS = (f'<path d="M184 188Q138 120 168 74Q186 138 226 166Z" fill="{HORN}"/>'
         f'<path d="M328 188Q374 120 344 74Q326 138 286 166Z" fill="{HORN}"/>')


def face(brow=''):
    eyes = ''
    for x in (216, 296):
        eyes += (f'<ellipse cx="{x}" cy="268" rx="26" ry="30" fill="#fff"/>'
                 f'<circle cx="{x+5}" cy="273" r="12" fill="{O}" stroke="none"/>'
                 f'<circle cx="{x+10}" cy="266" r="4.5" fill="#fff" stroke="none"/>')
    return (eyes + brow +
            f'<circle cx="182" cy="315" r="13" fill="#ff8fa3" opacity=".55" stroke="none"/>'
            f'<circle cx="330" cy="315" r="13" fill="#ff8fa3" opacity=".55" stroke="none"/>'
            f'<path d="M228 322Q256 346 284 322"/>'
            f'<path d="M240 330L246 345L253 334Z" fill="#fff" stroke-width="4"/>')


def monster(pre='', mid='', post='', horns_after=False, arms=True, brow='', s=1, tx=0, ty=0):
    tail = limb('M350 400Q445 420 440 330Q438 292 466 280', 24, TEAL) + \
        f'<path d="M452 292L494 252L476 304Z" fill="{TEAL_D}"/>'
    feet = (f'<ellipse cx="200" cy="446" rx="46" ry="26" fill="{TEAL_D}"/>'
            f'<ellipse cx="312" cy="446" rx="46" ry="26" fill="{TEAL_D}"/>')
    body = (f'<path d="M256 150C370 150 390 260 385 330C380 420 330 452 256 452C182 452 132 420 127 330C122 260 142 150 256 150Z" fill="{TEAL}"/>'
            f'<ellipse cx="256" cy="365" rx="76" ry="68" fill="{TEAL_L}" opacity=".75" stroke="none"/>'
            f'<path d="M226 380h60M232 410h48" stroke="{TEAL_D}" stroke-width="5" opacity=".6"/>')
    a = (f'<ellipse cx="128" cy="350" rx="30" ry="40" fill="{TEAL}"/>'
         f'<ellipse cx="384" cy="350" rx="30" ry="40" fill="{TEAL}"/>') if arms else ''
    h = '' if horns_after else HORNS
    g = pre + tail + feet + h + body + mid + face(brow) + (HORNS if horns_after else '') + a + post
    if s != 1 or tx or ty:
        g = f'<g transform="translate({tx} {ty}) scale({s})">{g}</g>'
    return g


# ---------------- characters ----------------
def chars():
    # tank: helmet + shield
    helmet = (f'<path d="M146 230Q146 128 256 126Q366 128 366 230Z" fill="{STEEL}"/>'
              f'<path d="M256 128V214" stroke="{STEEL_D}" stroke-width="10"/>'
              f'<path d="{rr(134, 210, 244, 30, 12)}" fill="{STEEL_D}"/>'
              + ''.join(f'<circle cx="{x}" cy="225" r="5" fill="{O}" stroke="none"/>' for x in (160, 208, 304, 352)))
    shield = (f'<path d="M62 280H206V380Q206 440 134 470Q62 440 62 380Z" fill="{BRONZE}"/>'
              f'<path d="M82 298H186V378Q186 425 134 448Q82 425 82 378Z" fill="{SAND_D}" stroke-width="5"/>'
              f'<path d="M134 320V420M104 352H164" stroke="{GOLD}" stroke-width="14"/>'
              f'<circle cx="134" cy="330" r="14" fill="{GOLD}" stroke-width="5"/>')
    arm_r = f'<ellipse cx="384" cy="350" rx="30" ry="40" fill="{TEAL}"/>'
    write('art/chars/tank.svg', svg(512, 512, SHADOW + monster(mid=helmet, horns_after=True, arms=False, post=arm_r + shield)))

    # berserker: big axe + headband + angry brows
    axe = (limb('M404 476L404 96', 14, WOOD) +
           f'<path d="M404 112Q478 86 492 178Q480 262 404 238Z" fill="{STEEL}"/>'
           f'<path d="M412 124Q466 110 474 178Q466 236 412 224" stroke="#fff" stroke-width="5" opacity=".7"/>'
           f'<path d="M404 132Q356 126 350 176Q356 222 404 218Z" fill="{STEEL_D}"/>'
           f'<path d="M392 92h24v22h-24z" fill="{GOLD}" stroke-width="6"/>')
    band = limb('M146 214Q256 184 366 214', 16, '#d64545') + limb('M150 214L112 236', 10, '#d64545')
    brows = '<path d="M190 228L238 244M322 228L274 244" stroke-width="10"/>'
    arms_b = (f'<ellipse cx="128" cy="350" rx="30" ry="40" fill="{TEAL}"/>'
              f'<ellipse cx="398" cy="340" rx="32" ry="36" fill="{TEAL}"/>')
    write('art/chars/berserker.svg', svg(512, 512, SHADOW + monster(pre=axe, mid=band, arms=False, brow=brows, post=arms_b)))

    # rogue: hood + dual daggers
    hood = (f'<path d="M116 340Q92 150 256 118Q420 150 396 340Q372 250 256 232Q140 250 116 340Z" fill="{PURP}"/>'
            f'<path d="M150 300Q170 250 256 240Q342 250 362 300" stroke="{PURP_L}" stroke-width="6" opacity=".8"/>')

    def dagger(x, y, sx):
        return (f'<g transform="translate({x} {y}) scale({sx} 1)">'
                f'<path d="M0 0L-26 -112L-6 -124L14 -6Z" fill="{STEEL}"/>'
                f'<path d="M-10 -10L-16 -100" stroke="#fff" stroke-width="4" opacity=".8"/>'
                f'<path d="M-24 4L26 -10" stroke-width="22"/><path d="M-24 4L26 -10" stroke="{GOLD}" stroke-width="10"/>'
                f'<path d="M4 4L10 30" stroke-width="22"/><path d="M4 4L10 30" stroke="{WOOD}" stroke-width="10"/></g>')
    arms_r = (dagger(126, 340, 1) + dagger(386, 340, -1) +
              f'<ellipse cx="128" cy="360" rx="30" ry="36" fill="{TEAL}"/>'
              f'<ellipse cx="384" cy="360" rx="30" ry="36" fill="{TEAL}"/>')
    # mask over mouth goes after face, so pass it in post (hood mouth-scarf drawn after face)
    scarf = f'<path d="M188 318Q256 356 324 318L334 350Q256 396 178 350Z" fill="{PURP_D}" stroke-width="6"/>'
    write('art/chars/rogue.svg', svg(512, 512, SHADOW + monster(mid=hood, horns_after=True,
                                                                 arms=False, post=scarf + arms_r)))

    # thief: bandit mask + sack
    sack = (f'<path d="M332 200Q470 170 480 300Q488 400 400 410Q330 412 330 330Z" fill="#b58a5a"/>'
            f'<path d="M352 230Q420 214 446 250" stroke="{SAND_DD}" stroke-width="5"/>'
            f'<circle cx="452" cy="210" r="22" fill="{GOLD}"/><circle cx="420" cy="196" r="18" fill="{GOLD}"/>'
            f'<path d="M446 204v12M416 190v12" stroke="{GOLD_D}" stroke-width="5"/>'
            f'<path d="M330 214Q356 180 396 196" stroke="{SAND_DD}" stroke-width="12"/>')
    mask = (f'<path d="M140 238Q256 220 372 238L376 298Q256 282 136 298Z" fill="{PURP_D}"/>'
            + limb('M372 250L414 236M372 264L410 284', 6, PURP_D))
    arms_t = (f'<ellipse cx="128" cy="350" rx="30" ry="40" fill="{TEAL}"/>'
              f'<ellipse cx="370" cy="300" rx="30" ry="36" fill="{TEAL}"/>')
    write('art/chars/thief.svg', svg(512, 512, SHADOW + monster(pre=sack, mid=mask, arms=False, post=arms_t)))


# ---------------- monsters ----------------
def monsters():
    eye_g = glow('eg', '#9cff6a')
    # mummy
    wrap = '#e8dcc0'
    band = '#b9a77f'
    lines = ''.join(f'<path d="M150 {y}Q256 {y+18} 362 {y-10}" stroke="{band}" stroke-width="6"/>' for y in range(200, 440, 34))
    mummy = (SHADOW +
             limb('M220 430V462', 40, wrap) + limb('M292 430V462', 40, wrap) +
             limb('M190 260L70 290', 44, wrap) + limb('M322 260L442 280', 44, wrap) +
             f'<path d="M256 110C340 110 362 180 360 260C358 350 350 440 256 440C162 440 154 350 152 260C150 180 172 110 256 110Z" fill="{wrap}"/>'
             f'<clipPath id="mc"><path d="M256 110C340 110 362 180 360 260C358 350 350 440 256 440C162 440 154 350 152 260C150 180 172 110 256 110Z"/></clipPath>'
             f'<g clip-path="url(#mc)">{lines}</g>'
             f'<path d="M180 168Q256 150 334 168L332 214Q256 200 182 214Z" fill="{O}"/>'
             f'<circle cx="222" cy="190" r="40" fill="url(#eg)" stroke="none"/><circle cx="292" cy="190" r="40" fill="url(#eg)" stroke="none"/>'
             f'<ellipse cx="222" cy="190" rx="13" ry="9" fill="#d8ff9a" stroke="none"/><ellipse cx="292" cy="190" rx="13" ry="9" fill="#d8ff9a" stroke="none"/>'
             f'<path d="M226 250Q256 240 288 252" stroke-width="6"/>'
             + limb('M340 340Q400 380 380 440Q376 460 400 470', 12, wrap))
    write('art/monsters/mummy.svg', svg(512, 512, mummy, defs=eye_g))

    # scarab swarm
    def scarab(c='#2c5a7a', sheen='#3fb08c'):
        legs = ''.join(f'<path d="M{s*40} {y}L{s*88} {y+dy}L{s*100} {y+dy+30}" stroke-width="10"/>'
                       for s in (-1, 1) for y, dy in ((-20, -30), (10, 0), (40, 30)))
        return (legs +
                f'<path d="M-30 -80Q0 -120 30 -80Q24 -54 0 -50Q-24 -54 -30 -80Z" fill="{O}"/>'
                f'<path d="M-18 -104L-30 -128M18 -104L30 -128" stroke-width="7"/>'
                f'<ellipse cx="0" cy="-58" rx="46" ry="26" fill="{c}"/>'
                f'<path d="M0 -40C-70 -40 -70 30 -60 60C-44 100 -10 110 0 110Z" fill="{c}"/>'
                f'<path d="M0 -40C70 -40 70 30 60 60C44 100 10 110 0 110Z" fill="{c}"/>'
                f'<path d="M-40 -20Q-56 20 -40 70M40 -20Q56 20 40 70" stroke="{sheen}" stroke-width="8" opacity=".9"/>'
                f'<path d="M-16 -62h32" stroke="{GOLD}" stroke-width="8"/>'
                f'<circle cx="-14" cy="-82" r="5" fill="#ff5a3c" stroke="none"/><circle cx="14" cy="-82" r="5" fill="#ff5a3c" stroke="none"/>')
    scar = (SHADOW +
            f'<g transform="translate(120 330) scale(.6) rotate(-25)">{scarab("#3b4f8a", "#6a8ce0")}</g>'
            f'<g transform="translate(396 320) scale(.6) rotate(25)">{scarab("#3b4f8a", "#6a8ce0")}</g>'
            f'<g transform="translate(256 260) scale(1.35)" stroke-width="6">{scarab()}</g>')
    write('art/monsters/scarab.svg', svg(512, 512, scar))

    # golem
    st, st_d = '#c9a06a', '#8a6a44'
    golem = (SHADOW +
             f'<path d="{rr(168, 360, 70, 100, 12)}" fill="{st_d}"/><path d="{rr(274, 360, 70, 100, 12)}" fill="{st_d}"/>'
             f'<path d="{rr(130, 170, 252, 210, 26)}" fill="{st}"/>'
             f'<path d="M150 260H362M256 180V370M150 320H362" stroke="{st_d}" stroke-width="5" opacity=".7"/>'
             f'<path d="{rr(54, 190, 80, 150, 20)}" fill="{st_d}"/><path d="{rr(378, 190, 80, 150, 20)}" fill="{st_d}"/>'
             f'<path d="{rr(42, 320, 104, 84, 22)}" fill="{st}"/><path d="{rr(366, 320, 104, 84, 22)}" fill="{st}"/>'
             f'<path d="{rr(186, 70, 140, 120, 20)}" fill="{st}"/>'
             f'<path d="M210 96L232 128L220 150M300 160L290 180" stroke="{st_d}" stroke-width="5"/>'
             f'<path d="{rr(206, 116, 100, 30, 8)}" fill="{O}"/>'
             f'<circle cx="230" cy="131" r="26" fill="url(#tg)" stroke="none"/><circle cx="282" cy="131" r="26" fill="url(#tg)" stroke="none"/>'
             f'<rect x="220" y="125" width="20" height="12" rx="4" fill="#bff8ef" stroke="none"/><rect x="272" y="125" width="20" height="12" rx="4" fill="#bff8ef" stroke="none"/>'
             f'<circle cx="256" cy="270" r="60" fill="url(#tg)" stroke="none"/>'
             f'<path d="M256 236V306M232 252H280M238 236Q256 220 274 236" stroke="#6ff0e0" stroke-width="10"/>'
             f'<path d="M150 200L176 230M340 350L360 330M380 210L400 240" stroke="{st_d}" stroke-width="5"/>')
    write('art/monsters/golem.svg', svg(512, 512, golem, defs=glow('tg', '#3fe0d0')))

    # jackal
    fur, fur_d = '#3a2f55', '#251d3a'
    jack = (SHADOW +
            limb('M200 400V458', 36, fur_d) + limb('M312 400V458', 36, fur_d) +
            limb('M340 420Q430 430 450 360', 22, fur) +
            f'<path d="M256 230C350 230 362 300 352 360C344 420 310 440 256 440C202 440 168 420 160 360C150 300 162 230 256 230Z" fill="{fur}"/>'
            f'<path d="M156 250Q256 300 356 250L348 300Q256 346 164 300Z" fill="{GOLD}"/>'
            f'<path d="M164 276Q256 322 348 276" stroke="#2f6fb0" stroke-width="10"/>'
            + limb('M166 290L106 380', 30, fur) + limb('M346 290L406 380', 30, fur) +
            f'<path d="M96 384l-10 22M110 388l-2 24M122 384l8 20M396 384l-8 20M410 388l2 24M422 384l10 22" stroke-width="6"/>'
            f'<path d="M180 150L170 28L232 110Z" fill="{fur}"/><path d="M332 150L342 28L280 110Z" fill="{fur}"/>'
            f'<path d="M186 120L180 60L216 108Z" fill="#c2577a" stroke="none"/><path d="M326 120L332 60L296 108Z" fill="#c2577a" stroke="none"/>'
            f'<path d="M256 90C330 90 344 140 330 180L290 252Q256 272 222 252L182 180C168 140 182 90 256 90Z" fill="{fur}"/>'
            f'<ellipse cx="256" cy="250" rx="22" ry="14" fill="{O}"/>'
            f'<path d="M208 158L238 172M304 158L274 172" stroke-width="8"/>'
            f'<ellipse cx="222" cy="176" rx="12" ry="7" fill="#ff5a3c" stroke="none"/><ellipse cx="290" cy="176" rx="12" ry="7" fill="#ff5a3c" stroke="none"/>'
            f'<path d="M240 262L246 280L252 266M272 262L266 280L260 266" fill="#fff" stroke-width="4"/>')
    write('art/monsters/jackal.svg', svg(512, 512, jack))

    # elite pharaoh mummy
    wrap = '#e8dcc0'
    head = 'M256 60Q350 62 360 150L410 330L102 330L152 150Q162 62 256 60Z'
    stripes = ''.join(f'<path d="M80 {y}H440" stroke="#2f6fb0" stroke-width="16"/>' for y in range(100, 340, 36))
    elite = (f'<circle cx="256" cy="230" r="240" fill="url(#pg)" stroke="none"/>'
             f'<ellipse cx="256" cy="480" rx="190" ry="24" fill="{O}" opacity=".25" stroke="none"/>'
             f'<path d="M150 300Q140 420 160 480H352Q372 420 362 300Z" fill="{wrap}"/>'
             f'<path d="M160 350Q256 370 356 340M158 400Q256 420 360 392M160 450Q256 462 356 444" stroke="#b9a77f" stroke-width="6"/>'
             f'<path d="{head}" fill="{GOLD}"/>'
             f'<clipPath id="hc"><path d="{head}"/></clipPath><g clip-path="url(#hc)" stroke="none">{stripes}</g>'
             f'<path d="{head}"/>'
             f'<path d="M196 110H316V250Q256 290 196 250Z" fill="{wrap}"/>'
             f'<path d="M196 150Q256 140 316 156M196 216Q256 226 316 206" stroke="#b9a77f" stroke-width="6"/>'
             f'<path d="M206 168Q256 160 306 168L304 200Q256 192 208 200Z" fill="{O}"/>'
             f'<circle cx="230" cy="184" r="30" fill="url(#eg)" stroke="none"/><circle cx="282" cy="184" r="30" fill="url(#eg)" stroke="none"/>'
             f'<ellipse cx="230" cy="184" rx="11" ry="7" fill="#d8ff9a" stroke="none"/><ellipse cx="282" cy="184" rx="11" ry="7" fill="#d8ff9a" stroke="none"/>'
             f'<path d="{rr(240, 262, 32, 60, 8)}" fill="{GOLD}"/><path d="M240 284H272M240 304H272" stroke="#2f6fb0" stroke-width="6"/>'
             # crown band + uraeus
             f'<path d="M170 106L194 40L226 86L256 20L286 86L318 40L342 106Z" fill="{GOLD}"/>'
             f'<circle cx="256" cy="54" r="10" fill="#d64545" stroke-width="5"/><circle cx="194" cy="66" r="7" fill="#3fe0d0" stroke-width="4"/><circle cx="318" cy="66" r="7" fill="#3fe0d0" stroke-width="4"/>'
             f'<path d="M244 128Q256 92 268 128Q256 140 244 128Z" fill="{GOLD_D}"/>'
             # crossed arms with crook & flail
             + limb('M140 330L330 410', 40, wrap) + limb('M372 330L182 410', 40, wrap) +
             limb('M300 440L300 230Q300 198 330 200Q356 204 350 232', 12, GOLD) +
             limb('M212 440L212 260', 12, GOLD) +
             f'<path d="M212 262L170 300M212 262L188 316M212 262L206 322" stroke="#2f6fb0" stroke-width="10"/>')
    write('art/monsters/elite.svg', svg(512, 512, elite, defs=eye_g + glow('pg', '#9b4dff').replace('.9', '.55')))

    # mimic
    mim = (SHADOW +
           f'<path d="M100 120L120 250H392L412 120Q256 80 100 120Z" fill="{WOOD_L}"/>'
           f'<path d="M106 150Q256 112 406 150" stroke="{GOLD}" stroke-width="14"/>'
           f'<path d="M124 236L150 262L176 236L202 262L228 236L256 262L284 236L310 262L336 236L362 262L388 236Z" fill="#fff" stroke-width="5"/>'
           f'<circle cx="200" cy="176" r="22" fill="#ffe14d"/><circle cx="312" cy="176" r="22" fill="#ffe14d"/>'
           f'<ellipse cx="204" cy="178" rx="5" ry="13" fill="{O}" stroke="none"/><ellipse cx="316" cy="178" rx="5" ry="13" fill="{O}" stroke="none"/>'
           f'<path d="M96 290H416V450H96Z" fill="{WOOD}"/>'
           f'<path d="M110 286Q256 250 402 286L400 300H112Z" fill="#5a1a2a"/>'
           f'<path d="M210 290Q200 400 250 420Q300 430 300 370Q296 330 290 290Z" fill="#e8537a"/>'
           f'<path d="M252 310V380" stroke="#b02a52" stroke-width="5"/>'
           f'<path d="M112 290L138 266L164 290L190 266L216 290M296 290L322 266L348 290L374 266L400 290" fill="#fff" stroke-width="5"/>'
           f'<path d="M96 290H416" stroke-width="8"/>'
           f'<path d="M140 290V450M372 290V450" stroke="{GOLD}" stroke-width="20"/><path d="M140 290V450M372 290V450" stroke="{O}" stroke-width="4" opacity=".4"/>'
           f'<path d="M100 360H210M310 360H412M100 410H412" stroke="#5e3a20" stroke-width="5"/>')
    write('art/monsters/mimic.svg', svg(512, 512, mim))


# ---------------- chests ----------------
def chest_box():
    return (f'<path d="{rr(36, 120, 184, 100, 10)}" fill="{WOOD}"/>'
            f'<path d="M40 160H216M40 190H216" stroke="#5e3a20" stroke-width="4"/>'
            f'<path d="M62 120V220M194 120V220" stroke="{GOLD}" stroke-width="16"/><path d="M62 120V220M194 120V220" stroke="{O}" stroke-width="3" opacity=".35"/>'
            f'<path d="{rr(36, 120, 184, 100, 10)}"/>'
            f'<path d="{rr(110, 112, 36, 44, 6)}" fill="{GOLD}"/><path d="M128 126V142" stroke-width="6"/>')


def chests():
    sh = f'<ellipse cx="128" cy="226" rx="104" ry="14" fill="{O}" opacity=".25" stroke="none"/>'
    closed = (sh + f'<path d="M36 124V96Q36 46 128 46Q220 46 220 96V124Z" fill="{WOOD_L}"/>'
              f'<path d="M62 54V124M194 54V124" stroke="{GOLD}" stroke-width="16"/>'
              f'<path d="M36 124V96Q36 46 128 46Q220 46 220 96V124Z"/>'
              f'<path d="M56 70Q128 56 200 70" stroke="#e0a868" stroke-width="5" opacity=".7"/>'
              + chest_box())
    write('art/chests/chest.svg', svg(256, 256, closed, sw=6))
    rays = ''.join(f'<path d="M128 120L{128+math.sin(a)*130:.0f} {120-math.cos(a)*130:.0f}" stroke="{GOLD_L}" stroke-width="10" opacity=".55"/>'
                   for a in [i * math.pi / 7 - math.pi / 2 + math.pi / 14 for i in range(7)])
    coins = ''.join(f'<ellipse cx="{x}" cy="{y}" rx="14" ry="9" fill="{GOLD}" stroke-width="4"/>' for x, y in
                    ((80, 112), (108, 104), (138, 100), (166, 106), (190, 114), (122, 90), (152, 88)))
    opened = (f'<circle cx="128" cy="116" r="126" fill="url(#cg)" stroke="none"/>' + sh + rays +
              f'<path d="M40 120L56 30H200L216 120Z" fill="{WOOD_L}"/>'
              f'<path d="M50 112L62 44H194L206 112Z" fill="#4a2a1c" stroke-width="4"/>'
              f'<path d="M84 44V112M172 44V112" stroke="{GOLD}" stroke-width="12"/>'
              f'<ellipse cx="128" cy="118" rx="88" ry="22" fill="{GOLD_D}"/>' + coins +
              f'<path d="M150 70l6 14 14 6-14 6-6 14-6-14-14-6 14-6z" fill="#fff" stroke="none"/>'
              + chest_box())
    write('art/chests/chest-open.svg', svg(256, 256, opened, sw=6, defs=glow('cg', '#ffd23f')))


# ---------------- relics ----------------
def relics():
    sh = f'<ellipse cx="128" cy="232" rx="70" ry="10" fill="{O}" opacity=".22" stroke="none"/>'
    shard = (sh + f'<path d="M56 96L128 46L206 80L194 174L118 214L64 178Z" fill="#9c8a78"/>'
             f'<path d="M128 46L136 128L194 174M136 128L64 178" stroke="#7a6a5a" stroke-width="5"/>'
             f'<path d="M84 108Q118 86 152 108Q118 126 84 108Z" stroke="#6b4a33" stroke-width="6"/><circle cx="118" cy="106" r="7" fill="#6b4a33" stroke="none"/>'
             f'<path d="M150 160l20 -10M96 150l10 16" stroke="#6b4a33" stroke-width="5"/>'
             f'<path d="M70 106L124 66" stroke="#c9b8a4" stroke-width="5"/>')
    write('art/relics/shard.svg', svg(256, 256, shard, sw=6))

    ankh = (sh + f'<path d="{ell(128, 76, 46, 54)}{ell(128, 74, 18, 30)}" fill="{BRONZE}" fill-rule="evenodd"/>'
            f'<path d="{rr(52, 124, 152, 30, 10)}" fill="{BRONZE}"/>'
            f'<path d="M112 150H144L156 226H100Z" fill="{BRONZE}"/>'
            f'<path d="M96 60Q100 34 124 28M62 132H120M120 160L114 216" stroke="#f0b070" stroke-width="6" opacity=".8"/>')
    write('art/relics/ankh.svg', svg(256, 256, ankh, sw=6))

    head = 'M44 104Q46 28 128 24Q210 28 212 104L224 214H32Z'
    stripes = ''.join(f'<path d="M20 {y}H240" stroke="#2f6fb0" stroke-width="12"/>' for y in range(50, 220, 26))
    mask = (sh + f'<path d="{head}" fill="{GOLD}"/><clipPath id="c"><path d="{head}"/></clipPath>'
            f'<g clip-path="url(#c)" stroke="none">{stripes}</g><path d="{head}"/>'
            f'<path d="M78 70Q128 54 178 70V150Q170 196 128 200Q86 196 78 150Z" fill="#ffd866"/>'
            f'<path d="M90 106Q106 94 122 106Q106 116 90 106ZM134 106Q150 94 166 106Q150 116 134 106Z" fill="#fff" stroke-width="5"/>'
            f'<circle cx="106" cy="106" r="5" fill="{O}" stroke="none"/><circle cx="150" cy="106" r="5" fill="{O}" stroke="none"/>'
            f'<path d="M86 94L122 94M134 94L170 94M122 106L132 108" stroke-width="5"/>'
            f'<path d="M126 116L120 146H136" stroke="{GOLD_D}" stroke-width="5"/>'
            f'<path d="M112 164Q128 172 144 164" stroke="#a0442a" stroke-width="6"/>'
            f'<path d="{rr(116, 196, 24, 34, 6)}" fill="{GOLD}"/><path d="M116 208H140M116 220H140" stroke="#2f6fb0" stroke-width="4"/>'
            f'<path d="M120 60Q128 40 136 60Q128 66 120 60Z" fill="#d64545" stroke-width="4"/>'
            f'<path d="M92 76Q100 70 110 72" stroke="#fff" stroke-width="5" opacity=".8"/>')
    write('art/relics/mask.svg', svg(256, 256, mask, sw=6))

    can = (f'<circle cx="128" cy="130" r="124" fill="url(#g)" stroke="none"/>' + sh +
           f'<path d="M82 112Q56 196 98 228H158Q200 196 174 112Z" fill="#e6dccb"/>'
           f'<path d="{rr(76, 100, 104, 18, 6)}" fill="#c9b8a4"/>'
           f'<path d="M128 132V210" stroke="#8a4cc8" stroke-width="10"/>'
           f'<path d="M116 146h24M116 172h24M116 196h24" stroke="#8a4cc8" stroke-width="5"/>'
           f'<path d="M90 140Q84 180 100 214" stroke="#fff" stroke-width="6" opacity=".7"/>'
           f'<path d="M96 66L88 14L118 50Z" fill="{PURP_D}"/><path d="M160 66L168 14L138 50Z" fill="{PURP_D}"/>'
           f'<path d="M90 100Q86 46 128 44Q170 46 166 100Z" fill="{PURP_D}"/>'
           f'<path d="M110 104Q128 120 146 104L140 90Q128 96 116 90Z" fill="{PURP_D}"/>'
           f'<ellipse cx="110" cy="70" rx="7" ry="4" fill="#e0a0ff" stroke="none"/><ellipse cx="146" cy="70" rx="7" ry="4" fill="#e0a0ff" stroke="none"/>'
           f'<path d="M98 60Q128 52 158 60" stroke="{GOLD}" stroke-width="5"/>')
    write('art/relics/canopic.svg', svg(256, 256, can, sw=6, defs=glow('g', '#b065ff')))

    rays = ''.join(
        f'<path d="M{128+math.sin(a-.12)*70:.0f} {128-math.cos(a-.12)*70:.0f}L{128+math.sin(a)*124:.0f} {128-math.cos(a)*124:.0f}L{128+math.sin(a+.12)*70:.0f} {128-math.cos(a+.12)*70:.0f}Z" fill="#ff8a1f" stroke-width="4"/>'
        for a in [i * math.pi / 6 for i in range(12)])
    eye = (f'<circle cx="128" cy="128" r="128" fill="url(#g)" stroke="none"/>' + rays +
           f'<circle cx="128" cy="128" r="82" fill="#ffb83f"/><circle cx="128" cy="128" r="66" fill="#ffd866" stroke="none"/>'
           f'<path d="M62 124Q128 74 194 124Q128 160 62 124Z" fill="#fff4d6" stroke-width="8"/>'
           f'<circle cx="128" cy="120" r="20" fill="#2f6fb0" stroke-width="6"/><circle cx="128" cy="120" r="9" fill="{O}" stroke="none"/>'
           f'<circle cx="134" cy="114" r="4" fill="#fff" stroke="none"/>'
           f'<path d="M58 96Q128 56 200 92" stroke-width="12"/>'
           f'<path d="M106 148L100 196" stroke-width="10"/>'
           f'<path d="M146 146Q170 196 196 184Q210 172 194 162" stroke-width="9"/>'
           f'<path d="M190 124L208 120" stroke-width="10"/>')
    write('art/relics/eye-of-ra.svg', svg(256, 256, eye, sw=6, defs=glow('g', '#ff9a2f')))


# ---------------- items ----------------
def items():
    sh = f'<ellipse cx="128" cy="236" rx="70" ry="10" fill="{O}" opacity=".22" stroke="none"/>'
    pot = (sh + f'<clipPath id="c"><circle cx="128" cy="162" r="70"/></clipPath>'
           f'<path d="{rr(106, 52, 44, 54, 6)}" fill="#d8eef0"/>'
           f'<circle cx="128" cy="162" r="70" fill="#d8eef0"/>'
           f'<path d="M50 150Q90 134 128 150Q166 166 206 150V240H50Z" fill="#d63a3a" clip-path="url(#c)" stroke="none"/>'
           f'<circle cx="128" cy="162" r="70"/>'
           f'<path d="{rr(100, 32, 56, 28, 8)}" fill="{WOOD_L}"/>'
           f'<path d="M86 136Q90 112 112 104" stroke="#fff" stroke-width="8" opacity=".85"/>'
           f'<path d="M128 166V206M108 186H148" stroke="#fff" stroke-width="12"/>')
    write('art/items/potion-hp.svg', svg(256, 256, pot, sw=6))

    bottle = 'M108 30H148V80Q186 96 186 136V212Q186 228 170 228H86Q70 228 70 212V136Q70 96 108 80Z'
    tonic = (sh + f'<clipPath id="c"><path d="{bottle}"/></clipPath>'
             f'<path d="{bottle}" fill="#e2f2e4"/>'
             f'<path d="M60 120Q128 104 196 120V240H60Z" fill="#4cc46a" clip-path="url(#c)" stroke="none"/>'
             f'<path d="{bottle}"/><path d="{rr(100, 20, 56, 24, 6)}" fill="{WOOD_L}"/>'
             f'<path d="{rr(90, 140, 76, 62, 8)}" fill="#f3e3bf" stroke-width="5"/>'
             f'<path d="M134 146L112 176H128L120 198L146 164H130Z" fill="{GOLD}" stroke-width="4"/>'
             f'<path d="M84 128Q86 104 106 94" stroke="#fff" stroke-width="7" opacity=".8"/>')
    write('art/items/tonic.svg', svg(256, 256, tonic, sw=6))

    armor = (sh + f'<path d="M72 50Q128 70 184 50L214 72L202 120L184 112V210Q128 236 72 210V112L54 120L42 72Z" fill="{BRONZE}"/>'
             f'<path d="M100 56Q128 92 156 56" fill="#8a4f22"/>'
             f'<path d="M128 86V214M86 140Q128 160 170 140M86 176Q128 196 170 176" stroke="#8a4f22" stroke-width="6"/>'
             f'<path d="M42 72L72 50L74 100L54 120ZM214 72L184 50L182 100L202 120Z" fill="#e0a060" stroke-width="5"/>'
             + ''.join(f'<circle cx="{x}" cy="{y}" r="5" fill="{GOLD}" stroke-width="3"/>' for x, y in ((88, 100), (168, 100), (88, 200), (168, 200)))
             + f'<path d="M92 112Q96 150 92 190" stroke="#f0b070" stroke-width="6" opacity=".8"/>')
    write('art/items/armor.svg', svg(256, 256, armor, sw=6))

    blade = (sh + '<g transform="rotate(45 128 128)">'
             f'<path d="M116 170V40L128 14L140 40V170Z" fill="{STEEL}"/>'
             f'<path d="M128 34V164" stroke="{STEEL_D}" stroke-width="5"/>'
             f'<path d="M120 44V160" stroke="#fff" stroke-width="4" opacity=".8"/>'
             f'<path d="{rr(82, 168, 92, 20, 8)}" fill="{BRONZE}"/>'
             f'<path d="{rr(118, 186, 20, 46, 6)}" fill="{WOOD}"/>'
             f'<path d="M118 198H138M118 212H138" stroke-width="4"/>'
             f'<circle cx="128" cy="240" r="12" fill="{BRONZE}"/></g>')
    write('art/items/blade.svg', svg(256, 256, blade, sw=6))


# ---------------- cards ----------------
def cards():
    W, H = 300, 420
    win = rr(26, 52, 248, 168, 10)
    for name, trim, light, dark in (('attack', '#b8342f', '#e86a5a', '#6e1c22'),
                                    ('skill', '#1f7a78', '#4fc1b8', '#123f44'),
                                    ('signature', GOLD_D, GOLD_L, '#6a4a14')):
        b = (f'<path d="{rr(4, 4, 292, 412, 22)}{win}" fill="{trim}" fill-rule="evenodd"/>'
             f'<path d="{rr(14, 14, 272, 392, 14)}{win}" fill="{PURP_D}" fill-rule="evenodd" stroke="{dark}" stroke-width="4"/>'
             f'<path d="{win}" stroke="{light}" stroke-width="6"/>'
             f'<path d="{rr(20, 226, 260, 30, 8)}" fill="{light}" stroke-width="5"/>'
             f'<path d="{rr(26, 262, 248, 134, 10)}" fill="#f3e3bf" stroke-width="5"/>'
             f'<path d="M150 400l8 8-8 8-8-8z" fill="{light}" stroke-width="3"/>'
             f'<circle cx="38" cy="38" r="26" fill="{GOLD}" stroke-width="6"/><circle cx="38" cy="38" r="17" fill="#ffe14d" stroke="{GOLD_D}" stroke-width="3"/>')
        if name == 'signature':
            corners = ''
            for x, y, sx, sy in ((300, 0, -1, 1), (0, 420, 1, -1), (300, 420, -1, -1)):
                corners += (f'<g transform="translate({x} {y}) scale({sx} {sy})">'
                            f'<path d="M8 50Q8 8 50 8Q36 26 40 40Q26 36 8 50Z" fill="{GOLD_L}" stroke-width="4"/>'
                            f'<circle cx="26" cy="26" r="7" fill="#d64545" stroke-width="3"/></g>')
            b += (corners +
                  f'<path d="M110 8Q150 -6 190 8L182 22Q150 12 118 22Z" fill="{GOLD_L}" stroke-width="4"/>'
                  f'<circle cx="150" cy="16" r="8" fill="#3fe0d0" stroke-width="3"/>'
                  f'<path d="M14 240h-8M294 240h-8" stroke-width="5"/>'
                  f'<path d="M30 270L40 262M270 270L260 262M30 388L40 396M270 388L260 396" stroke="{GOLD_D}" stroke-width="4"/>')
        write(f'art/cards/frame-{name}.svg', svg(W, H, b, sw=6))


# ---------------- icons ----------------
def icons():
    I = {
        'stamina': f'<path d="M38 4L12 36H28L22 60L52 24H36L42 4Z" fill="#ffd23f"/><path d="M34 12L22 30" stroke="#fff6b0" stroke-width="3"/>',
        'hp': f'<path d="M32 56C10 40 4 28 8 18C12 8 26 6 32 18C38 6 52 8 56 18C60 28 54 40 32 56Z" fill="#e64a4a"/><path d="M16 20Q18 14 24 14" stroke="#ffb0b0" stroke-width="4"/>',
        'block': f'<path d="M32 4L56 12V30Q56 50 32 60Q8 50 8 30V12Z" fill="#7f9cc0"/><path d="M32 12V52M16 20V30Q16 42 32 50" stroke="#c8d8ec" stroke-width="3"/>',
        'intent-attack': (f'<path d="M48 6H58V16L26 48L16 38Z" fill="{STEEL}"/><path d="M50 14L24 40" stroke="#fff" stroke-width="2"/>'
                          f'<path d="M10 34L30 54" stroke-width="10"/><path d="M10 34L30 54" stroke="#d64545" stroke-width="4"/>'
                          f'<path d="M18 46L8 56" stroke-width="10"/><path d="M18 46L8 56" stroke="{WOOD}" stroke-width="4"/>'),
        'intent-defend': f'<path d="M32 4L56 12V30Q56 50 32 60Q8 50 8 30V12Z" fill="#7f9cc0"/><path d="M32 46V20M22 30L32 20L42 30" stroke="#fff" stroke-width="6"/>',
        'intent-heal': f'<path d="M24 6H40V24H58V40H40V58H24V40H6V24H24Z" fill="#4cc46a"/><path d="M28 12V28H12" stroke="#bff0c8" stroke-width="3"/>',
        'sol': (f'<circle cx="32" cy="32" r="27" fill="url(#g)"/><circle cx="32" cy="32" r="19" stroke="#fff" stroke-width="3" opacity=".6"/>'
                f'<path d="M32 18L36 28L46 32L36 36L32 46L28 36L18 32L28 28Z" fill="#fff" stroke-width="3"/>'),
    }
    for k, v in I.items():
        d = linear('g', [(0, '#3fe0d0'), (1, '#8a4cc8')], 1, 1) if k == 'sol' else ''
        write(f'art/icons/{k}.svg', svg(64, 64, v, sw=4, defs=d))


# ---------------- npc ----------------
def npc():
    skin, khaki, khaki_d = '#e8b894', '#c8b07a', '#9a8456'
    b = (SHADOW +
         limb('M226 400V456', 30, khaki_d) + limb('M286 400V456', 30, khaki_d) +
         f'<path d="{rr(196, 446, 50, 24, 10)}" fill="{WOOD}"/><path d="{rr(266, 446, 50, 24, 10)}" fill="{WOOD}"/>'
         f'<path d="M186 270Q256 250 326 270L338 410H174Z" fill="{khaki}"/>'
         f'<path d="M256 262V410M174 380H338" stroke="{khaki_d}" stroke-width="6"/>'
         f'<path d="{rr(172, 370, 168, 20, 4)}" fill="{WOOD}" stroke-width="6"/><path d="{rr(244, 368, 24, 24, 4)}" fill="{GOLD}" stroke-width="5"/>'
         f'<path d="M196 274L320 380" stroke="{WOOD}" stroke-width="12"/>'
         + limb('M190 290L150 380', 24, khaki) + f'<circle cx="148" cy="388" r="16" fill="{skin}"/>'
         + f'<path d="{rr(126, 380, 46, 60, 6)}" fill="#a0442a"/><path d="M134 392H164" stroke="{GOLD}" stroke-width="5"/>'
         + limb('M322 290L370 250', 24, khaki) +
         f'<circle cx="256" cy="200" r="78" fill="{skin}"/>'
         f'<circle cx="226" cy="204" r="8" fill="{O}" stroke="none"/><circle cx="286" cy="204" r="8" fill="{O}" stroke="none"/>'
         f'<path d="M210 186L240 182M272 182L302 186" stroke-width="7"/>'
         f'<path d="M224 236Q240 224 256 234Q272 224 288 236Q272 250 256 242Q240 250 224 236Z" fill="#7a4a2e" stroke-width="5"/>'
         f'<circle cx="214" cy="226" r="10" fill="#ff8fa3" opacity=".5" stroke="none"/><circle cx="298" cy="226" r="10" fill="#ff8fa3" opacity=".5" stroke="none"/>'
         f'<ellipse cx="256" cy="160" rx="120" ry="24" fill="#e0d0a0"/>'
         f'<path d="M176 158Q176 70 256 68Q336 70 336 158Z" fill="#e0d0a0"/>'
         f'<path d="M178 142Q256 128 334 142" stroke="{WOOD}" stroke-width="12"/>'
         f'<path d="M256 70V130" stroke="#b8a878" stroke-width="5"/>'
         # magnifying glass
         + limb('M372 250L420 196', 14, WOOD) +
         f'<circle cx="376" cy="248" r="20" fill="{skin}"/>'
         f'<circle cx="444" cy="150" r="54" fill="#bfe8f0" fill-opacity=".55"/><circle cx="444" cy="150" r="54" stroke="{GOLD_D}" stroke-width="14"/><circle cx="444" cy="150" r="61"/><circle cx="444" cy="150" r="47"/>'
         f'<path d="M418 128Q426 110 446 106" stroke="#fff" stroke-width="7"/>')
    write('art/npc/archaeologist.svg', svg(512, 512, b))


# ---------------- backgrounds ----------------
def stars(n, w, h, seed):
    r = random.Random(seed)
    return ''.join(f'<circle cx="{r.randint(0, w)}" cy="{r.randint(0, h)}" r="{r.choice((2, 2, 3, 4))}" fill="#fff" opacity="{r.choice((.4, .6, .9))}"/>' for _ in range(n))


def pyramid(cx, base, half, h, lit, dark, lines=True):
    ax, ay = cx, base - h
    s = (f'<path d="M{ax} {ay}L{cx-half} {base}H{cx+half*0.35:.0f}Z" fill="{lit}"/>'
         f'<path d="M{ax} {ay}L{cx+half*0.35:.0f} {base}H{cx+half}Z" fill="{dark}"/>')
    if lines:
        for i in range(1, 9):
            y = ay + h * i / 9
            t = i / 9
            s += f'<path d="M{ax-half*t:.0f} {y:.0f}L{ax+half*0.35*t:.0f} {y:.0f}L{ax+half*t:.0f} {y:.0f}" stroke="{O}" stroke-width="3" opacity=".25"/>'
    return s


def bgs():
    W, H = 1080, 1920
    # title
    sky = linear('sky', [(0, '#1d1033'), (.35, '#4a2c5e'), (.6, '#c2577a'), (.74, '#f2a65a')])
    t = (f'<rect width="{W}" height="{H}" fill="url(#sky)"/>' + stars(70, W, 900, 1) +
         f'<circle cx="540" cy="1250" r="260" fill="url(#sun)"/><circle cx="540" cy="1250" r="150" fill="#ffd27a" opacity=".9"/>'
         + pyramid(150, 1430, 220, 280, '#7a4c8c', '#4a2c5e', False) + pyramid(960, 1430, 200, 250, '#7a4c8c', '#4a2c5e', False) +
         pyramid(540, 1460, 470, 640, '#d9a865', '#7a4a2e') +
         f'<path d="M540 820L578 870H502Z" fill="{GOLD}" stroke-width="5"/>'
         f'<path d="M500 1460V1380Q540 1340 580 1380V1460Z" fill="{PURP_D}" stroke="{O}" stroke-width="6"/>'
         f'<path d="M0 1450Q300 1400 600 1460T1080 1440V1920H0Z" fill="#c98a4a"/>'
         f'<path d="M0 1600Q360 1520 700 1610T1080 1580V1920H0Z" fill="#a8693a"/>'
         f'<path d="M0 1760Q300 1700 620 1770T1080 1740V1920H0Z" fill="#6e3f2c"/>')
    write('art/bg/title.svg', svg(W, H, t, sw=0, defs=sky + glow('sun', '#ffb35a')))

    # room
    bricks = (f'<pattern id="br" width="180" height="180" patternUnits="userSpaceOnUse">'
              f'<rect width="180" height="180" fill="#7a5236"/>'
              f'<path d="M0 90H180M0 180H180M90 0V90M0 90V180M180 90V180" stroke="#4e3322" stroke-width="5"/></pattern>')
    glyphs = (f'<pattern id="gl" width="180" height="120" patternUnits="userSpaceOnUse">'
              f'<rect width="180" height="120" fill="#9a6e42"/>'
              f'<path d="M20 60Q45 40 70 60Q45 76 20 60ZM110 30V90M95 45H125M140 80Q150 60 160 80" stroke="#4e3322" stroke-width="6"/>'
              f'<circle cx="45" cy="60" r="6" fill="#4e3322"/></pattern>')
    vig = radial('vg', [(.5, '#000', 0), (1, '#000', .65)])
    floor = ''.join(f'<path d="M{540+(x-540)*250/1020:.0f} 1150L{x} 1920" stroke="#3a2418" stroke-width="5"/>' for x in range(-900, 2000, 180))
    floor += ''.join(f'<path d="M0 {y}H1080" stroke="#3a2418" stroke-width="5"/>' for y in (1190, 1250, 1340, 1470, 1650, 1880))

    def torch(x):
        return (f'<circle cx="{x}" cy="660" r="260" fill="url(#tg)"/>'
                f'<path d="M{x-14} 700L{x-24} 640H{x+24}L{x+14} 700Z" fill="{WOOD}" stroke="{O}" stroke-width="6"/>'
                f'<path d="M{x} 520Q{x+40} 590 {x+24} 640H{x-24}Q{x-40} 590 {x} 520Z" fill="#ff7a2a" stroke="{O}" stroke-width="6"/>'
                f'<path d="M{x} 570Q{x+18} 610 {x+10} 636H{x-10}Q{x-18} 610 {x} 570Z" fill="#ffe14d"/>'
                f'<rect x="{x-40}" y="700" width="80" height="16" rx="6" fill="#4e3322" stroke="{O}" stroke-width="6"/>')
    r = (f'<rect width="{W}" height="1150" fill="url(#br)"/>'
         f'<rect y="280" width="{W}" height="120" fill="url(#gl)"/><path d="M0 280H1080M0 400H1080" stroke="{GOLD_D}" stroke-width="10"/>'
         f'<path d="M400 1150V760Q540 640 680 760V1150Z" fill="#1a1020" stroke="#4e3322" stroke-width="16"/>'
         f'<path d="M0 1150H1080V1920H0Z" fill="#5a3a28"/>' + floor +
         f'<path d="M0 1150H1080" stroke="{O}" stroke-width="10"/>'
         f'<ellipse cx="540" cy="1460" rx="420" ry="130" fill="url(#sg)"/>'
         f'<ellipse cx="540" cy="1460" rx="360" ry="100" fill="#a87a4a" opacity=".55" stroke="{GOLD_D}" stroke-width="6"/>'
         + torch(170) + torch(910) +
         f'<rect width="{W}" height="{H}" fill="url(#vg)"/>')
    write('art/bg/room.svg', svg(W, H, r, sw=0, defs=bricks + glyphs + vig + glow('tg', '#ff9a3c') + glow('sg', '#ffd27a')))

    # camp
    sky = linear('sky', [(0, '#120a24'), (.45, '#3a2350'), (.62, '#6a3f5e')])
    fire_x, fire_y = 720, 1520
    c = (f'<rect width="{W}" height="{H}" fill="url(#sky)"/>' + stars(90, W, 1000, 2) +
         f'<circle cx="840" cy="300" r="90" fill="#fff4d6"/><circle cx="880" cy="270" r="84" fill="#120a24"/>'
         + pyramid(300, 1180, 240, 300, '#3a2350', '#2b1a3d', False) +
         f'<path d="M0 1170Q400 1110 760 1180T1080 1160V1920H0Z" fill="#4a3040"/>'
         f'<path d="M0 1500Q400 1440 1080 1520V1920H0Z" fill="#3a2433"/>'
         f'<circle cx="{fire_x}" cy="{fire_y}" r="520" fill="url(#fg)"/>'
         # tent
         f'<path d="M60 1420L330 900L600 1420Z" fill="#c8b07a" stroke="{O}" stroke-width="10"/>'
         f'<path d="M330 900L600 1420H660L380 900Z" fill="#9a8456" stroke="{O}" stroke-width="10"/>'
         f'<path d="M330 1060L250 1420H410Z" fill="#2b1a3d" stroke="{O}" stroke-width="8"/>'
         f'<path d="M330 1060L300 1420L240 1400Z" fill="#e0d0a0" stroke="{O}" stroke-width="6"/>'
         f'<path d="M330 900V860M60 1420L10 1460M600 1420L660 1470" stroke="{O}" stroke-width="8"/>'
         # crates
         f'<path d="{rr(860, 1300, 150, 130, 8)}" fill="{WOOD_L}" stroke="{O}" stroke-width="8"/>'
         f'<path d="M860 1300L1010 1430M1010 1300L860 1430" stroke="#5e3a20" stroke-width="8"/>'
         f'<path d="{rr(900, 1210, 100, 90, 8)}" fill="{WOOD}" stroke="{O}" stroke-width="8"/>'
         # logs to sit
         f'<path d="{rr(420, 1600, 200, 50, 24)}" fill="{WOOD}" stroke="{O}" stroke-width="8"/>'
         f'<path d="{rr(820, 1620, 200, 50, 24)}" fill="{WOOD}" stroke="{O}" stroke-width="8"/>'
         # fire
         f'<path d="M{fire_x-90} {fire_y+40}L{fire_x+90} {fire_y-10}M{fire_x-90} {fire_y-10}L{fire_x+90} {fire_y+40}" stroke="{O}" stroke-width="40"/>'
         f'<path d="M{fire_x-90} {fire_y+40}L{fire_x+90} {fire_y-10}M{fire_x-90} {fire_y-10}L{fire_x+90} {fire_y+40}" stroke="{WOOD}" stroke-width="26"/>'
         f'<path d="M{fire_x} {fire_y-200}Q{fire_x+100} {fire_y-60} {fire_x+60} {fire_y+10}H{fire_x-60}Q{fire_x-100} {fire_y-60} {fire_x} {fire_y-200}Z" fill="#e8462a" stroke="{O}" stroke-width="8"/>'
         f'<path d="M{fire_x+10} {fire_y-140}Q{fire_x+70} {fire_y-40} {fire_x+36} {fire_y+6}H{fire_x-36}Q{fire_x-64} {fire_y-50} {fire_x+10} {fire_y-140}Z" fill="#ff9a2f"/>'
         f'<path d="M{fire_x} {fire_y-80}Q{fire_x+34} {fire_y-20} {fire_x+16} {fire_y+6}H{fire_x-16}Q{fire_x-34} {fire_y-20} {fire_x} {fire_y-80}Z" fill="#ffe14d"/>'
         + ''.join(f'<path d="M{fire_x+math.cos(a)*120:.0f} {fire_y+20+math.sin(a)*40:.0f}a26 18 0 1 0 1 0" fill="#7a6a5a" stroke="{O}" stroke-width="6"/>' for a in [i * math.pi / 4 for i in range(8)]))
    write('art/bg/camp.svg', svg(W, H, c, sw=0, defs=sky + glow('fg', '#ff8a2a').replace('.9', '.6')))


def corridor():
    W, H = 2160, 1920
    far = (f'<pattern id="br" width="240" height="240" patternUnits="userSpaceOnUse"><rect width="240" height="240" fill="#4a3330"/>'
           f'<path d="M0 120H240M0 240H240M120 0V120M0 120V240M240 120V240" stroke="#2e1f1e" stroke-width="6"/></pattern>'
           f'<pattern id="gl" width="360" height="300" patternUnits="userSpaceOnUse"><rect width="360" height="300" fill="#5a3e34"/>'
           f'<g stroke="#9a6e42" stroke-width="10" opacity=".8">'
           f'<path d="M30 150Q70 115 110 150Q70 180 30 150Z"/><circle cx="70" cy="150" r="10" fill="#9a6e42"/><path d="M70 172V210M90 168Q110 200 128 192"/>'
           f'<path d="M180 80Q160 80 160 104Q160 128 180 128Q200 128 200 104Q200 80 180 80ZM150 140H210M180 140V230"/>'
           f'<path d="M250 120Q270 90 300 110L320 130L290 140L300 220M270 220L280 150"/>'
           f'<path d="M20 260Q50 240 80 260T140 260T200 260T260 260T320 260"/></g></pattern>'
           f'<pattern id="fl" width="240" height="420" patternUnits="userSpaceOnUse"><rect width="240" height="420" fill="#2a1c1a"/>'
           f'<path d="M0 0V420M0 140H240M0 300H240" stroke="#1a1012" stroke-width="6"/></pattern>'
           + linear('dk', [(0, '#000'), (1, '#000')]))
    fbody = (f'<rect width="{W}" height="{H}" fill="url(#br)"/>'
             f'<rect y="640" width="{W}" height="300" fill="url(#gl)"/>'
             f'<path d="M0 640H{W}M0 940H{W}" stroke="#7a5236" stroke-width="12"/>'
             f'<rect width="{W}" height="260" fill="#22161f"/><path d="M0 260H{W}" stroke="#140d14" stroke-width="12"/>'
             f'<rect y="1500" width="{W}" height="420" fill="url(#fl)"/><path d="M0 1500H{W}" stroke="#140d14" stroke-width="12"/>'
             f'<rect width="{W}" height="{H}" fill="#120a1a" opacity=".35"/>')
    write('art/bg/corridor-far.svg', svg(W, H, fbody, sw=0, defs=far))

    def pillar(cx):
        return (f'<circle cx="{cx}" cy="820" r="320" fill="url(#tg)" stroke="none"/>'
                f'<path d="M{cx-80} 300H{cx+80}V1540H{cx-80}Z" fill="#9a6a42"/>'
                f'<path d="M{cx-40} 330V1510M{cx} 330V1510M{cx+40} 330V1510" stroke="#6e4a2e" stroke-width="8"/>'
                f'<path d="M{cx-120} 250H{cx+120}L{cx+90} 310H{cx-90}Z" fill="#b8844e"/>'
                f'<path d="M{cx-110} 1540H{cx+110}V1590H{cx-110}Z" fill="#b8844e"/>'
                f'<path d="M{cx-80} 420H{cx+80}M{cx-80} 450H{cx+80}" stroke="{GOLD_D}" stroke-width="14"/>'
                f'<path d="M{cx-14} 900L{cx-26} 840H{cx+26}L{cx+14} 900Z" fill="{WOOD}"/>'
                f'<path d="M{cx} 720Q{cx+44} 790 {cx+26} 840H{cx-26}Q{cx-44} 790 {cx} 720Z" fill="#ff7a2a"/>'
                f'<path d="M{cx} 770Q{cx+20} 810 {cx+12} 838H{cx-12}Q{cx-20} 810 {cx} 770Z" fill="#ffe14d" stroke="none"/>')
    beam = (f'<path d="M0 200H{W}V260H0Z" fill="#6e4a2e"/>' +
            ''.join(f'<path d="M{x} 200V260" stroke-width="8"/>' for x in range(0, W + 1, 540)))
    mid = beam + ''.join(pillar(x) for x in (270, 810, 1350, 1890))
    write('art/bg/corridor-mid.svg', svg(W, H, mid, sw=8, defs=glow('tg', '#ff9a3c').replace('.9', '.5')))

    sil = '#140d1c'

    def big(cx):
        return (f'<path d="M{cx-130} 0H{cx+130}V1920H{cx-130}Z" fill="{sil}"/>'
                f'<path d="M{cx-170} 0H{cx+170}V90H{cx-170}Z" fill="{sil}"/>'
                f'<path d="M{cx+124} 100V1920" stroke="#ff9a3c" stroke-width="8" opacity=".35"/>')

    def rubble(cx, seed):
        r = random.Random(seed)
        s = ''
        for i in range(9):
            x = cx + r.randint(-150, 150)
            w = r.randint(50, 110)
            h = r.randint(40, 80)
            s += f'<path d="M{x-w//2} 1920L{x-w//2+10} {1920-h}L{x+w//3} {1920-h-14}L{x+w//2} {1920-h//3}L{x+w//2} 1920Z" fill="{sil}" stroke="#2e1f2e" stroke-width="6"/>'
        return s
    near = (big(540) + big(1620) + rubble(1080, 3) + rubble(200, 4) + rubble(1950, 5) +
            f'<path d="M1300 1920L1330 1760L1480 1740L1500 1920Z" fill="{sil}"/>'
            f'<path d="M1080 0Q1100 120 1090 240M1110 0Q1130 80 1124 160" stroke="#2e1f2e" stroke-width="6"/>')
    write('art/bg/corridor-near.svg', svg(W, H, near, sw=0))


def thumb():
    W, H = 640, 360
    sky = linear('sky', [(0, '#2b1a3d'), (.55, '#7a3f6e'), (1, '#f2a65a')])
    body = (f'<rect width="{W}" height="{H}" fill="url(#sky)"/>' + stars(30, W, 150, 7) +
            f'<circle cx="470" cy="230" r="70" fill="#ffd27a" opacity=".9"/>'
            + pyramid(480, 300, 170, 200, '#d9a865', '#7a4a2e') +
            f'<path d="M0 290Q200 260 400 300T640 290V360H0Z" fill="#a8693a"/>'
            f'<path d="M0 330Q240 310 640 335V360H0Z" fill="#6e3f2c"/>'
            f'<circle cx="330" cy="280" r="80" fill="url(#cg)"/>'
            f'<g transform="translate(272 220) scale(.45)" stroke-width="6">'
            f'<path d="M40 120L56 30H200L216 120Z" fill="{WOOD_L}"/><path d="M50 112L62 44H194L206 112Z" fill="#4a2a1c" stroke-width="4"/>'
            f'<ellipse cx="128" cy="118" rx="88" ry="22" fill="{GOLD}"/>{chest_box()}</g>'
            + monster(s=.42, tx=40, ty=150) +
            f'<text x="320" y="92" text-anchor="middle" font-family="Impact, \'Arial Black\', sans-serif" font-weight="900" font-size="76" '
            f'fill="{GOLD}" stroke="{O}" stroke-width="10" paint-order="stroke" letter-spacing="4">TOMB DELVE</text>')
    write('thumb.svg', svg(W, H, body, sw=8, defs=sky + glow('cg', '#ffd23f')))


chars(); monsters(); chests(); relics(); items(); cards(); icons(); npc(); bgs(); corridor(); thumb()
