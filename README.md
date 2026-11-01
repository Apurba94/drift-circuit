# Drift Circuit

A top-down racer played with one thumb. The car drives itself forward, and you hold the left or right side of the screen to steer. Hold a
turn at speed and the car slides into a drift, charging a boost that fires when you let go. The view turns with your car, so left is
always left.

**[Play it now](https://apurba94.github.io/drift-circuit/)** in your phone's browser, then use "Add to Home Screen" to install it. After the
first visit it works offline.

* A 12-race championship across 3 cups, on generated tracks.
* 5 rivals that brake for corners, plus a minimap and lap timer.
* A garage of engine, tyre and nitro upgrades paid for with prize money.
* Your best place and best lap are kept for each race.

No ads, no accounts, no tracking and no network use after the first load.

## Run from source

```bash
npx serve .
npm test
```

Plain JavaScript with no dependencies. `src/logic.js` holds the physics, tracks and rivals, and `src/main.js` holds the screens.

## How it is tested

The tests check the car physics and race rules, and that no generated track crosses itself. An autopilot that only holds left, right or
nothing, as a thumb would, has to finish all 12 tracks and place in the top three of the first cup. That shows the game can be played on
touch. It does not show how it feels in the hand.

## License

MIT
