# Car design data

`lib/cars.design.ts` describes what makes each catalogue car recognisable, as parameters for the 3D generator (`designOf(id)`). Nothing in it is geometry. Facts are public specifications and our own descriptions; no images or text are copied and no logos are drawn.

## How it is organised

| file | content |
| --- | --- |
| `lib/cars.design.ts` | the schema (`CarDesign`, `DesignRow`, enums with a mapping guide), `designOf(id)`, `isResearched(id)`, `tyreDiameter()` |
| `lib/cars.design.data.ts` | merges the part files, fails on duplicate keys |
| `lib/cars.design.<group>.ts` | `BRANDS` (brand-wide defaults) and `ROWS` (one entry per catalogue id); groups: `mitsubishi`, `vag`, `german`, `frit`, `japan`, `asia`, `western`, `generic` |
| `lib/cars.design.test.ts` | every id has a design, enums and ranges valid, ASX entry complete |

Resolution order, later wins: GENERIC, body style, brand, EV rule (closed grille, no intake, hidden exhaust), model row. A new car is one object in its group's `ROWS`. Each part file carries its own `// sources:` block (`code = URL`, the code is what a row's `source` field holds) and, for the photo pass, a `// photos:` list of the Wikimedia Commons file titles that were looked at.

## Coverage

All 191 catalogue models plus the added `ASX 2017 Dynamic Shield` have an individual row (192 rows, 0 on brand default only). Method:

1. Pass 1: public descriptions and specifications of each generation (generation chosen from the row's length and wheelbase), brand face language per group.
2. Pass 2: every row was compared with Wikimedia Commons photographs of the right generation (front and rear three-quarter where available) and corrected. Photo titles are listed at the end of each part file. Images were only looked at, never stored in the repo.

Weak spots, as reported by the checkers: Porsche Cayenne E3 (no matching photo, row from pass 1); Honda e, Supra, Jimny and Nexon rear lamps (no matching rear photo); the rear of Kuga, Mustang, EX30, XC40, V60, XC90, Polestar 2, Model 3, Model S, Cybertruck, Renegade, Wrangler, Defender, Bolt, C8 and Challenger (rear lamp values from pass 1); Alfa Giulia front (only a 1960s Giulia was found); Peugeot 308 and 5008 rears; Citroen Ami rear; Defender 90 copies the 110. Wheel designs and tyre sizes are typical for the common trim, not exact for every variant. Some photos were of a facelift of the generation the row stands for (Model 3 Highland, Q5 2020, C-HR 2019, Passat 2019).

## Mitsubishi ASX 2016

The older face, before Dynamic Shield, original 4.295 m body. Verified against photos of a 2016 UK ASX and a 2017 RVR (Commons titles in `lib/cars.design.mitsubishi.ts`):

- Front: chrome-framed trapezoid grille with an upper black louvre (bars 2) and a lower black mesh, wedge-shaped headlamps with an amber indicator, fog lamp pods low in the bumper corners with a chrome strip beside them (the LED daytime lamp is in the bumper), black lower bumper edge. No shark-fin aerial (that came with the facelift).
- Side: short snub bonnet, steep windscreen, flat roof with black rails and a roof-end spoiler, high beltline that kicks up at the C pillar, body-colour pillars, black window frames, black sills and wheel-arch surrounds, ground clearance about 0.19 m (190 mm; CarsGuide lists 195 mm for the 4WD diesel on 18").
- Rear: wide horizontal tail lamps that wrap onto the quarter (checked on photos; not vertical), a high-level spoiler with stop lamp, one round chrome exhaust tip, black lower rear bumper.
- Wheels: 18" twin-spoke dark alloys, tyres 225/55 R18 (overall diameter 0.705 m); a 17"/16" base wheel exists.
- Typical factory colours of the period: silver, black, white pearl, grey, red, blue (the Lightning Blue came in 2017).

`car_mitsubishi_asx_2017_dynamic_shield` (added row, 4.365 x 1.770 x 1.640 m, wheelbase 2.670 m; Wikipedia gives the range 4,295 to 4,366 length, 1,770 to 1,810 width, 1,625 to 1,641 height across the generation): same body with the Dynamic Shield nose (black louvred grille between two chrome clasps, silver skid plate, wider bumper), shark-fin aerial, 18" two-tone alloys. Introduced at Los Angeles in November 2015 (US/CA/JP model year 2016), Europe from the 2016 Paris show.

Sources: https://www.carsguide.com.au/mitsubishi/asx/car-dimensions/2016 (1625 x 1770 x 4295 mm, wheelbase 2670, clearance 195, 225/55 R18), https://en.wikipedia.org/wiki/Mitsubishi_ASX (facelift history), https://www.autozine.co.uk/mitsubishi/asx-2010-2021/news/revised-mitsubishi-asx-arrives-in-the-uk, https://autogazette.de/fahrberichte/mitsubishi/asx/mitsubishi-asx-aufgehuebscht-in-neuen-lebensabschnitt-581458.html, https://www.drivencarguide.co.nz/reviews/mitsubishi-asx-another-asx-birthday-face, https://www.goauto.com.au/new-models/mitsubishi/fresh-faced-mitsubishi-asx-checks-in/2016-11-16/1639.html, https://practicalmotoring.com.au/car-reviews/2017-mitsubishi-asx-review (4355 x 1810 x 1640 for the facelift in Australia), https://media.mitsubishicars.com/en-US/releases/release-08d469b1203d410da7bf6582343a287b-dynamic-design-enhances-mitsubishi-motors-sales-leader-mitsubishi-outlander-sport-updated-for-2016.

Not verified: the exact wheel spoke count (five twin-spokes is read from photos at low resolution), whether the car has the roof rails (trim dependent), and the factory colour names beyond those in the press releases.

## Brand face language used

Mitsubishi Dynamic Shield (chrome clasps either side of a black grille), BMW twin kidney grille and L-shaped lamps (framed and closed on EVs), Audi octagonal singleframe with honeycomb or bars and LED signatures, Mercedes star grille (diamond mesh on A/GLA, vertical bars on AMG GT), VW thin bar fused with the lamps (ID. series closed nose with light bar), Skoda crystal grille, Seat shield, Renault C-shaped lamp signature, Dacia Y-shaped signature, Peugeot upright dark mesh grille with fang DRL and claw tail lamps, Citroen split lamps and Airbumps, Opel Vizor, Fiat round lamps (500), Alfa scudetto, Toyota/Lexus-style lower grilles, Honda, Mazda KODO (wingless dark grille on the Mazda3), Nissan V-motion, Hyundai/Kia tiger nose and parametric lamps, Ford trapezoid grille and tri-bar tail lamps (Mustang), Volvo Thor's-hammer lamps, Tesla and Polestar closed nose, Jeep seven slots, Land Rover Defender box shape. Each part file's header says which grille/lamp enum a brand feature was mapped to.

## Dimension check (lib/cars.data.ts)

Compared length, width without mirrors, height and wheelbase of every row with published data of the generation the row means (Wikipedia infoboxes, auto-data.net, manufacturer press kits, CarsGuide). ASX 2016 confirmed: 4.295 x 1.770 x 1.625 m, wheelbase 2.670 m, ground clearance 0.19 to 0.195 m (CarsGuide, Wikipedia).

Changes made to `lib/cars.data.ts`:

| row | field | old | new | source |
| --- | --- | --- | --- | --- |
| Mitsubishi Space Star | length | 3.710 | 3.845 | Wikipedia Mitsubishi Mirage: hatchback 3,710 mm pre-facelift, 3,845 mm facelift (2020+, the face the design describes) |
| Toyota Aygo | width / height / wheelbase | 1.615 / 1.46 / 2.34 | 1.740 / 1.52 / 2.430 | Wikipedia Toyota Aygo X (the 3.700 m length is the Aygo X; the other three fields were the old Aygo) |
| Volvo XC90 | width | 2.008 | 1.923 | Wikipedia Volvo XC90 (second generation, without mirrors) |
| Tesla Cybertruck | height / wheelbase | 1.905 / 3.81 | 1.796 / 3.635 | Wikipedia Tesla Cybertruck (70.7 in, 143.1 in) |
| Mitsubishi ASX 2017 Dynamic Shield | new row | | 4.365 x 1.770 x 1.640, wb 2.670 | Wikipedia Mitsubishi ASX, Practical Motoring, autogazette |

`// approx` markers removed because the numbers were verified: Toyota Aygo (now corrected), Hyundai Creta (4.30 x 1.79 x 1.62-1.655, wb 2.61, SU2i), Nissan X-Trail (T32), Suzuki S-Cross (4.300 x 1.785 x 1.585, wb 2.600), Fiat Ducato (L2H2 5.413 x 2.050 x 2.254, wb 3.45, Fiat Chile data sheet), Mercedes Vito (L2). Kept as approx: Renault Trafic (length and wheelbase confirmed, width/height not), Ford Transit Custom, Ford F-150, Ford Kuga height (varies 1.658 to 1.690), Nissan Navara (length 5.33 is 0.02 above the infobox maximum 5.311), Jeep Renegade (height), Mercedes Sprinter (width 1.993; auto-data says 2.020).

Discrepancies over 2 cm that were NOT changed (low confidence or market dependent):

| row | field | table | published | note |
| --- | --- | --- | --- | --- |
| VW ID.4 | height | 1.612 | 1.631 to 1.636 | VW's own EU figure is 1.612 |
| Mercedes Sprinter | width | 1.993 | 2.020 (auto-data, L1) | low confidence |
| Jeep Renegade | height | 1.667 | 1.689 (US) | EU range 1.667 to 1.697 |
| Ford Puma | length | 4.207 | 4.186 to 4.214 | Ford EU press says 4.207 |
| Ford Mustang Mach-E | length / height | 4.713 / 1.597 | 4.739 / 1.621 | North-American spec; table matches the European spec |

Rows that describe a facelift different from what the dimensions suggest are noted in the part files (e.g. the Twingo row is the 2014 to 2018 car, the Fiat 500 the 2015 facelift, Dacia Spring the first generation, Kia Sportage the QL facelift).

## Number plate position

The plate is put where the car's own geometry has its plate holder (built-in cars, `lib/carEnds.ts`) or where a ray-cast finds the flattest stretch of a real model's bumper or tailgate (`lib/carModelPlate.ts`, cached per model and fit). Models that carry a plate mesh of their own keep it where the model puts it (the inspector says so); the curated ASX drops its mesh and gets ours.

The owner can nudge that automatic place (`lib/plateFit.ts`, pure). A **fit** is `{ dx, dy, dz, tilt, yaw, scale, hidden }`: metres sideways, up the plate and out of the car, degrees about the plate's horizontal axis (positive: top leans out) and its vertical axis, a size factor 0.5 to 1.6 and a hide flag. The directions are the plate's own as seen looking at it from outside, so front and back read the same, and "up" follows a leaning tailgate. Every field is clamped and rounded by `cleanPlateFit`; a fit that changes nothing does not exist.

- **Where it is kept.** A car stores `params.plateFront` and `params.plateRear` as one short text of whole numbers (`dx mm, dy mm, dz mm, tilt deg, yaw deg, size %, hidden 0/1`, for example `-10 150 0 -15 0 135 0`): `params` hold only plain values and a guest link keeps only short plain words, and this is both. It is cosmetic, so the guest sanitiser keeps it, and it travels with the plan (export, import, versions, undo, duplicate and copy-paste: `cloneItem` carries the car's look options `finish`, `plate`, `plateStyle` and the two fits, nothing that could name a device).
- **Resolution order, per end:** the car's own fit, else the one remembered for its model, else the automatic place. **Remember for this model** stores the car's effective fits under the model's key in the `housey-plate-fits` setting (`lib/plateFitStore.ts`, at most 64 models, a few hundred bytes; the key is the real model's resource id, or the catalogue id while the car is the built-in shape, because their geometry differs) and clears the car's own, so later changes to the model's place reach every car. **Reset to automatic** clears the car's own fit (it then shows the model's, labelled "Back to the saved position"); **Forget the saved position** clears the model's.
- **Drawing.** `CarPlate` applies the fit as one transform of the cached mount (`applyPlateFit`); the texture, material cache and geometry are untouched, so an edit is one React commit and one frame. A polygon offset keeps a plate laid on a baked-in one from flickering. A procedural car's dark plate holder is part of its body mesh: once the plate leaves it (`holderStays`) the body is rebuilt without that holder (cached like any variant, `buildCar(spec, lod, holders)`).
- **The inspector** (`components/inspector/PlateFitPanel.tsx`): front / back, a nudge button on each side of a slider per move (44 px on touch layouts), hide, reset, remember, forget. While the section is open the plate is outlined in the 3D view (`lib/plateEditState.ts`). One slider drag is one undo step; a button press is one. There is no picture-covering option: move and scale the plate over the one in the model's picture. Dragging the plate in the 3D view is not built (it would fight the move and orbit gestures); the sliders and buttons do the job.

## Could not find / open questions

- No per-model colour lists; default paints stay as in `cars.data.ts`.
- Exact wheel designs per trim are not tracked; each row has the common one.
- Hidden exhausts, charge flap positions and mirrors are not researched beyond what photos showed.
