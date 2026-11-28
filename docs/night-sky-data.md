# Night-sky data and numerical model

## Embedded stars

`lib/starData.ts` contains **2,887 real stars**, not procedurally generated points: the Yale Bright Star Catalogue, fifth revised edition (Hoffleit & Warren, 1991), CDS/VizieR **V/50/catalog**, visual magnitude **V <= 5.5**. Credit Yale University Observatory, the catalogue authors and CDS, Strasbourg. Catalogue: <https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50>.

The source was retrieved through the Harvard VizieR mirror on 2026-11-27. The response identifies FK5 J2000 coordinates at epoch J2000 (proper motion already applied to that epoch), the catalogue identifier and the following query:

```
https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?-source=V/50/catalog&-out=HR,Name,HD,RAJ2000,DEJ2000,Vmag,B-V,SpType&-out.max=20000&-out.form=|&-out.add=_RAJ,_DEJ&Vmag=%3C%3D5.8&-sort=Vmag&-oc.form=d
```

Generation then retained finite coordinate/magnitude rows with V <= 5.5 and sorted brightest first. Four parallel little-endian 16-bit arrays were base64 encoded: RA unsigned, scaled by 65536/360; declination signed, scaled by 32767/90; V and B-V signed, scaled by 100. Decode quantization is at most about 10 arcseconds in RA, 5 arcseconds in declination and 0.005 magnitude. Twenty-two missing B-V values use 0.65 (Sun-like); this is only a display colour default, not a measured colour. `getStars()` memoises the decoded arrays; callers must treat them as read-only. Names identify bright catalogue entries; constellation segments are hand-authored illustrative connections between those stars, not official boundaries or third-party chart artwork. No Stellarium/GPL or noncommercial artwork is included. No raw source catalogue is shipped.

The source response points to **CDS's catalogue-use/licensing terms**, <https://cds.unistra.fr/vizier-org/licences_vizier.html>. Do not infer a CC0, public-domain or MIT licence merely from public download access. The official terms endpoint was unreachable during this continuation and mirror paths returned 404; the precise redistribution grant could not be independently confirmed here. Verify those terms before redistributing the embedded catalogue commercially. The application's MIT licence does not relicense the source catalogue.

`stars.test.ts` checks count, sorting, indices, finite ranges, bright-star reference coordinates and source/gzip size ceilings. B-V colours use Ballesteros's temperature relation (2012, *EPL* 97 34008, doi:10.1209/0295-5075/97/34008) and the Tanner Helland black-body RGB approximation, <https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html>. Colours are illustrative rather than calibrated photometry.

## Coordinates and astronomy

Public angles are **degrees**, longitude east-positive, azimuth clockwise from true north (north 0, east 90). Time arguments are real UTC `Date` instants, not wall-clock strings. `lib/nightsky.ts` is the canonical import for **`bodiesAt` and `SkyBody`**, along with Julian day, sidereal time, precession, horizontal transforms and visibility. `lib/planets.ts` supplies raw equatorial positions and magnitudes. A body has exactly `{ id, name, alt, az, mag }`; the Sun, Moon and five naked-eye planets are returned.

- Julian day uses UTC Unix time. Leap seconds and UT1−UTC are ignored.
- GMST uses the conventional IAU-1982/Meeus polynomial, with local sidereal time = GMST + longitude. `nightsky.test.ts` references J2000's 18.697374558 hours and Meeus, *Astronomical Algorithms*, chapter 12, example 12.a (1987-04-10 00:00 UTC, 13h 10m 46.3668s; tolerance 0.01s).
- Precession uses IAU-1976 three-angle rotation from J2000. The rotation's few-decade precision is comfortably within an arcminute; catalogue quantization, omitted proper motion, nutation and aberration limit actual stellar accuracy. High-proper-motion stars are not guaranteed arcminute accuracy decades from J2000. Meeus theta Persei example 21.b is checked within one arcminute, allowing omitted proper motion.
- `raDecToAltAz` expects **equinox-of-date** RA/Dec and does **not** precess automatically. Call `precessor(date)` once per catalogue frame, then transform each star. Planet and lunar coordinates are already of date. Altitude is geometric, without refraction. Moon altitude includes first-order topocentric parallax; other bodies are geocentric.
- Paul Schlyter's low-precision orbital elements, Kepler iteration and the major lunar/Jupiter/Saturn perturbations are implemented directly: <https://stjarnhimlen.se/comp/ppcomp.html> and worked examples <https://stjarnhimlen.se/comp/tutorial.html>. The method targets roughly 1–2 arcminutes near the present epoch, not navigation or telescope pointing. Light-time, nutation and aberration are omitted. Tests use a conservative 0.1-degree tolerance, not a claim of independently measured arcminute accuracy.
- `planets.test.ts` checks 1990-04-19 00:00 UTC: Schlyter's Astronomical Almanac comparison Sun RA 26.65°, Dec 11.0061°; Moon RA 309.4881°, Dec −19.0741°; Mercury RA 43.2535°, Dec 19.6458°, distance 0.748262 AU. Mars and Jupiter use the tutorial's published heliocentric examples transformed to geocentric equatorial coordinates. Venus brightness and finite seasonal positions are also checked.
- Extinction uses 0.2 magnitude per Kasten–Young (1989) airmass (Applied Optics 28, 4735, doi:10.1364/AO.28.004735), finite at the horizon. Below-horizon airmass clamps to the horizon. Twilight, Moon glare, cloud loss and magnitude fading are smooth **visual heuristics**, not a sky-brightness forecast. Cloud and lunar illumination inputs are fractions in [0,1].

## Tonight and event times

`lib/nightskyTimes.ts` samples solar altitude every 10 minutes over 36 hours and bisects crossings to approximately one second. Rise/set uses −0.833° solar altitude; civil, nautical and astronomical twilight use −6°, −12° and −18°. Body events search 24 hours from the supplied date at five-minute intervals (Moon −0.833° after parallax, planets −0.567°). Transit is refined near the highest sample; null means no interior maximum/crossing in the window. Real atmospheric refraction, terrain and lunar limb geometry dominate the numerical crossing precision; allow minutes rather than seconds observationally.

Without a timezone argument, the calendar night is defined by **local mean solar time** (longitude/15 hours). From 06:00 solar time it selects the coming night; earlier hours retain the previous evening. This is not an IANA civil-time/DST calculation. Polar day/night and missing twilight crossings return null; the summary uses a zero-length polar-day night or a 24-hour polar-night interval. Planet visibility windows are sampled five-minute spans above 8° and brighter than the heuristic naked-eye limit. Tests cover crossing thresholds and order, approximate Greenwich equinox times, polar cases, longitude/date-line anchors and finite body events.

## ISS provider and approximate passes

Optional live fixes come from **Where the ISS at?**, <https://wheretheiss.at/>; API documentation <https://wheretheiss.at/w/developer>. This is a service API, not a bundled orbital-data licence or an availability guarantee. The documented limit is roughly **one request per second**, with rate headers, no API key, and up to ten timestamps per positions request. Respect the provider's current terms and rate limits.

`GET /api/sky/iss` uses the existing dashboard request guard and returns `{ fix, prevFix, fetchedAt }`, `{ disabled: true }` or `{ unavailable: true }`, with `Cache-Control: no-store`. Only the fixed HTTPS NORAD 25544 positions URL and two timestamps (now and 30 seconds earlier) leave the server. Home coordinates, plan data, HA credentials and browser identity are not forwarded. `DOSHY_EXTERNAL_DATA=0` (also off/false/no) gates fetching **before cache lookup**. No new environment setting is needed.

A process-local single-flight cache shares concurrent requests, caches success 10 seconds and failures 5 seconds. Thus one process requests at most six successful updates a minute (twelve failed attempts a minute), below the provider's published limit. Multiple server processes have independent caches. The fetch has a five-second abort deadline; actual streamed bytes are capped at 16 KiB. Invalid JSON, HTTP failure, missing/invalid fixes and timestamps more than five seconds from requested values produce unavailable, never a fabricated position. Latitude, longitude, altitude, speed, timestamp, footprint and kilometre units are validated. All provider tests inject fetch; none call the real service.

`lib/iss.ts` uses a spherical Earth for look angles and a **circular orbit**, ISS inclination 51.64°, Earth rotation and J2 nodal regression for `issAt`, `issLookAt`, `predictIssPasses` and `trail`. The previous fix resolves northbound/southbound travel; without it the model assumes northbound, which can mirror the wrong branch. This is **not SGP4/TLE**. Expect approximate timing for the next few hours and increasing drift after a day; no measured pass-accuracy guarantee is made. Refresh predictions when a fresh fix arrives. Prediction windows are capped at 48 hours; returned passes include the complete end of a pass already underway or starting before the window ends. Pure geometry tests cover overhead/opposite-side visibility, orbit anchoring, shared trail coordinates, ordered pass crossings and boundary-spanning passes. A geometric pass does not imply visible sunlight: illumination, darkness, weather and obstructions still matter.

## Offline checks

No tests were executed during this implementation. Run:

```sh
node --experimental-strip-types --test lib/nightsky.test.ts lib/planets.test.ts lib/nightskyTimes.test.ts lib/stars.test.ts lib/iss.test.ts lib/server/iss.test.ts
npm run typecheck
```
