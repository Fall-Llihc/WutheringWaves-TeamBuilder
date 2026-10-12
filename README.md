# WuWa Team Builder

A team planner and showcase maker for Wuthering Waves. Each team holds three resonators with their Sequence, weapon and weapon rank, Sonata Set, and combat mode, and any set of teams can be exported as a single shareable image.

## Features

- **Sequence and weapon rank badges**: every character shows an `S0`–`S6` badge and every weapon an `R1`–`R5` badge. Click a badge to change it. Maxed badges (S6, R5) turn red.
- **Dual-mode resonators**: Lynae, Aemeath, Denia, Lucilla and Hsin get a two-way Resonance Mode switch under their portrait (for example **Unison / Electro Flare** for Hsin).
- **One Rover per gender**: Rover (Male) and Rover (Female) each switch element (Spectro, Havoc, Aero, Electro) with an element-icon switch. Rover shows up under every one of those elements in the picker filter.
- **Newest first**: the character picker lists resonators in release order, newest at the top.
- **Drag and drop across teams**: drag a character onto another slot in any team. Dropping on a filled slot swaps the two (with their weapons, Sonatas and badges); dropping on an empty slot moves it. A team can never end up with the same character twice.
- **Weapon and Sonata pickers**: weapons are filtered to the character's weapon type, with an option to show all.
- **Team name and notes**: the name is the team title; notes are a separate free-text field (rotation, echo stats, and so on).
- **Image export (PNG or JPG)**: teams are laid out in symmetric blocks of at most 3x3, stacked top to bottom:

  | Teams | Layout |
  | --- | --- |
  | 4 | 2x2 |
  | 6 | 2 rows of 3 |
  | 7 | 2x2 + row of 3 |
  | 8 | 2x2 + 2x2 |
  | 9 | 3x3 |
  | 10 | 2x3 + 2x2 |
  | 13 | 3x3 + 2x2 |

  Untick **Export** on a team to leave it out. PNG is the default because text and badges stay sharp; JPG produces a smaller file.
- **Save and import**: teams are kept in the browser automatically. **Save file** downloads a `.json` backup. **Import** accepts that `.json` or an image exported from this site, because exported PNG/JPG files carry their team data inside. Images re-compressed by social media lose that data.

## Getting started

Requires Node.js 18 or newer.

```bash
npm install
npm run dev      # local development server
npm run build    # production build in dist/
npm run preview  # serve the production build
```

The `dist/` folder is a static site and can be deployed to GitHub Pages, Vercel, Netlify or any static host. Asset paths are relative, so it also works from a sub-path.

## Data sources

### Resonator list: `src/data/resonators.txt`

The resonator list lives in a single file: [`src/data/resonators.txt`](src/data/resonators.txt). It decides which resonators exist, their order, their modes, element and weapon. Each line has this format, newest first:

```
Name ; Mode ; Element ; Weapon

Suoming ; single ; Electro ; Sword
Hsin ; Unison / Electro Flare ; Electro ; Rectifier
Rover (Female) ; element ; Spectro / Havoc / Aero / Electro ; Sword
```

- **Mode**: `single`, two mode names separated by `/` (the first is the default), or `element` for a resonator that switches element.
- **Element**: one element, or several separated by `/` for an element-switching resonator.
- Names must match the game's English name so the picture can be found. A resonator the image host doesn't have yet still appears, with its initial in place of art.

To update the list after a game patch, run:

```bash
npm run roster            # add new resonators and write the file
npm run roster -- --check # report only
```

The script reads [encore.moe](https://encore.moe/)'s API. It takes the release order from the in-game `Priority` field and finds dual-mode resonators by looking for "Resonance Mode - …" in their skill text. Lines already in the file are kept as written, so manual edits are not overwritten. When the file and the API disagree, the script lists the difference so you can check it.

The app still shows a resonator that the file doesn't list yet. It goes at the top of the picker, and its modes are detected the same way.

### Images, weapons and Sonata sets

Images, rarity, weapons and Sonata sets are loaded at runtime from the public static files used by [nanoka.cc](https://ww.nanoka.cc/). The current game version is read from its manifest, and the data is cached in `localStorage` per version, so the app keeps working offline.

## Project structure

```
src/
  App.tsx                  page layout, drag and drop, import/save, picker routing
  components/
    TeamCard.tsx           team card, character slot, mode switch
    Pickers.tsx            character / weapon / Sonata pickers
    ExportDialog.tsx       export settings, preview and image rendering
    ui.tsx                 modal, level badge, icons, element icon
  data/
    resonators.txt         resonator list (names, order, modes, element, weapon)
  lib/
    roster.ts              parser for resonators.txt
    data.ts                merges the list with nanoka.cc data, asset URLs
    game.ts                game-data store, character lookup, modes
    store.ts               team state (zustand, persisted)
    layout.ts              export grid planner
    fileFormat.ts          JSON payload, PNG/JPG embedding and import parsing
scripts/
  sync-roster.mjs          updates resonators.txt from encore.moe
public/
  llihc-logo.png           logo (white on transparent)
```

## Credits

Made by Llihc. Images and item data come from nanoka.cc; release order and modes come from encore.moe. Wuthering Waves and all related assets belong to Kuro Games. This is a fan-made project and is not affiliated with Kuro Games.
