# Demo video

 (2:25) is assembled from real material only:

- **Footage** — genuine screen recordings of the deployed Mini App, captured
  with . That script injects a minimal
  EIP-1193 provider so the recording doesn't have to stop and scan a
  WalletConnect QR, but every transaction in it is a real Base Sepolia
  transaction against the deployed contract, and the role the UI reveals is a
  real Inco attested decrypt. Only the wallet *UI* is bypassed.
- **Narration** — , voiced locally with piper
  (). No cloud TTS, no API key needed.
- **Terminal card** — copied verbatim from a real  run
  (the game shown ended `GAME OVER -- Mafia wins`).
- **Code cards** — verbatim excerpts from
  `contracts/examples/ConfidentialMafia.sol` and `backend/src/publicEvent.ts`.

Rebuild with `python3 media/build_video.py` (expects the recordings in
/tmp/demo and the voice lines in /tmp/vo; see the module docstring).

Subtitles are burned in and also shipped separately as
`confidential-mafia-demo.srt`.
