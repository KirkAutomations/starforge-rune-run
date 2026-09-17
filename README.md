# Starforge Rune Run

A keyboard-first educational action game. Dodge enemy attacks, solve adaptive challenges, collect five runes, and open the Star Gate.

## Play

https://kirkautomations.github.io/starforge-rune-run/

## Features

- Eight missions spanning math, vocabulary, science, and logic
- Chaser, turret, and telegraphed dasher enemies
- Keyboard movement, shielded dash, and answer casting
- Adaptive challenge pressure and spaced review
- Local progress persistence with legacy-save migration
- Parent evidence with mastery, answer audit, and adaptation history
- Responsive desktop and mobile layouts

## Controls

- Move: `WASD` or arrow keys
- Dash: `Space`
- Cast: `Enter`, type an answer, then `Enter`
- Cancel answer entry: `Escape`

## Test

```powershell
npm ci
npm test
```

Test the deployed build:

```powershell
$env:STARFORGE_URL='https://kirkautomations.github.io/starforge-rune-run/'
npm test
```

The Playwright suite verifies gameplay, coaching, progression, adaptive difficulty, spaced review, persistence, keyboard flow, desktop/mobile viewport fit, and browser-console cleanliness.
