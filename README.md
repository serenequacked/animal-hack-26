# Turtle Tide

Turtle Tide is a 2D pixel survival game about a critically endangered hawksbill sea turtle migrating through human-made ocean threats. The player swims as long as possible, avoids hazards, finds healing resources, and sees short conservation facts during the run.

The prototype also includes a demo fundraising panel with sponsor-ad and donation buttons, showing how this game model could support shelters, rescue groups, or conservation campaigns.

## Educational Loop

- Choose a migration route before each run.
- Different routes teach different risks, such as fishing gear, boat traffic, plastic waste, and damaged habitats.
- Each encounter unlocks a short lesson explaining what happened and one real-world solution.
- Helpful pickups represent conservation actions, such as beach cleanups and protected reefs.
- Pollution rises over time, causing plastic, oil, hooks, and nets to appear more often.
- The end-of-run report summarizes what the player learned.

## Gameplay

- Press `Space`, `W`, or `Arrow Up` to jump.
- Gravity pulls the turtle downward by default, so the run plays like a Flappy Bird-style survival game.
- Avoid drift nets, plastic bags, boats, oil slicks, and hooks.
- Collect beach cleanup and reef sanctuary pickups to recover health.
- Survive as long as possible and beat the best score.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Build

```bash
npm run build
```

## Package Desktop Apps

```bash
npm run make
```

Creates a macOS app bundle at:

```text
release/mac-arm64/Turtle Tide.app
```

```bash
npm run make:win
```

Creates a portable Windows executable at:

```text
release/Turtle Tide 0.1.0.exe
```

The Windows build produced here targets Windows ARM64 because it was built from an Apple Silicon macOS machine.
