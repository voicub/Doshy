# Credits and third-party data

Doshy ships no third-party data or 3D models. It fetches the following at run time, on the machine that runs the server, only when the matching feature is used.

| source | used for | terms |
|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/copyright) via the Overpass API | Surroundings: buildings, trees, roads, water | ODbL; the credit "(c) OpenStreetMap contributors (ODbL)" is shown in the Surroundings panel |
| Elevation: Copernicus DEM via [Open-Meteo](https://open-meteo.com/) | Surroundings: ground height | credit "Elevation: Copernicus DEM via Open-Meteo" shown in the panel |
| Esri World Imagery (default; `SITE_TILE_URL` replaces it) | Surroundings: optional satellite photo, off by default | Esri/Maxar/Earthstar terms; credit shown with the photo (`SITE_TILE_CREDIT` overrides the text). Check your provider's terms before changing the URL. |
| [Sketchfab](https://sketchfab.com) Download API | optional real 3D car models, with your own token | only CC0, CC BY and CC BY-SA models are offered; author, licence, source and an attribution line are stored with each model and listed under "3D model credits" in the app |
| [WashData](https://github.com/3dg1luk43/ha_washdata) | optional Home Assistant integration read by the dashboard | its own licence; nothing is bundled |

Fonts: [Geist](https://github.com/vercel/geist-font) (SIL OFL 1.1) through the `geist` package. Icons: [Phosphor](https://phosphoricons.com) (MIT).
