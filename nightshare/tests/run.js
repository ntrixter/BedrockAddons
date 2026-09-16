// Nightshare test harness.
//
// Runs the shipping pack scripts against a mock of @minecraft/server, driving a
// simulated clock so the share maths, the dawn clamp and the roster rules can be
// checked without launching Minecraft. loader.js redirects the pack's
// "@minecraft/server" imports to mock-server.js, so the shipping scripts load
// unmodified with no install step.
//
//   cd nightshare/tests && node --import ./register.js run.js
//
// It cannot verify anything that depends on the real game: when isSleeping
// actually flips, the true Bedrock sleep window, or whether the fast-forward
// looks smooth on a client. See README.md "Confirm in-game".

import { state, world, makePlayer, tick } from "@minecraft/server";
import * as cfg from "../behavior_pack/scripts/config.js";
import * as ledger from "../behavior_pack/scripts/ledger.js";
import "../behavior_pack/scripts/main.js";
import * as guard from "../behavior_pack/scripts/guard.js";
import * as settings from "../behavior_pack/scripts/settings.js";
import { readFileSync } from "node:fs";

let failures = 0;
function check(label, actual, expected, tol = 0) {
  const ok = typeof expected === "number" ? Math.abs(actual - expected) <= tol : actual === expected;
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: got ${actual}${ok ? "" : `, want ${expected}`}`);
}

let ticksRun = 0;
function run(n) { for (let i = 0; i < n; i++) { tick(); ticksRun++; } }

/** Wall-clock movement beyond the one tick per tick the world gives for free. */
function burnedSince(mark) {
  return (state.absoluteTime - mark.time) - (ticksRun - mark.ticks);
}
function mark() { return { time: state.absoluteTime, ticks: ticksRun }; }

function reset(players, atTick = cfg.NIGHT_START) {
  state.players = players;
  state.absoluteTime = 5 * 24000 + atTick;
  state.props.clear();
  state.messages.length = 0;
  state.actionBars.length = 0;
  state.gameRules.playersSleepingPercentage = 100;   // a stock world's setting
  state.vanillaSkipEnabled = false;                  // opt in per scenario
  state.rested.length = 0;
  state.vanillaSkips = 0;
  state.packSettings = {};                           // gear screen untouched
  state.packSettingsSupported = true;
  settings.init();
  state.onScriptEvent({ id: "nightshare:reset" });   // clears in-memory ledger too
  state.messages.length = 0;
  run(cfg.SCAN_INTERVAL * 2);
}

const sleepPct = () => world.gameRules.playersSleepingPercentage;
const quoted = (k) => String.fromCharCode(34) + k + String.fromCharCode(34) + ":";

/** In bed long enough to bank, then up, then let the burn finish draining. */
function sleep(p, settle = 1500) {
  p.isSleeping = true; run(40); p.isSleeping = false;
  for (let i = 0; i < settle && ledger.get().pendingTicks > 0; i++) run(1);
}

const SPAN = cfg.SPAN;

console.log("");
console.log("1. By default vanilla is left alone to fire when it can");
{
  // Nightshare speeds the night along when not everyone can sleep. Once
  // everyone who *can* sleep has, vanilla ending the night is the right
  // answer, so the default never touches the gamerule - and so never shows
  // players the "Skip night by sleeping is turned off" bed message.
  const solo = makePlayer("Solo");
  reset([solo]);
  check("single player: gamerule untouched", sleepPct(), 100);
  solo.isSleeping = true;
  run(40);
  check("still untouched with the player in bed", sleepPct(), 100);
  solo.isSleeping = false;

  const ps = ["M1", "M2", "M3"].map((n) => makePlayer(n));
  reset(ps);
  ps[2].dimension = { id: "minecraft:nether" };
  run(cfg.SCAN_INTERVAL * 3);
  check("a roster member in the Nether does not engage it", sleepPct(), 100);
  ps[1].online = false;
  run(cfg.SCAN_INTERVAL * 3);
  check("nor does a logout", sleepPct(), 100);
}

console.log("");
console.log("1b. auto mode holds vanilla off only while a roster member is away");
{
  reset([makePlayer("G1")]);
  guard.sync(false, "auto");
  check("idle while everyone is present", sleepPct(), 100);
  guard.sync(true, "auto");
  check("engaged once someone is away", sleepPct(), 101);
  guard.sync(true, "auto");
  check("engaging twice is harmless", sleepPct(), 101);
  guard.sync(false, "auto");
  check("handed back when they return", sleepPct(), 100);
}

console.log("");
console.log("1c. Guard bookkeeping across modes and upgrades");
{
  reset([makePlayer("H1")]);
  state.gameRules.playersSleepingPercentage = 50;   // a world that chose its own
  guard.sync(true, "auto");
  check("engaged over a custom setting", sleepPct(), 101);
  guard.sync(false, "auto");
  check("hands back the custom value, not 100", sleepPct(), 50);

  guard.sync(false, "always");
  check("always mode engages regardless of who is away", sleepPct(), 101);
  guard.sync(false, "off");
  check("off mode releases what another mode took", sleepPct(), 50);

  // A world upgrading from 1.0.0 arrives pinned at 101 with nothing recorded.
  reset([makePlayer("Legacy")]);
  state.gameRules.playersSleepingPercentage = 101;
  guard.migrate();
  check("1.0.0 leftover guard is undone on upgrade", sleepPct(), 100);

  // But a deliberate 101 set afterwards is the player to keep.
  state.gameRules.playersSleepingPercentage = 101;
  guard.migrate();
  run(cfg.SCAN_INTERVAL * 2);
  check("a deliberate 101 is left alone after migrating", sleepPct(), 101);
}

console.log("\n2. Solo play is identical to vanilla (full skip, day advances cleanly)");
{
  const solo = makePlayer("Solo");
  reset([solo]);
  const day0 = world.getDay();
  sleep(solo);
  check("clock parked one tick short of midnight roll", world.getTimeOfDay(), 23999);
  check("day counter still on the old day", world.getDay(), day0);
  run(3);
  check("natural cycle rolled the day exactly once", world.getDay() - day0, 1);
  check("queue fully drained", ledger.get().pendingTicks, 0);
}

console.log("\n3. Six of ten sleep asynchronously -> 60% of the night");
{
  const ps = Array.from({ length: 10 }, (_, i) => makePlayer(`P${i}`));
  reset(ps);
  const m = mark();
  for (let i = 0; i < 6; i++) sleep(ps[i]);
  check("burned ~= 60% of span", burnedSince(m), SPAN * 0.6, 8);
  check("as a percentage", Math.round((burnedSince(m) / SPAN) * 100), 60);
  check("one announcement each", state.messages.length, 6);
}

console.log("\n4. One of ten sleeps -> 10%, night keeps running");
{
  const ps = Array.from({ length: 10 }, (_, i) => makePlayer(`Q${i}`));
  reset(ps);
  const m = mark();
  sleep(ps[0]);
  check("burned ~= 10% of span", burnedSince(m), SPAN * 0.1, 8);
  check("still night", world.getTimeOfDay() < 23999, true);
}

console.log("\n5. Sleeping twice does not donate twice");
{
  const ps = ["A", "B", "C", "D"].map((n) => makePlayer(n));
  reset(ps);
  const m1 = mark();
  sleep(ps[0]);
  check("first sleep burned a quarter", burnedSince(m1), SPAN * 0.25, 8);
  const m2 = mark();
  sleep(ps[0]);
  check("second sleep burned nothing", burnedSince(m2), 0);
  check("told they already gave", state.actionBars.some((s) => s.includes("already given")), true);
}

console.log("\n6. Nether/End players are excluded from N");
{
  const ps = [
    ...Array.from({ length: 6 }, (_, i) => makePlayer(`O${i}`)),
    ...Array.from({ length: 4 }, (_, i) => makePlayer(`N${i}`, "minecraft:nether")),
  ];
  reset(ps);
  check("N counts only the Overworld six", ledger.get().roster.length, 6);
  const m = mark();
  for (let i = 0; i < 6; i++) sleep(ps[i]);
  check("all six = a full skip, not 60%", world.getTimeOfDay(), 23999);
  check("clock advanced from the mark to dawn", state.absoluteTime - m.time, 23999 - (m.time % 24000));
}

console.log("\n7. A share that overshoots dawn clamps forward, never rewinds");
{
  const ps = ["X", "Y", "Z"].map((n) => makePlayer(n));
  reset(ps, 23000);
  const before = world.getTimeOfDay();
  const day0 = world.getDay();
  sleep(ps[0]);
  check("clamped at 23999", world.getTimeOfDay(), 23999);
  check("moved forward, not back", world.getTimeOfDay() > before, true);
  check("did not skip a day in the process", world.getDay(), day0);
  check("remainder discarded", ledger.get().pendingTicks, 0);
}

console.log("\n8. Empty roster at nightfall defers, then snapshots on return");
{
  const wanderer = makePlayer("Wanderer", "minecraft:nether");
  reset([wanderer]);
  run(30);
  check("nothing committed while everyone is away", ledger.get().roster.length, 0);
  check("night left untagged", ledger.get().night, -1);
  wanderer.dimension = { id: "minecraft:overworld" };
  run(30);
  check("roster taken on return", ledger.get().roster.length, 1);
  sleep(wanderer);
  check("sole player owns the whole night", world.getTimeOfDay(), 23999);
}

console.log("\n9. Latecomers get no share this night");
{
  const ps = [makePlayer("Host1"), makePlayer("Host2")];
  reset(ps);
  check("roster taken before the latecomer", ledger.get().roster.length, 2);
  const late = makePlayer("Late");
  state.players.push(late);
  const m = mark();
  sleep(late);
  check("burned nothing", burnedSince(m), 0);
  check("told their share starts tomorrow", state.actionBars.some((s) => s.includes("starts tomorrow")), true);
  check("roster still two", ledger.get().roster.length, 2);
}

console.log("\n10. State survives a reload mid-night");
{
  const ps = [makePlayer("R1"), makePlayer("R2")];
  reset(ps);
  sleep(ps[0]);
  const parsed = JSON.parse(state.props.get(cfg.STATE_KEY));
  check("roster persisted", parsed.roster.length, 2);
  check("spend persisted", parsed.spent.length, 1);
  check("night tagged with the day", parsed.night, 5);
  ledger.init();  // simulate a script reload reading the blob back
  check("roster restored", ledger.get().roster.length, 2);
  check("spend restored", ledger.get().spent[0], "id-R1");
  sleep(ps[0]);
  check("restored spend blocks a second donation", ledger.get().spent.length, 1);
  check("still only one announcement", state.messages.length, 1);
}

console.log("\n11. Dawn tears the night down");
{
  const ps = [makePlayer("D1"), makePlayer("D2")];
  reset(ps);
  sleep(ps[0]);
  state.absoluteTime = 6 * 24000 + 1000; // morning of the next day
  run(20);
  check("state cleared at dawn", ledger.get().night, -1);
  check("roster emptied", ledger.get().roster.length, 0);
}

console.log("");
console.log("11b. A skip takes the same wall-clock time whatever its size");
{
  // A fixed burn RATE made the wait scale with the skip, so a solo player - who
  // owns the whole night - waited 29s while one of ten waited 2.9s. Pacing by
  // duration is what keeps these two numbers together.
  /** Ticks spent actually burning, measured from the moment the share banks. */
  const drainTicks = (p) => {
    // Burner pacing only. The dawn handoff is off here on purpose: it stops the
    // burn just short of sunrise and lets Minecraft finish, so with it on a solo
    // player never completes a full sweep and there is no sweep left to time.
    // Set inside the helper because reset() clears packSettings each time.
    state.packSettings["nightshare:dawn_handoff"] = false;
    settings.init();

    p.isSleeping = true;
    for (let i = 0; i < 200 && ledger.get().pendingTicks === 0; i++) run(1);
    const start = ticksRun;
    for (let i = 0; i < 2000 && ledger.get().pendingTicks > 0; i++) run(1);
    p.isSleeping = false;
    return ticksRun - start;
  };

  const solo = makePlayer("Pace1");
  reset([solo]);
  const soloTicks = drainTicks(solo);
  check("solo full skip lands near the target duration", soloTicks, cfg.BURN_DURATION_TICKS, 12);

  const ten = Array.from({ length: 10 }, (_, i) => makePlayer(`Pace${i}`));
  reset(ten);
  const tenthTicks = drainTicks(ten[0]);
  check("a one-tenth share takes the same", tenthTicks, cfg.BURN_DURATION_TICKS, 12);
  check("solo is not an order of magnitude slower", Math.abs(soloTicks - tenthTicks) < 20, true);

  // Two people turning in together should share one sweep, not queue up.
  const pair = ["Pair1", "Pair2"].map((n) => makePlayer(n));
  reset(pair);
  state.packSettings["nightshare:dawn_handoff"] = false;   // pacing only, as above
  settings.init();
  pair[0].isSleeping = true;
  pair[1].isSleeping = true;
  for (let i = 0; i < 200 && ledger.get().spent.length < 2; i++) run(1);
  const start = ticksRun;
  for (let i = 0; i < 2000 && ledger.get().pendingTicks > 0; i++) run(1);
  check("two at once still finish in one sweep", ticksRun - start, cfg.BURN_DURATION_TICKS, 12);
  check("and that sweep reached dawn", world.getTimeOfDay(), 23999, 1);
}

console.log("");
console.log("12. With the daylight cycle frozen, a full skip still reaches dawn");
{
  const solo = makePlayer("Frozen");
  reset([solo]);
  state.gameRules.doDayLightCycle = false;
  sleep(solo);
  check("landed on dawn rather than stranding at 23999", world.getTimeOfDay(), 0);
  check("queue drained", ledger.get().pendingTicks, 0);
  state.gameRules.doDayLightCycle = true;
}

console.log("");
console.log("13. The BDS instructions in README.md still match the manifest");
{
  // world_behavior_packs.json is copy-pasted straight out of the README, so a
  // version bump or a regenerated UUID silently breaks every BDS install unless
  // this catches it. format_version 3 moved the manifest to SemVer strings, so
  // both [1, 1, 0] and "1.1.0" have to normalise to the same thing.
  const manifest = JSON.parse(readFileSync(new URL("../behavior_pack/manifest.json", import.meta.url), "utf8"));
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

  const norm = (v) => (Array.isArray(v) ? v.join(".") : String(v));

  // Scan rather than match line by line: the Linux snippet puts pack_id and
  // version on one line, which a per-line slice mis-parses.
  const valuesAfter = (text, key) => {
    const needle = String.fromCharCode(34) + key + String.fromCharCode(34) + ":";
    const out = [];
    let i = text.indexOf(needle);
    while (i !== -1) {
      let j = i + needle.length;
      while (text[j] === " ") j++;
      let end = j;
      if (text[end] === "[") { while (end < text.length && text[end] !== "]") end++; end++; }
      else if (text[end] === String.fromCharCode(34)) { end++; while (end < text.length && text[end] !== String.fromCharCode(34)) end++; end++; }
      out.push(JSON.parse(text.slice(j, end)));
      i = text.indexOf(needle, end);
    }
    return out;
  };

  const ids = valuesAfter(readme, "pack_id");
  const versions = valuesAfter(readme, "version").map(norm);

  check("README quotes a pack_id", ids.length > 0, true);
  check("every pack_id is the manifest header UUID", ids.every((id) => id === manifest.header.uuid), true);
  check("no module UUID mistaken for a pack_id", ids.includes(manifest.modules[0].uuid), false);
  check("README quotes a version", versions.length > 0, true);
  check(
    "every quoted version matches the header",
    versions.every((v) => v === norm(manifest.header.version)),
    true
  );
}

console.log("");
console.log("14. Settings resolve command > manifest/screen > config.js");
{
  reset([makePlayer("S1")]);
  check("nothing set at all lands on config.js", settings.resolve("guard").source, "config.js");
  check("with the config value", settings.vanillaGuard(), cfg.VANILLA_GUARD);
  check("skip too", settings.burnDurationTicks(), cfg.BURN_DURATION_TICKS);
  check("announce too", settings.announce(), cfg.ANNOUNCE);

  // What a server sees: an untouched screen still reports manifest defaults.
  state.packSettings = {
    "nightshare:vanilla_guard": "auto",
    "nightshare:skip_seconds": 3,
    "nightshare:announce": false,
  };
  settings.init();
  check("manifest beats config.js", settings.resolve("guard").source, "manifest");
  check("dropdown drives the guard", settings.vanillaGuard(), "auto");
  check("slider seconds become ticks", settings.burnDurationTicks(), 60);
  check("toggle drives the announcement", settings.announce(), false);

  // An admin override outranks both.
  check("set reports success", settings.set("guard", "always").ok, true);
  check("command beats manifest", settings.resolve("guard").source, "command");
  check("and takes effect", settings.vanillaGuard(), "always");
  check("untouched keys keep their manifest value", settings.burnDurationTicks(), 60);

  settings.set("skip", "2");
  check("skip override parses from text", settings.burnDurationTicks(), 40);
  settings.set("announce", "true");
  check("announce override parses from text", settings.announce(), true);

  settings.clear();
  check("reset hands control back to the manifest", settings.resolve("guard").source, "manifest");
  check("with the manifest value", settings.vanillaGuard(), "auto");
}

console.log("");
console.log("14b. Overrides persist, and bad input is refused");
{
  reset([makePlayer("S2")]);
  settings.set("guard", "always");
  settings.set("skip", "7");
  settings.init();                     // stand-in for a server restart
  check("override survives a reload", settings.vanillaGuard(), "always");
  check("and the numeric one too", settings.burnDurationTicks(), 140);

  const bad = settings.set("guard", "banana");
  check("a bogus guard value is refused", bad.ok, false);
  check("with a message naming the options", bad.message.includes("off | auto | always"), true);
  check("and the old value stands", settings.vanillaGuard(), "always");

  check("an out-of-range skip is refused", settings.set("skip", "900").ok, false);
  check("so is a non-number", settings.set("skip", "soon").ok, false);
  check("an unknown key is refused", settings.set("nonsense", "1").ok, false);
  check("skip is untouched", settings.burnDurationTicks(), 140);

  // A value that stops being valid must not survive a reload.
  state.props.set(cfg.OVERRIDE_KEY, JSON.stringify({ guard: "banana", skip: 3 }));
  settings.init();
  check("a stale invalid override is dropped on load", settings.resolve("guard").source, "config.js");
  check("while the valid one beside it survives", settings.burnDurationTicks(), 60);
}

console.log("");
console.log("15. The screen actually changes behaviour end to end");
{
  const ps = ["E1", "E2"].map((n) => makePlayer(n));
  reset(ps);
  state.packSettings = { "nightshare:skip_seconds": 2, "nightshare:announce": false };
  settings.init();
  ps[0].isSleeping = true;
  for (let i = 0; i < 200 && ledger.get().pendingTicks === 0; i++) run(1);
  const startTicks = ticksRun;
  for (let i = 0; i < 2000 && ledger.get().pendingTicks > 0; i++) run(1);
  ps[0].isSleeping = false;
  check("a 2s slider gives a ~40 tick burn", ticksRun - startTicks, 40, 8);
  check("announcements suppressed by the toggle", state.messages.length, 0);
}

console.log("");
console.log("16. The nightshare:config command, as an admin would type it");
{
  const cfgCmd = (msg) => {
    state.messages.length = 0;
    state.onScriptEvent({ id: "nightshare:config", message: msg });
    return state.messages.join(" ");
  };

  reset([makePlayer("A1")]);

  const listing = cfgCmd("");
  check("bare command lists every key", ["guard", "skip", "announce", "handoff"].every((k) => listing.includes(k)), true);
  check("and shows where each came from", listing.includes("config.js"), true);
  check("and hints at valid values", listing.includes("off | auto | always"), true);

  const ok = cfgCmd("guard auto");
  check("setting one confirms", ok.includes("guard = auto"), true);
  check("and it takes effect immediately", settings.vanillaGuard(), "auto");
  check("and is persisted", typeof state.props.get(cfg.OVERRIDE_KEY), "string");

  check("extra whitespace is tolerated", cfgCmd("  skip   3  ").includes("skip = 3s"), true);
  check("giving the resulting ticks", settings.burnDurationTicks(), 60);

  const bad = cfgCmd("guard sideways");
  check("a bad value is reported, not swallowed", bad.includes("not valid"), true);
  check("leaving the old value", settings.vanillaGuard(), "auto");

  check("a key with no value asks for one", cfgCmd("guard").includes("Need a value"), true);

  cfgCmd("reset");
  check("reset drops the overrides", settings.resolve("guard").source, "config.js");
  check("clearing the stored property", state.props.get(cfg.OVERRIDE_KEY), undefined);
}

console.log("");
console.log("17. The dawn handoff: staying in bed gets you a real sleep");
{
  // The point of the handoff. Nightshare moves the clock with setTimeOfDay,
  // which never clears Minecraft's per-player "time since rest" - the value
  // phantoms watch - and no script can clear it either. So instead of imitating
  // a sleep, stop short of sunrise and let Minecraft perform its own skip.
  // Whoever is in bed for it is woken by the game and their counter clears.
  const abed = makePlayer("Abed"), up = makePlayer("Up");

  reset([abed, up], cfg.NIGHT_END - 500);
  state.vanillaSkipEnabled = true;
  const day0 = world.getDay();

  abed.isSleeping = true;
  run(400);

  check("Minecraft performed the skip, not us", state.vanillaSkips, 1);
  check("so the sleeper got a REAL sleep", state.rested.includes("Abed"), true);
  check("per player: the one who stayed up did not", state.rested.includes("Up"), false);
  check("morning arrived", world.getTimeOfDay() < cfg.NIGHT_START, true);
  check("on the next day", world.getDay(), day0 + 1);
  check("and the gamerule was handed back", sleepPct(), 100);
  check("with nothing still owed", state.props.get(cfg.ORIGINAL_PCT_KEY), undefined);
}

console.log("");
console.log("18. The handoff never leaves the night stuck");
{
  // Armed, then the sleeper gets out of bed, so Minecraft never answers. The
  // gamerule has to come back and the burner has to finish the job - a night
  // parked one step short of sunrise would be far worse than a missed reset.
  const abed = makePlayer("Abed"), other = makePlayer("Other");

  reset([abed, other], cfg.NIGHT_END - 500);
  state.vanillaSkipEnabled = false;            // the invitation goes unanswered

  abed.isSleeping = true;
  run(40);
  check("invitation issued", sleepPct(), cfg.INVITE_PERCENTAGE);

  abed.isSleeping = false;
  run(cfg.HANDOFF_TIMEOUT_TICKS + 40);
  check("taken back after the timeout", sleepPct(), 100);
  check("nothing still owed", state.props.get(cfg.ORIGINAL_PCT_KEY), undefined);
  check("nobody got a free reset", state.rested.length, 0);

  run(400);
  check("and the night ended anyway", world.getTimeOfDay() < cfg.NIGHT_START, true);
}

console.log("");
console.log("19. The handoff respects the world, and the setting");
{
  const abed = makePlayer("Abed"), other = makePlayer("Other");

  // A world its owner deliberately made unskippable is not ours to override,
  // in either direction - the same rule the vanilla guard already follows.
  reset([abed, other], cfg.NIGHT_END - 500);
  state.vanillaSkipEnabled = true;
  state.gameRules.playersSleepingPercentage = 101;
  abed.isSleeping = true;
  run(400);
  check("an unskippable world is left unskippable", sleepPct(), 101);
  check("and no skip is provoked", state.vanillaSkips, 0);
  abed.isSleeping = false;

  // Turned off, the gamerule is never touched at all.
  reset([abed, other], cfg.NIGHT_END - 500);
  state.vanillaSkipEnabled = true;
  state.packSettings["nightshare:dawn_handoff"] = false;
  settings.init();
  abed.isSleeping = true;
  run(400);
  check("with the setting off the gamerule is untouched", sleepPct(), 100);
  check("and Minecraft is never invited", state.vanillaSkips, 0);
  check("the burner still finishes the night", world.getTimeOfDay() < cfg.NIGHT_START, true);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
