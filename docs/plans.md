# Several plans

Doshy keeps more than one plan: a second home, a garden design, a holiday house, or a copy of your flat to try a new layout. Every plan has its own walls, rooms, furniture, levels, surroundings and view settings. Switching is one tap and never loses an edit.

## Create a plan

1. Open the plan name in the top-left corner (on a small screen: the name in the top strip), then **New plan**. Or open **Plans** in the dock (the Menu on a small screen), or press the command palette and type "new plan".
2. Choose what to start from: **Blank**, **Starter flat**, **Copy of** the plan on screen, or **Import a file** (a plan file exported from Doshy).
3. Give it a name, an icon and a colour (a description is optional) and press **Create plan**. The new plan is shown at once.

A plan file keeps its name, icon and colour, so an imported plan arrives looking like the one that was exported. A name that is already taken gets a number ("Garden 2").

You can keep up to 24 plans.

## Switch between plans

- Tap the plan name in the corner and tap another plan. The list shows a picture, the numbers and which plan is the default. Arrow keys, Enter and Esc work too.
- Or use the command palette: **Switch plan...**.
- Unsent edits are sent first. If that fails the screen says "Sending your latest changes failed, so Doshy stayed on this plan" and offers **Try again**.
- Each device remembers the plan it last showed. Live Home Assistant data stays as it is; the camera, selection and undo history start fresh in the new plan.

## Manage plans

**Plans** in the dock opens the manager: a card for each plan with its picture, name, what is in it, when it changed, **Default for new devices** and **This device** badges. Under **More**: rename or edit (name, description, icon, colour), duplicate, make default, copy a link, export, move up or down, delete.

- **Default for new devices.** A device that never picked a plan shows the default plan. The **curtain automation reads only the default plan**.
- **Delete.** Asked first, then a message with **Undo** stays for 10 seconds (the server keeps a deleted plan for 7 days). The default plan and your last plan cannot be deleted; make another plan the default first.
- **Export this plan** saves `doshy-plan.json`; **Import a file** in New plan reads it as a new plan. (**Import plan** in the Plan dock still replaces the plan on screen, and **Templates** replaces it with a template.)
- If a plan is deleted on another device while you have it open, Doshy shows the default plan and says so ("This plan was deleted on another device. Showing Home."); this device's copy is kept in the stash.

## Pin a device to one plan (wall display)

**Copy a link that opens this plan** (More, or the command palette) gives an address ending in `?plan=<id>`. Use it as the kiosk address, for example `http://doshy.local:3000/?kiosk=1&plan=2`. The `plan` in the address wins over what the device remembers. Switching plans on such a device rewrites the address. If the plan is gone, the default plan is shown with a notice.

Plain `http` pages cannot always use the clipboard; then Doshy shows the link so you can copy it by hand.

## What is global and what belongs to a plan

| Item | Scope |
|---|---|
| Home Assistant connection | Global |
| Graphics quality, display, layout, calendar card preferences, renderer | Global, per device |
| Custom pieces catalog, car models, favourites | Global |
| Imported 3D models, photos, city models | Global shared library (deleting a plan never deletes files; duplicating copies references) |
| Calendar events | Global |
| Live layer choice, paint, declutter, sky, recent | Global |
| Walls, doors, rooms, furniture, levels, ground, paths, flows, surroundings, bearing, entity links | Per plan |
| Time of day, cut-away, view, environment, opening defaults, active level | Per plan |
| Saved versions and undo | Per plan (the undo stack is cleared on switch) |
| Camera | Not saved; resets on switch |
| Curtain automation | Reads only the default plan |
| WashData, notifications, calendar services | Plan-independent |
| Which plan a device shows | Per device (`?plan=` in the address wins) |

## Pictures

Each plan has a small top-down picture (`lib/planThumb.ts`, drawn without WebGL). The plan on screen uploads its picture about 30 seconds after the last edit, only if the picture changed, never during a drag, while the tab is hidden or the screensaver is up. Plans never opened on a screen are drawn from their data when the manager shows them. A browser that cannot encode WebP draws the pictures itself instead of uploading.

For developers: the code word is "dashboard" (`/api/db/dashboards`, `lib/activePlan.ts`), the design is in [multi-plan-design.md](multi-plan-design.md).
