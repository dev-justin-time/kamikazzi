# KAMIKAZZI — Asset Attribution

> **Required by the Puter App Store terms** for any non-original content
> shipped in apps deployed to the platform. This file lists every imported
> asset across the suite (3D models, audio, images, fonts, etc.) together
> with its license, source URL, author, and the verbatim attribution text
> the upstream license requires us to reproduce.
>
> **Companion folder:** `lic/` — contains the verbatim license text for each
> known asset under a subfolder named after the asset slug. The two
> sources are kept in lockstep: every entry in this file with a
> non-`NEEDS-VERIFICATION` status has a matching `lic/<slug>/LICENSE`
> file on disk.

---

## How to read this file

- **Confirmed** entries include a quoted attribution exactly as the
  upstream `license.txt` (or the project's README) requires.
- **Needs verification** entries are assets pulled into the suite from
  in-house or unknown sources; they need a maintainer to confirm the
  upstream license before they ship to Puter App Store.
- To check plain ASCII filenames in `lic/`, run:

  ```bash
  ls lic/
  ```

---

## Confirmed attributions (verbatim from upstream `license.txt`)

### 1. `stylized-ww1-plane`  ·  Helijah  ·  CC-BY-4.0

- **Asset path:** _Inferred_ — referenced in `README.md` as _"Plane model: 'Stylized WW1 Plane' by Helijah (CC-BY)"_; no on-disk `license.txt` ships with the file in this repo.
- **Source URL:** <https://sketchfab.com/3d-models/stylized-ww1-plane-25bc66a3b3b2413f8786b29c6f331a35> (canonical Sketchfab listing for Helijah's CC-BY model set)
- **Author:** Helijah
- **License:** CC-BY-4.0 (<https://creativecommons.org/licenses/by/4.0/>)
- **Required attribution text** _(verbatim from upstream README + CC-BY 4.0 §3(a)3)_:

  > _"Stylized WW1 Plane" by **Helijah** is licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**._

  - This is reproduced in the suite's root `README.md` (License section).
- **`lic/stylized-ww1-plane/LICENSE.txt`:** a copy of the CC-BY-4.0 legal code URL + author / source pointer.

---

### 2. `boeing-stearman-model-75`  ·  Stéphane Agullo  ·  CC-BY-4.0

- **Asset path:** `kamakazii_3d_aero_comand/assets/model/BOEING/` (`stearman.glb` and siblings).
- **Source URL:** upstream-provided in asset-level `license.txt` — `<https://www.cgtrader.com/3d-models>` (queryable for "BOEING-STEARMAN").
- **Author:** Stéphane Agullo
- **License:** CC-BY-4.0 (<https://creativecommons.org/licenses/by/4.0/>)
- **Required attribution text** _(verbatim upstream)_:

  > Title: **BOEING-STEARMAN MODEL 75**
  > Author: **Stéphane Agullo**
  > License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**
  > Source: CGTrader listing (URL preserved in `lic/boeing-stearman-model-75/LICENSE.txt`)

- **`lic/boeing-stearman-model-75/LICENSE.txt`:** verbatim upstream `license.txt`.

---

### 3. `rain-1`  ·  Paxar095  ·  CC-BY-4.0

- **Asset path:** `kamakazii_3d_aero_comand/assets/model/rain_1/`.
- **Source URL:** upstream-provided — see `lic/rain-1/LICENSE.txt`.
- **Author:** Paxar095
- **License:** CC-BY-4.0
- **Required attribution text** _(verbatim upstream)_:

  > Title: **Rain 1**
  > Author: **Paxar095**
  > License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**

- **`lic/rain-1/LICENSE.txt`:** verbatim upstream `license.txt`.

---

### 4. `90s-vaporwave-neon-grid-animated`  ·  Diego T. Yamaguchi  ·  CC-BY-4.0

- **Asset path:** `kamasazii_vecter_omega3d/assets/models/90s_vaporwave_neon_grid_animated (1)/`.
- **Source URL:** upstream-provided — see `lic/90s-vaporwave-neon-grid-animated/LICENSE.txt`.
- **Author:** Diego T. Yamaguchi
- **License:** CC-BY-4.0
- **Required attribution text** _(verbatim upstream)_:

  > Title: **90s Vaporwave Neon Grid (animated)**
  > Author: **Diego T. Yamaguchi**
  > License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**

- **`lic/90s-vaporwave-neon-grid-animated/LICENSE.txt`:** verbatim upstream `license.txt`.

---

### 5. `cyberpunk-city`  ·  Pasha  ·  CC-BY-4.0

- **Asset path:** `kamasazii_vecter_omega3d/assets/models/cyberpunk_city/`.
- **Source URL:** upstream-provided — see `lic/cyberpunk-city/LICENSE.txt`.
- **Author:** Pasha
- **License:** CC-BY-4.0
- **Required attribution text** _(verbatim upstream)_:

  > Title: **Cyberpunk city**
  > Author: **Pasha**
  > License: **Creative Commons Attribution 4.0 International (CC BY 4.0)**

- **`lic/cyberpunk-city/LICENSE.txt`:** verbatim upstream `license.txt`.

---

## Needs verification (audit queue)

The following assets are committed to the suite but **do not ship an
upstream `license.txt` and have no documented source URL**. Per Puter App
Store terms, every non-original asset must have a confirmed license
**before the suite ships**. Each item below is marked with the disk-served
path so a maintainer can grep for it.

### 3D models

| Asset slug | Path | Sub-app |
|---|---|---|
| `star-sparrow-modular-spaceship` | `kamasazii_vecter_omega3d/assets/star-sparrow-modular-spaceship (1).glb` | vecter_omega3d |
| `simba` | `kamakazii_studio3D/assets/models/simba.glb` | studio3D |
| `concretefloor038b` (texture) | `kamakazii_studio3D/assets/textures/concretefloor038b.png` | studio3D |
| `player` | `kamakazii_studio3D/assets/.../player.glb` _if present_ | studio3D |

### Images / photos

| Asset slug | Path | Sub-app |
|---|---|---|
| `image-clipboard01` | `kamakazii_3d_aero_comand/assets/image/*.png|*.jpg|*.webp` | aero_comand |
| `image-china-city-1` | same folder | aero_comand |
| `image-explode` | same folder | aero_comand |
| `graffiti-*` (10+ files) | `kamakazii_3d_aero_comand/assets/graffiti/*.png` | aero_comand |
| `floor-FLOOR` | `kamakazii_3d_aero_comand/assets/FLOOR/FLOOR.png` | aero_comand |
| `floor-map` | `kamakazii_3d_aero_comand/assets/FLOOR/map.png` | aero_comand |

### Audio

| Asset slug | Path | Sub-app |
|---|---|---|
| `audio-airplane` | `kamakazii_3d_aero_comand/assets/audio/airplane.wav` | aero_comand |
| `audio-explosion` | `kamakazii_3d_aero_comand/assets/audio/explosion.wav` | aero_comand |
| `audio-powerup-boost` | same folder | aero_comand |
| `audio-powerup-magnet` | same folder | aero_comand |
| `audio-powerup-score2x` | same folder | aero_comand |
| `audio-powerup-shield` | same folder | aero_comand |
| `audio-powerup-slowmo` | same folder | aero_comand |
| `audio-powerup-stamina` | same folder | aero_comand |
| `audio-sg-click` | same folder | aero_comand |
| `audio-sg-terrain-gen` | same folder | aero_comand |
| `audio-mp3` (tools/pose + tools/blender + scripts) | various `.mp3` / `.wav` under `tools/*/assets/` | studio3D |

### Icons

| Asset slug | Path | Sub-app |
|---|---|---|
| `icon-192` | `kamakazii_3d_aero_comand/assets/icons/icon-192.png` | aero_comand |
| `icon-512` | `kamakazii_3d_aero_comand/assets/icons/icon-512.png` | aero_comand |
| `icon-apple-touch` | `kamakazii_3d_aero_comand/assets/icons/apple-touch-icon.png` | aero_comand |
| `icon-svg` | `kamakazii_3d_aero_comand/assets/icons/icon.svg` | aero_comand |

> For each row, a maintainer must either:
> 1. Replace the file with an original asset, OR
> 2. Add a `lic/<slug>/LICENSE.txt` file and a row in this document,
> 3. OR remove the asset from `git` history (`git rm` + add to `.gitignore`).

---

## Per-app notes

- **`kamakazii_3d_aero_comand`** — end-of-list attribution lines are
  consolidated in this root file. Each per-asset `LICENSE` lives in
  `lic/<slug>/LICENSE.txt` for slash-and-burn readability.
- **`kamakazii_studio3D`** — runs a `marketplace/LicenseManager.js` module
  that programmatically tracks third-party license templates. The hand-rolled
  attribution table above is the canonical readable source; LicenseManager
  is the runtime lookup for assets loaded through the marketplace API.
- **`kamasazii_vecter_omega3d`** — its in-tree `*license.txt` files have
  been mirrored into `lic/<slug>/LICENSE.txt` for unified auditing.

---

## How to add a new asset

1. Drop the asset into the appropriate sub-app's `assets/` directory.
2. If the upstream ships a `license.txt`, copy it to `lic/<slug>/LICENSE.txt`.
3. Add a row to the **Confirmed attributions** section of this file, with:
   - slug: lowercase, hyphenated
   - path, source URL, author, license, **verbatim** required attribution
4. If the asset is original, drop a `lic/<slug>/LICENSE.txt` with:

   ```
   This asset is original work by the KAMIKAZZI team.
   No redistribution restrictions beyond the suite's MIT license.
   ```

5. Commit `ATTRIBUTION.md` and `lic/<slug>/LICENSE.txt` in the same
   change as the asset itself.

---

## License of this document

This `ATTRIBUTION.md` is original work by the KAMIKAZZI team and is
released under the suite's MIT license. The license texts inside each
`lic/<slug>/LICENSE.txt` belong to their respective upstream authors and
are reproduced verbatim per their respective license terms.
