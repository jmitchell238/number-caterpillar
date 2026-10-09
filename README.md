# Number Caterpillar

Tap the numbers in order (1, 2, 3…) to grow a caterpillar. Finish the chain and it turns into a butterfly. A counting game for ages 4–6.

Play at https://jmitchell238.github.io/number-caterpillar/. It's one of the games in [Arcade Hub](https://jmitchell238.github.io/arcade-hub/).

## Modes

| Mode | Numbers | Rounds |
|------|---------|--------|
| Free Play | 1–5 | Endless |
| Easy | 1–5 | 3 |
| A Little More | 1–8 | 4 |
| Challenge | 1–10 | 5 |

## Features

- Big, colorful number bubbles
- The caterpillar grows a segment with each correct tap
- A wrong tap gives a small shake and highlights the right number. There are no lives.
- Finishing the chain turns the caterpillar into a butterfly, with confetti
- Optional spoken numbers, using the device's built-in speech
- Mute and Calm motion settings
- Installable PWA that works offline after the first visit

There are no lives, ads, accounts or fail screens.

## Running locally

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080. The service worker needs `localhost` or HTTPS.

Plain HTML, CSS and canvas with no build step.

## Tests

```bash
node tests/run.mjs
```

## Versioning

When you bump `GAME_VERSION` in `js/config.js`, set `CACHE` in `sw.js` to `'number-caterpillar-' + GAME_VERSION`.

## License

Personal project for the family.
