import { expect, test, type Page } from "@playwright/test";
import { existsSync } from "node:fs";

type Debug = {
  lens: number;
  transforms: { today: number[] | null; future: number[] | null };
  frameMs: { p50: number; p95: number; n: number };
  anims: number;
  peek: boolean;
  future: { outdoor: number; cars: number; cyclists: number; courtShade: number; terrace: number };
  today: { outdoor: number; cars: number };
};

const errors: string[] = [];

async function boot(page: Page) {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  await page.goto("/futureshift");
  await page.waitForFunction(() => !!window.__futureshift);
  await expect(page.locator(".fs-tray.is-in")).toBeVisible();
}

const debug = (page: Page) => page.evaluate(() => window.__futureshift!.scene.debug() as unknown as Debug);
const state = (page: Page) => page.evaluate(() => window.__futureshift!.store.state);

async function settle(page: Page) {
  await page.waitForFunction(() => window.__futureshift!.scene.debug().anims === 0);
}

async function choose(page: Page, card: string, spot: string) {
  await page.click(`[data-card="${card}"]`);
  await page.click(`[data-hotspot="${spot}"]`);
  await settle(page);
}

async function toReveal(page: Page, spots: [string, string][]) {
  for (const [c, s] of spots) await choose(page, c, s);
  await page.click('[data-testid="fs-reveal"]');
  await expect(page.locator('[data-testid="fs-test"]')).toBeVisible();
}

test.afterEach(() => {
  expect(errors, errors.join("\n")).toEqual([]);
});

test("FutureShift loads on its own route with the three-choice challenge", async ({ page }) => {
  await boot(page);
  await expect(page).toHaveTitle(/FutureShift/);
  await expect(page.locator('[data-testid="fs-line"]')).toHaveText("You get 3 changes. What will your school become by 2050?");
  await expect(page.locator(".fs-card")).toHaveCount(5);
  // the campus is actually drawn
  const painted = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>(".fs-canvas")!;
    const g = c.getContext("2d")!;
    const d = g.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
    return d[3];
  });
  expect(painted).toBe(255);
});

test("the original site route still loads", async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto("/");
  await expect(page).toHaveTitle(/Stark Industries/);
});

test("Greenhold build still loads independently", async ({ page }) => {
  const file = process.env.GREENHOLD_HTML;
  test.skip(!file || !existsSync(file), "set GREENHOLD_HTML to the saved Greenhold artifact page");
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`file://${file}`);
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveTitle("Greenhold");
});

test("exactly three changes commit and a fourth is refused", async ({ page }) => {
  await boot(page);
  await choose(page, "trees", "trees-courtyard");
  await choose(page, "solar", "solar-roof");
  await choose(page, "bike", "bike-gate");
  expect((await state(page)).game.placements).toHaveLength(3);
  expect((await state(page)).game.phase).toBe("ready");
  const placed = await page.evaluate(() => window.__futureshift!.store.placeAt("rain-lowpoint"));
  expect(placed).toBe(false);
  expect((await state(page)).game.placements).toHaveLength(3);
  await expect(page.locator('[data-testid="fs-reveal"]')).toBeVisible();
});

test("undo works before the reveal", async ({ page }) => {
  await boot(page);
  await choose(page, "trees", "trees-courtyard");
  await choose(page, "rain", "rain-lowpoint");
  await page.click('[data-testid="fs-undo"]');
  const s = await state(page);
  expect(s.game.placements.map((p) => p.id)).toEqual(["trees"]);
  await expect(page.locator('[data-card="rain"]')).toBeEnabled();
  await expect(page.locator('[data-testid="fs-undo"]')).toHaveCount(0);
});

test("each change updates the matching 2050 state", async ({ page }) => {
  await boot(page);
  const before = await debug(page);
  expect(before.future.cyclists).toBe(0);
  expect(before.future.courtShade).toBe(0);
  await choose(page, "bike", "bike-gate");
  const bike = await debug(page);
  expect(bike.future.cyclists).toBeGreaterThan(0);
  expect(bike.future.cars).toBeLessThan(before.future.cars);
  expect(bike.today.cars).toBe(before.today.cars);
  await choose(page, "trees", "trees-courtyard");
  const trees = await debug(page);
  expect(trees.future.courtShade).toBeGreaterThan(0);
  expect(trees.future.outdoor).toBeGreaterThan(before.future.outdoor);
  await choose(page, "roof", "roof-cafeteria");
  const s = await state(page);
  expect(s.game.placements.map((p) => p.spot)).toEqual(["bike-gate", "trees-courtyard", "roof-cafeteria"]);
});

test("the first change opens a Future Lens preview, then the lens stays available", async ({ page }) => {
  await boot(page);
  await choose(page, "trees", "trees-courtyard");
  await page.waitForFunction(() => window.__futureshift!.scene.debug().peek === true);
  await expect(page.locator(".fs-lens.is-on")).toHaveCount(1, { timeout: 8000 });
  await expect(page.locator('[data-testid="fs-lens"]')).toBeVisible();
  await expect(page.locator('[data-testid="fs-line"]')).toContainText("Drag the 2050 lens");
});

test("Today and 2050 share an identical camera transform", async ({ page }) => {
  await boot(page);
  await toReveal(page, [
    ["trees", "trees-courtyard"],
    ["solar", "solar-canopy"],
    ["rain", "rain-lowpoint"],
  ]);
  for (const v of [0.25, 0.5, 0.75]) {
    await page.evaluate((x) => window.__futureshift!.scene.setLens(x, true), v);
    await page.waitForTimeout(80);
    const d = await debug(page);
    expect(d.transforms.today).not.toBeNull();
    expect(d.transforms.future).toEqual(d.transforms.today);
  }
});

test("Future Lens: drag, keyboard and 0/50/100 positions", async ({ page }) => {
  await boot(page);
  await toReveal(page, [
    ["trees", "trees-courtyard"],
    ["bike", "bike-gate"],
    ["rain", "rain-lowpoint"],
  ]);
  const knob = page.locator('[data-testid="fs-lens"]');
  await expect(knob).toHaveAttribute("aria-valuenow", "50");
  // drag left reveals more 2050
  const box = (await knob.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(300, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const dragged = (await debug(page)).lens;
  expect(dragged).toBeGreaterThan(0.7);
  // keyboard
  await knob.focus();
  await page.keyboard.press("Home");
  expect((await debug(page)).lens).toBe(0);
  await expect(knob).toHaveAttribute("aria-valuetext", "Today");
  await page.keyboard.press("ArrowLeft");
  expect((await debug(page)).lens).toBeCloseTo(0.05, 5);
  await page.keyboard.press("End");
  expect((await debug(page)).lens).toBe(1);
  await expect(knob).toHaveAttribute("aria-valuetext", "2050");
  await page.keyboard.press("ArrowRight");
  expect((await debug(page)).lens).toBeCloseTo(0.95, 5);

  // pixel alignment: the classroom block is unchanged by these choices,
  // so it must be identical at 0% and 100%
  const region = { x: 905, y: 228, width: 80, height: 70 };
  await page.keyboard.press("Home");
  await page.waitForTimeout(100);
  const today = await page.screenshot({ clip: region });
  await page.keyboard.press("End");
  await page.waitForTimeout(100);
  const future = await page.screenshot({ clip: region });
  expect(future.equals(today)).toBe(true);
  // 50%: divider at the centre of the screen
  await page.evaluate(() => window.__futureshift!.scene.setLens(0.5, true));
  await page.waitForTimeout(50);
  const handleX = await page.locator(".fs-lens").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
  expect(Math.round(handleX)).toBe(683);
});

test("heatwave result, bridge and replay", async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (window.__futureshift!.scene.heatMs = 2500));
  await toReveal(page, [
    ["trees", "trees-courtyard"],
    ["roof", "roof-academic"],
    ["solar", "solar-canopy"],
  ]);
  await expect(page.locator('[data-testid="fs-signals"]')).toHaveAttribute("data-cooler", "3");
  await page.click('[data-testid="fs-test"]');
  await expect(page.locator('[data-testid="fs-heat"]')).toBeVisible();
  expect((await debug(page)).lens).toBeGreaterThanOrEqual(0);
  const result = page.locator('[data-testid="fs-result"]');
  await expect(result).toBeVisible({ timeout: 10_000 });
  await expect(result).toContainText("2050 HEATWAVE PASSED");
  await expect(result).toContainText("6/8 campus zones stayed comfortable");
  await expect(result).toContainText("Clean power covered cooling demand");
  await expect(result).toContainText("Future resilience: STRONG");
  const bridge = page.locator('[data-testid="fs-bridge"]');
  await expect(bridge).toBeVisible({ timeout: 5000 });
  await expect(bridge).toContainText("Where could students safely walk or cycle instead?");
  await page.click("text=I can think of a spot");
  await expect(bridge).toContainText("on your way out tomorrow");
  await page.click('[data-testid="fs-replay"]');
  const s = await state(page);
  expect(s.game.placements).toEqual([]);
  expect(s.game.phase).toBe("choose");
  expect(s.result).toBeNull();
  await expect(page.locator(".fs-card:not([disabled])")).toHaveCount(5);
  // a second future does not show the bridge again
  await page.evaluate(() => (window.__futureshift!.scene.heatMs = 1500));
  await toReveal(page, [
    ["solar", "solar-roof"],
    ["bike", "bike-gate"],
    ["rain", "rain-lowpoint"],
  ]);
  await page.click('[data-testid="fs-test"]');
  await expect(result).toContainText("3/8 campus zones stayed comfortable", { timeout: 10_000 });
  await expect(result).toContainText("Future resilience: VULNERABLE");
  await page.waitForTimeout(1800);
  await expect(bridge).toHaveCount(0);
});

test("reduced motion: no sweep, instant lens changes, meaning intact", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await boot(page);
  await expect(page.locator(".fs-root.is-reduced")).toHaveCount(1);
  await choose(page, "trees", "trees-courtyard");
  await choose(page, "solar", "solar-roof");
  await choose(page, "bike", "bike-gate");
  await page.click('[data-testid="fs-reveal"]');
  await page.waitForTimeout(60);
  expect((await debug(page)).lens).toBe(0.5);
  await expect(page.locator('[data-testid="fs-signals"]')).toBeVisible();
  await expect(page.locator('[data-testid="fs-test"]')).toBeVisible();
});

test("frame time stays small on the competition path", async ({ page }) => {
  await boot(page);
  await toReveal(page, [
    ["trees", "trees-courtyard"],
    ["bike", "bike-gate"],
    ["roof", "roof-cafeteria"],
  ]);
  await page.waitForTimeout(2500);
  const d = await debug(page);
  expect(d.frameMs.n).toBeGreaterThan(60);
  expect(d.frameMs.p95).toBeLessThan(12);
});
