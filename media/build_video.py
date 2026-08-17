#!/usr/bin/env python3
"""Assembles the Confidential Mafia demo video.

Inputs (all produced by earlier steps, nothing synthetic):
  /tmp/demo/raw.fix.webm   real screen recording: lobby -> join -> assign roles
  /tmp/demo/seg2.fix.webm  real screen recording: role reveal -> night -> settle
  /tmp/vo/NN.wav           piper TTS narration, one file per script line

Output:
  /tmp/demo/out/confidential-mafia-demo.mp4  (burned-in subtitles)
  /tmp/demo/out/confidential-mafia-demo.srt  (separate subtitle track)

Layout: 1920x1080. Segments backed by footage put the portrait app capture on
the left and a key-point panel on the right; segments explaining code or agent
behaviour are full-frame cards, because code needs the width to be legible.
"""

import json
import os
import shlex
import subprocess
import textwrap

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
BG = (6, 11, 26)
PANEL_BG = (10, 17, 38)
BLUE = (54, 115, 245)
CYAN = (120, 190, 255)
TEXT = (196, 214, 240)
DIM = (120, 140, 175)
GREEN = (110, 220, 160)
AMBER = (235, 190, 90)

MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
MONO_B = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

OUT = "/tmp/demo/out"
SEG = "/tmp/demo/segs"
CARDS = "/tmp/demo/cards"
for d in (OUT, SEG, CARDS):
    os.makedirs(d, exist_ok=True)

NARR = json.load(open("/sessions/funny-sharp-mccarthy/mnt/outputs/narration.json"))


def run(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"FAILED: {cmd}\n{r.stderr[-2500:]}")
    return r.stdout


def dur(path):
    return float(
        run(f'ffprobe -v error -show_entries format=duration -of csv=p=0 {shlex.quote(path)}').strip()
    )


def f(size, bold=False):
    return ImageFont.truetype(MONO_B if bold else MONO, size)


# --------------------------------------------------------------------------
# Panels: the right-hand column shown next to real footage.
# --------------------------------------------------------------------------
def panel(path, title, lines, w=1010, h=850):
    img = Image.new("RGB", (w, h), PANEL_BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], outline=(26, 44, 88), width=2)
    d.rectangle([0, 0, 5, h - 1], fill=BLUE)

    y = 46
    for ln in textwrap.wrap(title.upper(), 34):
        d.text((40, y), ln, font=f(40, True), fill=CYAN)
        y += 52
    y += 26

    for ln in lines:
        if ln == "":
            y += 20
            continue
        col, fnt, ind = TEXT, f(28), 40
        if ln.startswith("# "):
            col, fnt, ln = DIM, f(25), ln[2:]
        elif ln.startswith("+ "):
            col, ln, ind = GREEN, "• " + ln[2:], 40
        elif ln.startswith("! "):
            col, ln = AMBER, ln[2:]
        elif ln.startswith("` "):
            col, fnt, ln, ind = CYAN, f(26), ln[2:], 56
        for seg in textwrap.wrap(ln, 44) or [""]:
            d.text((ind, y), seg, font=fnt, fill=col)
            y += 38
        y += 6
    img.save(path)
    return path


# --------------------------------------------------------------------------
# Cards: full-frame, used for code and terminal output.
# --------------------------------------------------------------------------
def card(path, title, body, kind="code", footer=None):
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([60, 30, W - 60, H - 230], fill=PANEL_BG, outline=(26, 44, 88), width=2)
    d.rectangle([60, 30, 66, H - 230], fill=BLUE)

    d.text((110, 62), title, font=f(38, True), fill=CYAN)
    y = 138

    size = 30 if kind == "code" else 28
    for ln in body:
        col = TEXT
        s = ln
        if kind == "code":
            if s.strip().startswith("//"):
                col = DIM
            elif any(k in s for k in ("e.le", "e.eq", "e.select", "e.add", "e.or", "e.gt",
                                      "e.and", "e.not", "e.reveal", "verifyDecryption",
                                      "euint256", "ebool", "attestedDecrypt")):
                col = GREEN
        else:
            if "Mafia" in s or "MAFIA" in s:
                col = AMBER
            elif s.strip().startswith("["):
                col = CYAN
            elif s.strip().startswith("#"):
                col = DIM
        d.text((110, y), s, font=f(size), fill=col)
        y += size + 14

    if footer:
        d.text((110, H - 330), footer, font=f(24), fill=DIM)
    img.save(path)
    return path


# --------------------------------------------------------------------------
# Storyboard. (src, start) uses real footage; (None, None) means use a card.
# Crop 1000x1400@(400,160) is the app's content column in the 1800x2800 capture.
# --------------------------------------------------------------------------
board = {
    "01": dict(src="raw", t=2, kind="panel", title="Confidential Mafia",
               lines=["# social deduction on Base",
                      "+ hidden roles",
                      "+ hidden night actions",
                      "+ AI narrator and AI players",
                      "",
                      "` Base Sepolia + Inco Lightning",
                      "` Telegram Mini App"]),
    "02": dict(src="raw", t=4, kind="panel", title="The problem",
               lines=["Mafia only works if nobody knows who the Mafia is.",
                      "",
                      "! On a public chain every move is visible.",
                      "",
                      "# A naive on-chain Mafia leaks the roles, the kill, and the save."]),
    "03": dict(src="raw", t=12, kind="panel", title="Roles dealt encrypted",
               lines=["+ players join with a wallet",
                      "+ roles shuffled and dealt on Inco",
                      "+ stored as euint256 handles",
                      "",
                      "` assignRoles()",
                      "` _newShuffledDeck(n) / _dealTo(p)"]),
    "04": dict(src="seg2", t=1, kind="panel", title="You decrypt only your own role",
               lines=["Inco enforces this per handle.",
                      "",
                      "! No server. No operator. No other player.",
                      "",
                      "# The same code pointed at someone else's handle simply fails."]),
    "05": dict(src="seg2", t=17, kind="panel", title="Attested decrypt",
               lines=["` roleHandleOf(me)",
                      "` zap.attestedDecrypt(wallet, [handle])",
                      "",
                      "+ signed by the player's own key",
                      "+ resolved in the browser",
                      "",
                      "# The role never exists in plaintext anywhere else."]),
    "06": dict(src="seg2", t=26, kind="panel", title="Every player sends the same move",
               lines=["` submitNightAction(targetIndex)",
                      "",
                      "+ Mafia kill",
                      "+ Doctor save",
                      "+ Villager no-op",
                      "",
                      "! Identical on chain."]),
    "07": dict(src="seg2", t=33, kind="panel", title="Nothing leaks the role",
               lines=["An observer sees that you acted, and who you pointed at.",
                      "",
                      "! Not what it meant. Not whether it did anything.",
                      "",
                      "# This is the channel a transparent chain normally leaks through."]),
    "08": dict(kind="code", title="submitNightAction  —  the branch stays encrypted",
               body=["euint256 role   = roleOf[msg.sender];",
                     "ebool  isMafia  = e.le(role, e.asEuint256(mafiaCount));",
                     "ebool  isDoctor = e.eq(role, e.asEuint256(mafiaCount + 1));",
                     "",
                     "// add 1 kill weight if Mafia, 0 otherwise -- no plaintext branch",
                     "euint256 weight = e.select(isMafia, e.asEuint256(1), e.asEuint256(0));",
                     "killWeight[targetIndex]  = e.add(killWeight[targetIndex], weight);",
                     "",
                     "// raise the protection flag if Doctor",
                     "protectFlag[targetIndex] = e.or(protectFlag[targetIndex], isDoctor);"],
               footer="contracts/examples/ConfidentialMafia.sol"),
    "09": dict(kind="code", title="resolveNightStep1  —  folded under encryption",
               body=["// encrypted running maximum over every living target",
                     "ebool isGreater = e.gt(killWeight[idx], bestVotes);",
                     "bestVotes     = e.select(isGreater, killWeight[idx],   bestVotes);",
                     "bestIndex     = e.select(isGreater, e.asEuint256(idx), bestIndex);",
                     "bestProtected = e.select(isGreater, protectFlag[idx],  bestProtected);",
                     "",
                     "ebool noVotes = e.eq(bestVotes, e.asEuint256(0));",
                     "ebool dies    = e.and(e.not(noVotes), e.not(bestProtected));",
                     "",
                     "// only these two values are ever revealed for the night",
                     "e.reveal(bestIndex);",
                     "e.reveal(e.asEuint256(dies));"],
               footer="Individual votes and protections stay encrypted permanently."),
    "10": dict(src="seg2", t=57, kind="panel", title="One attested reveal per night",
               lines=["+ who was hit",
                      "+ whether anyone died",
                      "",
                      "` covalidator-signed attestation",
                      "` e.verifyDecryption(...) on chain",
                      "",
                      "# The contract refuses any value it cannot verify."]),
    "11": dict(src="seg2", t=81, kind="panel", title="A role is revealed only by death",
               lines=["The victim's role becomes public.",
                      "",
                      "! Everyone still alive stays encrypted.",
                      "",
                      "# That is what lets the contract decide a winner without exposing survivors."]),
    "12": dict(src="seg2", t=97, kind="panel", title="The day is public on purpose",
               lines=["+ votes are plain and visible",
                      "+ arguing about them is the game",
                      "",
                      "! The night is the part that must stay secret."]),
    "13": dict(kind="code", title="The AI narrator cannot leak what it never receives",
               body=["export type PublicGameEvent =",
                     "  | { kind: \"player_joined\";  address: string; total: number }",
                     "  | { kind: \"roles_assigned\"; playerCount: number }",
                     "  | { kind: \"night_started\";  round: number }",
                     "  | { kind: \"player_died\";    address: string; revealedRole: Role }",
                     "  | { kind: \"day_vote_cast\";  voter: string; target: string }",
                     "  | { kind: \"game_ended\";     winner: \"Town\" | \"Mafia\" };",
                     "",
                     "// Gemini is handed only this union. There is no variant that",
                     "// can carry a living player's role, so the type is the boundary."],
               footer="backend/src/publicEvent.ts"),
    "14": dict(kind="term", title="Gemini agents playing the live game",
               body=["[AI-1 0xF50a..c643] joined the lobby",
                     "[AI-2 0x7FB5..340E] joined the lobby",
                     "",
                     "[AI-1 0xF50a..c643] decrypted own role: Villager",
                     "[AI-2 0x7FB5..340E] decrypted own role: Doctor",
                     "",
                     "[AI-2 0x7FB5..340E] Gemini chose 0x7FB5..340E for the night",
                     "[AI-2 0x7FB5..340E] submitted night action (target hidden on-chain)",
                     "",
                     "Night 0: 2/3 actions in -- waiting on the human player(s)",
                     "settleNight() sent -- someone died",
                     "GAME OVER -- Mafia wins"],
               footer="Each agent decrypts only its own role -- the same ACL that binds a human."),
    "15": dict(kind="term", title="An AI player is not privileged",
               body=["# what a Gemini agent is given:",
                     "  its own decrypted role",
                     "  the public roster and who is alive",
                     "  deaths, and the role each death revealed",
                     "  the public day-vote tally",
                     "",
                     "# what it is never given:",
                     "  anyone else's role",
                     "  anyone's night action",
                     "",
                     "So a game can start without a full lobby,",
                     "and the AI never knows more than you do."],
               footer=None),
    "16": dict(kind="term", title="Live now",
               body=["Telegram Mini App",
                     "  https://t.me/incoprotocol_bot?startapp",
                     "",
                     "Web",
                     "  https://confidential-mafia-inco.vercel.app/confidential-mafia",
                     "",
                     "Contract (Base Sepolia)",
                     "  0x9C96e7D30B2414bEB0D59a0b6452BC5178d965Ff",
                     "",
                     "Hidden roles. Hidden night actions.",
                     "An AI that does not know the answer either."],
               footer="Built on Inco Lightning + Base + Gemini"),
}

SRC = {"raw": "/tmp/demo/raw.fix.webm", "seg2": "/tmp/demo/seg2.fix.webm"}
CROP = "crop=1000:1400:400:160"

# --------------------------------------------------------------------------
# Build one clip per narration line, each exactly as long as its audio.
# --------------------------------------------------------------------------
parts, srt, clock = [], [], 0.0


def ts(t):
    h, r = divmod(t, 3600)
    m, s = divmod(r, 60)
    return f"{int(h):02d}:{int(m):02d}:{s:06.3f}".replace(".", ",")


for i, item in enumerate(NARR, start=1):
    sid = item["id"]
    wav = f"/tmp/vo/{sid}.wav"
    d = dur(wav) + 0.45  # a small tail so lines don't collide
    spec = board[sid]
    outp = f"{SEG}/{sid}.mp4"

    if spec["kind"] == "panel":
        p = panel(f"{CARDS}/{sid}.png", spec["title"], spec["lines"])
        src = SRC[spec["src"]]
        # left: real footage, right: key points
        fc = (
            f"[0:v]trim=start={spec['t']}:duration={d},setpts=PTS-STARTPTS,"
            f"{CROP},scale=607:850,setsar=1[app];"
            f"color=c=0x060B1A:s={W}x{H}:d={d}[bg];"
            f"[bg][app]overlay=x=78:y=26[a];"
            f"[a][1:v]overlay=x=760:y=26[v]"
        )
        run(
            f'ffmpeg -y -v error -stream_loop -1 -i {shlex.quote(src)} -i {shlex.quote(p)} '
            f'-filter_complex "{fc}" -map "[v]" -t {d} -r 25 '
            f'-c:v libx264 -pix_fmt yuv420p -crf 20 {shlex.quote(outp)}'
        )
    else:
        p = card(f"{CARDS}/{sid}.png", spec["title"], spec["body"],
                 spec["kind"], spec.get("footer"))
        run(
            f'ffmpeg -y -v error -loop 1 -i {shlex.quote(p)} -t {d} -r 25 '
            f'-c:v libx264 -pix_fmt yuv420p -crf 20 {shlex.quote(outp)}'
        )

    parts.append(outp)
    srt.append(f"{i}\n{ts(clock)} --> {ts(clock + d - 0.1)}\n"
               + "\n".join(textwrap.wrap(item["text"], 96)) + "\n")
    clock += d
    print(f"  segment {sid}  {d:5.2f}s  {spec['kind']}")

# --------------------------------------------------------------------------
# Concat video, concat audio, mux, burn subtitles.
# --------------------------------------------------------------------------
with open(f"{SEG}/list.txt", "w") as fh:
    for p in parts:
        fh.write(f"file '{p}'\n")
# Pad each line to its own clip length. Padding only the tail would let the
# voice drift ahead of the visuals by the accumulated slack (~7s by the end).
with open(f"{SEG}/alist.txt", "w") as fh:
    for item, clip in zip(NARR, parts):
        src = f"/tmp/vo/{item['id']}.wav"
        padded = f"{SEG}/a_{item['id']}.wav"
        run(
            f"ffmpeg -y -v error -i {shlex.quote(src)} -af 'apad' "
            f"-t {dur(clip):.3f} -ar 48000 -ac 2 {shlex.quote(padded)}"
        )
        fh.write(f"file '{padded}'\n")

srt_path = f"{OUT}/confidential-mafia-demo.srt"
open(srt_path, "w").write("\n".join(srt))

run(f"ffmpeg -y -v error -f concat -safe 0 -i {SEG}/list.txt -c copy {SEG}/video.mp4")
# pad each narration line to its clip length so audio stays in sync
run(f"ffmpeg -y -v error -f concat -safe 0 -i {SEG}/alist.txt -c copy {SEG}/voice.wav")

style = (
    "FontName=DejaVu Sans,FontSize=16,PrimaryColour=&H00FFFFFF,"
    "BackColour=&HB0000000,BorderStyle=4,Outline=0,Shadow=0,"
    "Alignment=2,MarginV=26"
)
final = f"{OUT}/confidential-mafia-demo.mp4"
run(
    f"ffmpeg -y -v error -i {SEG}/video.mp4 -i {SEG}/voice.wav "
    f'-vf "subtitles={srt_path}:force_style=\'{style}\'" '
    f"-c:v libx264 -pix_fmt yuv420p -crf 21 -preset medium "
    f"-c:a aac -b:a 160k -shortest -movflags +faststart {shlex.quote(final)}"
)

print(f"\nvideo : {final}  ({dur(final):.1f}s)")
print(f"subs  : {srt_path}")
