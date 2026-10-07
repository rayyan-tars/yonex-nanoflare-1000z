# EcoRise — Release Candidate Kit

EcoRise is **feature-frozen** as of Phase 5. From here on we only fix real bugs, serious confusion, performance problems, broken layouts and deployment issues. Simulation numbers, progression, mission logic and playtest logic do not change.

Everything below is a checklist or a blank template. Nothing in this file is a result: fill in real measurements and real feedback only.

---

## 1. Deploying to Vercel

1. Go to **vercel.com/new**, sign in with GitHub, import **rayyan-tars/yonex-nanoflare-1000z**.
2. Framework: **Next.js** (auto-detected). Build command `next build`, output default, install command default. No environment variables or secrets.
3. Set the production branch to the EcoRise branch (or merge it first), then **Deploy**.
4. Share **`https://<project>.vercel.app/ecorise`**. The site root `/` is a different page (the Iron Man site), so always link `/ecorise` directly.
5. After deploying, open `/ecorise` in a private window: the intro should appear, a lunch should play, and a page refresh should keep progress.

Notes: the `/ecorise` route is static and loads the game in the browser only; fonts are bundled at build time with serif/sans fallbacks; progress lives in the browser's local storage (per device and browser); developer information only appears with `?debug=1`.

---

## 2. Performance test — Dell XPS 15 9575 (i7-8705G, 16 GB, Radeon RX Vega M GL)

Not yet verified on real hardware. These numbers must come from your laptop.

**Before you start**
- Plug in the charger; Windows power mode *Best performance*.
- Chrome, one tab, browser zoom 100%. Check `chrome://gpu` says *Hardware accelerated* for WebGL.
- Note your Windows display scaling (Settings → Display), e.g. 100% / 150% / 250%.
- Open `…/ecorise?debug=1`. The dark strip at the top left shows FPS, renderer and resolution. Read it for about 10 seconds and write down the **typical** value and the **lowest** you see.
- Use **Settings → For the team → Reset demo** between runs.

**Runs**
1. **Idle**: close the panel (Esc) and watch the campus.
2. **Lunch service**: Plan lunch → 140 portions → Serve lunch, at 1×, from start to results.
3. **Construction**: after a lunch that feeds everyone → Improve campus → Choose plot → Build. Watch the ~5 s sequence.
4. **While recording**: start your screen recorder (e.g. Xbox Game Bar Win+Alt+R, or OBS at 1080p 60 fps) and repeat run 2.
5. Repeat runs 1–4 after **Settings → Graphics → Performance**.

| Mode | Run | Typical FPS | Lowest FPS | Stutters? (y/n) | Notes |
|---|---|---|---|---|---|
| Sharp | Idle | | | | |
| Sharp | Lunch service | | | | |
| Sharp | Construction | | | | |
| Sharp | Service while recording | | | | |
| Performance | Idle | | | | |
| Performance | Lunch service | | | | |
| Performance | Construction | | | | |
| Performance | Service while recording | | | | |

Display scaling: ____ % Debug strip resolution: ________ Chrome version: ______

**How to read it**
- **Good**: 50–60 FPS, no visible hitches.
- **Acceptable**: 30–50 FPS and motion still looks smooth; fine for playtests and recording.
- **Problematic**: below 30 FPS, regular hitches, or the recording drops frames. Then try Performance mode, close other apps, or record at 30 fps, and send me the table.

---

## 3. Student playtest protocol (3–5 students)

**Setup (once):** charged laptop, mouse, Chrome, `…/ecorise`. Settings → For the team → **Start playtest** before each student (it restarts a clean Monday and keeps earlier records).

**What you say — only this:** "Try this game and tell me what you think." If they ask how to play: "Do whatever you think makes sense." Help only if they are completely stuck for about a minute; note that you helped.

**Let them play 8–10 minutes.** When they stop, press **Finish** (top bar) and let them answer the three questions themselves. Then a short chat: "What was confusing? What did you like?"

**Quietly observe and tick (don't prompt):**

| Observation | Yes / Partly / No | Note where they hesitated |
|---|---|---|
| Understood the goal (feed everyone, waste less) without help | | |
| Read or used Student Voice (RSVP / Small, please / Feedback) | | |
| Understood the portions slider and the expected-students range | | |
| Understood why cooking too little is bad (students miss lunch) | | |
| Noticed waste in the world (leftover pots, scraps bin, labels) | | |
| Results made sense (stars, waste per meal, business as usual) | | |
| Understood what Eco Credits are for | | |
| Built the Planning Hub | | |
| Understood what changed afterwards (narrower forecast) | | |
| Noticed / opened the Waste Audit board | | |
| Played a second lunch on their own | | |

After all sessions: Settings → **Playtest summary** → **Copy Playtest Summary** and paste it into the feedback log. Don't edit their answers.

---

## 4. Adult / mentor questions (one person, ~10 minutes)

Ideally cafeteria staff, a sustainability teacher, a CAS advisor, an administrator or a mentor. Show them one lunch and the Waste Audit (demo data is fine), then ask:

1. Does the cafeteria problem in EcoRise — uncertain attendance, fixed portions, food left on plates or never served — match what really happens in a school kitchen? What's missing or wrong?
2. Could students realistically run the Cafeteria Waste Audit (weighing plate waste and unserved food, counting meals) in our school? What would get in the way?
3. Which of the five changes (better RSVP, smaller first servings, student feedback, adjusting preparation, menu communication) are actually feasible here, and which aren't?
4. Is anything in EcoRise misleading, oversimplified in a harmful way, or likely to be misunderstood?
5. What would make EcoRise genuinely useful in a real school?

Write down what they actually say, close to their words. Ask permission before quoting them by role.

---

## 5. Feedback log (keep it short)

| # | Date | Who (role, no names for students) | What they said | Problem noticed | Priority | What we changed | Why | Did it help? |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |

**Priority** — decide before changing anything:
- **Critical**: blocks playing or demoing, or makes a false claim. Fix.
- **Important**: several people confused at the same point. Fix if the change is small and safe.
- **Minor**: one person, small wording or layout. Batch, maybe fix.
- **Preference**: taste ("I'd like more buildings"). Record, don't build now.

Bug priority for the release candidate: **P0** blocks the demo or submission (fix); **P1** confusing or visibly broken (fix if safe); **P2** cosmetic (leave unless trivial).

---

## 6. Data labels (must stay distinct)

| Kind of data | Label shown |
|---|---|
| Lunch results from the game | **SIMULATED LUNCH** |
| Audit walkthrough with built-in values | **DEMO DATA** |
| Numbers you enter from your school | **SCHOOL MEASUREMENT** |
| Playtest sessions with real players | **RECORDED PLAYTEST** |
| Developer sample sessions (`?debug=1` only) | **DEMO PLAYTEST DATA** (never copied) |

---

## 7. Recommended recording path (~3 min of gameplay)

Start from **Reset demo** (Settings → For the team): it brings back the Message from 2050 and hides the 2050 view until it is earned again. Graphics: Sharp if your FPS table allows.

| # | Clip | What to do | Length |
|---|---|---|---|
| 1 | Message from 2050 | Let the two lines play (or press Continue) | 5–8 s |
| 2 | Monday problem | Intro card over the campus: "110–140 students may come" → Start today | 6–8 s |
| 3 | Student Voice | Choose RSVP and Feedback; the Feedback reveal appears | 8–10 s |
| 4 | Plan portions | Turn on small servings, set 115 portions; show the risk meters | 8–10 s |
| 5 | Serve Lunch | Press Serve lunch: camera leans in, hatch lights, "Lunch is served" | 4 s |
| 6 | Students queue | Let the queue and trays play at 1× | 10–12 s |
| 7 | Visible consequences | Leftover pots, scraps bin and labels at the end of service | 5–6 s |
| 8 | Results | Stars, headline number, business-as-usual bars, Eco Credits | 8–10 s |
| 9 | Timeline changed | Plays automatically after a strong lunch | 3–4 s |
| 10 | Two Futures | Drag the 2050 handle slowly from one side to the other, then Back to today | 8–12 s |
| 11 | Construction | Improve campus → Build → the full sequence | 7–8 s |
| 12 | Narrower forecast | Built card (before → now), then the planning forecast with the hub tag | 6–8 s |
| 13 | Future again (optional) | Top-bar **2050**: the food-smart side now shows the upgraded hub | 4–6 s |
| 14 | Sustainability Board + Waste Audit | Click the board → Try with demo data → step through → DEMO DATA result | 15–20 s |

Optional B-roll: a separate short take of a **shortage** (90 portions) for the "Food ran out" moment, 8–10 s. Do not show a completed school audit unless your school really did one. The 2050 views are illustrative scenarios, not predictions; keep that wording if you narrate them.

## 8. Screenshot checklist

- [ ] Clean campus (panel closed, after a Reset demo)
- [ ] Planning screen (Lunch Council with Student Voice chosen)
- [ ] Lunch service in progress (queue and live counter)
- [ ] Successful result (3 stars)
- [ ] Bad-result consequence (food ran out, or leftover pots)
- [ ] Planning Hub construction (mid-sequence with scaffolding)
- [ ] Campus after the upgrade (hub, planters, students)
- [ ] Two Futures with the handle near the middle (both sides visible)
- [ ] Message from 2050
- [ ] Waste Audit (DEMO DATA label visible)
- [ ] Playtest summary — **only after real playtests**, never with test entries

Use `?debug=1` only for the performance table, never for submission screenshots.
