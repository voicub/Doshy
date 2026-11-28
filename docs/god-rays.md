# God rays

Sunbeams made visible in the air where the sun comes through windows, doors and the cut-away walls. Settings and tiers: README, **God rays** under Graphics quality. This page is the design and the measurements.

## How it is built

- **The pass**: `GodraysPass` from [three-good-godrays](https://github.com/Ameobea/three-good-godrays) (version pinned in `package.json`, built on the same `postprocessing` copy as `@react-three/postprocessing`: check with `npm ls postprocessing`, one entry). It raymarches the sun's existing shadow map along every pixel's view ray and mixes the sun's colour into the lit air. It sits in `PostFx`'s `EffectComposer` right after the ambient occlusion and before the tone map, so it works in linear light (`gammaCorrection: false`; the tone map after it encodes the picture once). `components/scene/Godrays.tsx` creates it for this sun and camera, ties its strength to the live sky (`lib/godrays.ts`, `godraysStrength`), switches it off (no cost) at night and under overcast, and disposes it with the canvas, so a rebuilt canvas (lost graphics context) makes a fresh one.
- **The orthographic camera**: the library only knows perspective cameras. Doshy's isometric camera is orthographic, so `components/scene/godraysPatch.ts` rewrites the pass's two shaders once, after construction: the pixel's world position and parallel view ray come from the full inverse projection and the depth measure is linear. Every rewrite names the exact text it replaces and refuses if the package changed (a test, `lib/godraysPatch.test.ts`, runs the rewrite against the installed shaders, so an upgrade that moves them fails `npm test`). If it ever refuses at run time the rays stay off and the console says why.
- **The volume**: left alone, the library hazes every metre of lit air in the sun's 130 m deep shadow frustum, which washes the picture out. The patched shader also clips each ray to a box around the building (`godraysVolume`) and thins the rays out over 3 m towards its sides and top, skips pixels with no scene behind them, and so also skips the work for most of the screen.
- **Shadow map type**: the scene uses three's `PCFShadowMap` (R3F `shadows="percentage"`). In the installed three 0.187 `PCFSoftShadowMap` is gone (it logs a warning and becomes `PCFShadowMap`), and the library's own table says `PCFShadowMap` is the one that needs a depth copy: it blits the sun's 4096 px depth map once a frame (`needsDepthCopy: true` in the measurement below). Basic or VSM shadows would skip the copy but change the look of every shadow; not worth it for this feature.
- **What casts**: walls, roofs' edges, slabs, furniture, window frames and door leaves cast into the sun's shadow map as before; window glass and the big ground planes do not (the glass would block the beams, the ground would shade everything). Nothing was changed for this: the rays read what the scene already draws.
- **Shafts**: the older faked sunbeams under the windows (`Shafts.tsx`) stop drawing the sun's share while real rays are on; the lamps' glow beams stay.
- **Governor**: with an automatic tier, slow frames (median over 45 ms in two 2.5 s windows in a row) turn God rays off first, then lower the tier (`lib/qualityGovernor.ts`); the choice is saved as Off and a notice says so.

## Not built: rays from lamps at night

The library can cast rays from a point light, but a point light's shadow is a cube map (six renders). Lamps already use small 384 px cube shadow maps redrawn every 20th frame, with up to nine of them at once; a lamp's rays would need a second `GodraysPass` (a full second raymarch) on one chosen lamp, with a 384 px map that would show as noise, for a lit room at night where the sun-less air is mostly dark. The cost is the same order as the whole sun effect again for a look that is hard to get right, so night rays are not shipped. The sun effect is what the owner asked to see through windows.

## Measurements

Apple M1 Max, headless Chrome 150 (Metal), 1800x1125, the owner's plan loaded into a test database, Day, cut-away on, Detailed tier, 3333 draw calls and 425 k triangles per frame with or without rays. GPU time of a whole frame from `EXT_disjoint_timer_query_webgl2` around `composer.render` (alternating the modes, three rounds of about 85 frames each; the machine was shared with other work, so the spread is wide):

| God rays | 25th percentile | median | 90th percentile | draw calls | triangles |
|---|---|---|---|---|---|
| Off | 29.0 / 32.3 / 29.2 ms | 45.6 to 48.1 ms | 73 to 85 ms | 3333 | 425 683 |
| Soft | 31.9 / 32.3 / 33.9 ms | 41.9 to 54.2 ms | 84 to 94 ms | 3336 | 425 686 |
| Rich | 37.3 / 33.9 / 34.4 ms | 47.3 to 53.5 ms | 89 to 104 ms | 3336 | 425 686 |

Reading: Soft costs about 2.5 ms more than Off at the 25th percentile (the least disturbed frames), Rich about 5 ms. The medians overlap because the machine's other work moved them by more than the effect does. CPU-side the effect adds three fullscreen draws and nothing else. Not measured: software GL (a SwiftShader Chromium would not finish the first frames of the scene within 60 s, so that tab was closed), a Raspberry Pi, or any other graphics chip. On those the cost grows with the pixels and steps, which is why Eco and Light never run it and Automatic keeps it off in software GL.

No leak: 8 cycles of Rich > Soft > Off left the renderer's texture count at the same value each time (the pass owns 4 textures while it is on). A lost and restored graphics context rebuilt the canvas and the pass came back.
