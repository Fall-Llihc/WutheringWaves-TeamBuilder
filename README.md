# WuWa Team Builder

A team planner and showcase maker for Wuthering Waves. Each team holds three resonators with their Sequence, weapon and weapon rank, Sonata Set, and combat mode, and any set of teams can be exported as a single shareable image.

## Features

- **Sequence and weapon rank badges**: every character shows an `S0`–`S6` badge and every weapon an `R1`–`R5` badge. Click a badge to change it. Badges warm up in colour as investment rises (S6 and R5 turn gold).
- **Dual-mode resonators**: characters that can play both sides of the Tune system (for example Lynae and Mornye) get a two-way **Rupture / Strain** switch under their portrait. Dual-mode characters are detected from the game's combat-role tags, so new ones are picked up automatically.
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

## Data source

Character, weapon and Sonata data and images are loaded at runtime from the public static files used by [nanoka.cc](https://ww.nanoka.cc/). The current game version is read from its manifest, and the lists are cached in `localStorage` per version, so the app keeps working offline and refreshes automatically after a game update.

## Project structure

```
src/
  App.tsx                  page layout, drag and drop, import/save, picker routing
  components/
    TeamCard.tsx           team card, character slot, mode switch
    Pickers.tsx            character / weapon / Sonata pickers
    ExportDialog.tsx       export settings, preview and image rendering
    ui.tsx                 modal, level badge, icons
  lib/
    data.ts                data loading, asset URLs, dual-mode detection
    store.ts               team state (zustand, persisted)
    layout.ts              export grid planner
    fileFormat.ts          JSON payload, PNG/JPG embedding and import parsing
```

## Credits

Game data and images come from nanoka.cc. Wuthering Waves and all related assets belong to Kuro Games. This is a fan-made project and is not affiliated with Kuro Games.
