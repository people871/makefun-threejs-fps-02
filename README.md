# makefun-threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/people871/makefun-threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/people871/makefun-threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Kestrel Yard — a 5v5 three.js tactical FPS. Kestrels (attackers) vs Vultures (defenders), bomb plant/defuse at Site A/B, first to 8 rounds, on an original industrial-depot map. Five weapons plus grenade and armor, a round economy ($800 start, kill +$300, win +$3,250), a full HUD (health/armor, ammo, money, timer, score, minimap, killfeed, buy menu), and 9 bots with nav-mesh pathing, perception, burst fire, and plant/defuse roles on a fixed 60 Hz simulation. three.js 0.187.0 is vendored; there is no build step.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in a desktop browser with WebGL 2. `?shot=start|play|end&seed=N` stages a deterministic screenshot frame; `?selftest=1` runs a scripted play-through.

---

Entered on [make.fun](https://make.fun/?ref=t9cvg4vb&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards
