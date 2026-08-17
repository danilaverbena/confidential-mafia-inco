# Demo video

`confidential-mafia-demo.mp4` (2:25, 1920x1080) is assembled from real material
only — nothing in it is mocked up:

- **Footage** — genuine screen recordings of the deployed Mini App, captured by
  `telegram-app/scripts/record-demo.js`. That script injects a minimal
  EIP-1193 provider as `window.ethereum` so the capture doesn't have to stop and
  scan a WalletConnect QR. Every transaction in the recording is nonetheless a
  real Base Sepolia transaction against the deployed contract, and the role the
  UI reveals is a real Inco `attestedDecrypt`. Only the wallet *UI* is bypassed.
  The recorded game ran to completion: `GAME OVER -- Mafia wins`.
- **Narration** — `narration.json`, voiced locally with
  [piper](https://github.com/rhasspy/piper) using the `en_US-ryan-high` voice.
  No cloud TTS and no API key required to rebuild.
- **Terminal card** — copied verbatim from a real `run-ai-players.ts` run.
- **Code cards** — verbatim excerpts from
  `contracts/examples/ConfidentialMafia.sol` and `backend/src/publicEvent.ts`.

## Layout

1920x1080. Segments backed by footage put the portrait app capture on the left
and a key-point panel on the right; segments explaining code or agent behaviour
are full-frame cards, because code needs the width to stay legible. Subtitles
are burned in, and also shipped separately as `confidential-mafia-demo.srt`.

## Rebuilding

```sh
# 1. record the app (writes /tmp/demo/*.webm)
cd telegram-app
DEMO_PRIVATE_KEY=0x... BASE_SEPOLIA_RPC_URL=https://sepolia.base.org \
  node scripts/record-demo.js /tmp/demo

# 2. voice the script (writes /tmp/vo/NN.wav)
pip install piper-tts
#    fetch en_US-ryan-high.onnx + .json from the piper-voices repo into /tmp/voices
#    then run piper once per line of media/narration.json

# 3. assemble
python3 media/build_video.py
```

`build_video.py` remuxes the screencast webm files first — Chrome's screencast
output has no duration header, so `ffprobe` reports `N/A` until it is remuxed.

One thing worth knowing if you re-time the script: each narration line gets its
own clip, and the audio for that line is padded to the clip's exact length.
Padding only the end of the concatenated track instead lets the voice drift
ahead of the visuals by the accumulated slack (about 7 seconds by the last
segment).
