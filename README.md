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
- **Three planners, each with its own teams**: **Builder**, **Matrix** and **Tower** (the switch next to the team count). Teams made in one don't appear in the others, so a Matrix or Tower plan never changes your builder teams.
  - **Builder teams as presets**: in Matrix and Tower, **Preset** on a team loads one of your builder teams into it (line-up and gear). The list checks each one against the plan: a resonator that would go over its Vigor (Matrix) or cost (Tower) is marked with its total, e.g. `2/1` or `14/10`, and one you haven't marked owned is dimmed. Loading is still allowed, and the slot keeps the over-limit mark.
- **Tower of Adversity**: one team per floor for the floors that matter: Resonant Tower 4, Hazard Tower 1 to 4 and Echoing Tower 4.
  - **Cost**: every resonator has 10 cost for the whole tower; each floor takes its cost from everyone on it (4 on Resonant and Echoing Tower 4, 5 on each Hazard Tower floor, as the game data gives them). All Rovers share one pool. The roster shows what each resonator has left and locks anyone who can't afford another floor; the summary lists the cost each resonator in the plan has spent.
  - **Floor info**: beside each floor, its enemies with level and element (an enemy takes less damage from its own element), the recommended elements, and the floor's buffs with element names in their colour.
  - **Always the current cycle**: the active cycle is worked out from the date and checked against the tower data, so the plan moves on by itself when a new cycle starts. **Next** plans the cycle after it. Each cycle keeps its own floor teams.
- **Matrix mode**: plans Singularity Expansion runs.
  - **Active and next patch**: the switch in the plan summary flips between the running patch and the next one (from `src/data/matrix.txt`). Each keeps its own teams, its own circuit buffs and its own +1 Vigor resonator (`bonus_now`, `bonus_next`). When the next patch's page isn't on nanoka yet, it says so and the teams can still be planned.
  - **Element resisted on the run**: once a team has points, every boss its points reach (the ones it kills and the one it stops at) is checked against the team's elements. A boss that resists a member's element gets a red mark in the run, and a note lists who is resisted by which boss in which round. Later teams are checked over their own stretch of the run.
  - **Owned roster with Vigor**: mark the resonators you own under **Manage**, then drag them from the roster onto any slot, or click one to fill the active team's next empty slot. Each use in a team costs 1 Vigor; supports have 2, and every Rover (both genders, all elements) shares a single Vigor, so a plan holds one Rover in one element. Characters out of Vigor are greyed out and can't be placed. Max Vigor can be changed per character in **Manage**.
  - **Points and boss progress**: enter each team's points. Following [wuwamatrix.com](https://wuwamatrix.com/)'s point structure, points are spent on the bosses in order (R1 boss 1 to R5 boss 5), carrying on from the teams before, so every team shows the bosses it finishes and the boss it stops at with its HP left. Points entered are damage. The Matrix Mimic dies once its points less the 1,000 kill bonus are dealt; the bonus is then added to the total (shown as **+1k** on the kill and in the round ribbon), and any further point goes into the next boss. A team whose points end exactly on a kill shows the next boss as untouched.
  - **Plan summary**: total points, rank (from the game's own thresholds) with the points to the next rank, the rank list (B to Crown II) with the ones reached lit, and a ribbon of every round showing which team dealt each boss's points.
  - **Rank medals**: the game's own medals, kept in `public/ranks/` (`b.png`, `a.png`, `s.png`, `ss.png`, `sss.png`, `crown.png`, `crown2.png`). They aren't on nanoka.cc's asset host, so these copies come from [slyraf.com](https://slyraf.com/en/wuthering-waves/matrix-planner/)'s Matrix planner (converted to 256px PNG). The Vigor icon (`public/icons/vigor.png`) comes from the same place. Replace a file there to change a medal.
  - **Circuit buffs**: pick a buff per team from a card list with the full buff text and how many other teams use it.
  - **Matrix plan export**: one PNG/JPG with the total, rank, the round ribbon and every team's buff, points and stopping boss. Like other exports, it carries the teams for import.
- **Light and dark theme**: the sun/moon button in the top bar switches it; the choice is remembered, and with no choice the system setting is followed. Image exports use the theme on screen.
- **Save and import**: everything is kept in the browser automatically. **Save** downloads a full `.json` backup: every planner's teams (builder, Matrix, each Tower cycle) and every team (characters, Sequence, weapons and rank, Sonata sets, modes, notes, circuit buffs, points), plus the owned roster, Max Vigor changes, Matrix mode and the export settings. **Import** accepts that `.json` or an image exported from this site, because exported PNG/JPG files carry their team data inside (teams only, not the roster). When a backup is imported, **Also load the roster and Matrix setup** is on by default: **Replace current** takes the saved setup as is, **Add to current** adds the saved owned resonators and Vigor changes to yours. Backups saved before this change hold teams only and still import. Images re-compressed by social media lose their data.

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

### Tower of Adversity: `src/data/tower.txt`

```ini
anchor = 41 : 2026-10-12   # a known cycle and the day it starts
days = 28                  # cycle length
cost = 10                  # cost per resonator for the whole tower
floors = 1-4, 2-1, 2-2, 2-3, 2-4, 3-4   # area-floor, in display order
```

The active cycle is counted from the anchor, then checked against the begin/end dates in nanoka's tower data (`ww/<version>/en/tower/<cycle>.json`), so the anchor rarely needs changing. Each floor's cost, enemies and buffs come from that data.

### Matrix: `src/data/matrix.txt`

Names the patch whose tower data (buffs, boss line-up, rank thresholds, enhanced resonators) is loaded from nanoka, and holds the score plan.

Only `patch` changes when a new patch comes out. The next patch is the one after it in `patches`, so a jump like 3.8 to 4.0 needs no guessing; add new versions to the end of the list when they're announced. Each patch's nanoka page is counted from `anchor` along that list (2 pages per patch).

```ini
patch = 3.8
patches = 3.6, 3.7, 3.8, 4.0, 4.1
anchor = 3.7 : 16                      # one known patch and its page
bonus_now = Lucilla                    # +1 Vigor in the running patch
bonus_next =                           # +1 Vigor in the next patch
```

```ini
round = 4680, 4680, 4680, 4680, 6665   # points per boss, one line per round
mimic_bonus = 1000                     # Matrix Mimic kill bonus
vigor = Verina : 2                     # Max Vigor (default 1)
```

Update the `round` lines when a patch changes the point structure, and `bonus_now` / `bonus_next` for each patch's featured resonator.

To refresh the `round`, `mimic_bonus` and `vigor` lines, open [wuwamatrix.com](https://wuwamatrix.com/), paste [`scripts/wuwamatrix-console.js`](scripts/wuwamatrix-console.js) into the browser console (F12) and press Enter. It prints the lines in this file's format and copies them to the clipboard.

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
    tower.ts               Tower of Adversity cycles, floors and cost
    budget.ts              Vigor (Matrix) or cost (Tower) per resonator
    fileFormat.ts          JSON payload, PNG/JPG embedding and import parsing
scripts/
  sync-roster.mjs          updates resonators.txt from encore.moe
public/
  llihc-logo.png           logo (white on transparent)
```

## Credits

Made by Llihc. Images and item data come from nanoka.cc; release order and modes come from encore.moe. Wuthering Waves and all related assets belong to Kuro Games. This is a fan-made project and is not affiliated with Kuro Games.
