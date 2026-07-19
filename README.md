# Number Caterpillar

Tap numbers in order **1 → 2 → 3…** and grow a friendly caterpillar. Finish the chain for a butterfly celebration. Soft counting fun for ages **4–6**.

**Play:** https://jmitchell238.github.io/number-caterpillar/

Part of [Arcade Hub](https://jmitchell238.github.io/arcade-hub/).

## Modes

| Mode | Numbers | Rounds |
|------|---------|--------|
| Free Play | 1–5 | Endless |
| Easy | 1–5 | 3 |
| A Little More | 1–8 | 4 |
| Challenge | 1–10 | 5 |

## Features

- Big colorful number bubbles
- Caterpillar grows a segment on each correct tap
- Wrong tap → soft shake + glow on the right number (no lives)
- Chain complete → butterfly metamorphosis + confetti
- Optional spoken numbers (device speech synthesis)
- Sound mute + reduced motion
- Offline PWA after first visit
- Zero fail screens

## Stack

Static HTML / CSS / Canvas. No build step.

## Tests

```bash
node tests/run.mjs
```

VM-loaded unit tests cover sequence rules, layout, hit testing, play flow (correct/wrong/complete), modes, save, and PWA shell checks.

## Versioning

`GAME_VERSION` in `js/config.js` ↔ `CACHE` in `sw.js`.

## Local preview

```bash
python3 -m http.server 8080
```

## Parents

No lives, ads, accounts, or fail screens. Educational without feeling like homework.

## License

Personal project for family Arcade Hub.
