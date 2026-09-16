import { world, system } from "@minecraft/server";
import * as cfg from "./config.js";
import * as ledger from "./ledger.js";
import { burn } from "./burner.js";
import * as ui from "./ui.js";
import * as guard from "./guard.js";
import * as handoff from "./handoff.js";
import * as settings from "./settings.js";

/**
 * How long each player has been continuously in bed, and whether we've already
 * told them the outcome.
 *
 * Deliberately in-memory rather than persisted: a doze interrupted by a
 * disconnect should start over, not resume where it left off.
 *
 * @type {Map<string, {ticks: number, notified: boolean}>}
 */
const dozing = new Map();

let bootstrapped = false;
let tickCount = 0;

function scanSleepers() {
  const state = ledger.get();
  const inNight = ledger.isNight();

  for (const player of ledger.eligiblePlayers()) {
    if (!player.isSleeping) {
      dozing.delete(player.id);
      continue;
    }

    let doze = dozing.get(player.id);
    if (!doze) {
      doze = { ticks: 0, notified: false };
      dozing.set(player.id, doze);
    }
    doze.ticks += cfg.SCAN_INTERVAL;

    // Wait out the confirm delay so tapping a bed to set spawn doesn't spend a
    // share, then act exactly once per stint in bed.
    if (doze.ticks < cfg.SLEEP_CONFIRM_TICKS || doze.notified) continue;
    doze.notified = true;

    if (!inNight) {
      // Daytime thunderstorm sleep. There is no night budget to draw against.
      ui.actionBar(player, ui.STORM_SLEEP);
    } else if (!state.roster.includes(player.id)) {
      ui.actionBar(player, ui.LATE_JOIN);
    } else if (state.spent.includes(player.id)) {
      ui.actionBar(player, ui.ALREADY_SPENT);
    } else {
      const result = ledger.spendShare(player.id);
      ui.actionBar(player, ui.SHARE_SPENT);
      ui.announceSpend(player, result);
    }
  }
}

system.runInterval(() => {
  // Deferred to the first tick: gameRules and dynamic properties are both off
  // limits during early execution, when the module first evaluates.
  if (!bootstrapped) {
    settings.init();
    ledger.init();
    guard.migrate();
    bootstrapped = true;
  }

  tickCount++;

  // Checked every tick, not every scan: a large share can carry the clock over
  // the handoff threshold in a single step, and a scan running every tenth tick
  // would step straight past it.
  handoff.sync(tickCount);

  // Every tick - it is arithmetic plus a single setter, and a coarser interval
  // would make the fast-forward visibly steppy. Paused while the handoff is
  // armed, so we are not racing Minecraft to the same sunrise.
  if (!handoff.armed() && burn(ledger.get())) ledger.markDirty();

  if (tickCount % cfg.SCAN_INTERVAL !== 0) return;

  ledger.syncNight();
  scanSleepers();
  // guard owns the gamerule that the handoff is currently holding, so leave it
  // alone until the handoff stands down - otherwise its release() would undo
  // the invitation on the very next scan.
  if (!handoff.armed()) guard.sync(ledger.isNight() && ledger.rosterMemberAway());
  ledger.flush();
}, 1);

world.afterEvents.playerLeave.subscribe((ev) => {
  dozing.delete(ev.playerId);
});

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === "nightshare:reset") {
    ledger.reset();
    handoff.clear();
    dozing.clear();
    ui.broadcast("\u00a7cState cleared.\u00a7r A fresh roster is taken at the next nightfall.");
    return;
  }

  // nightshare:config           - show every setting and where its value came from
  // nightshare:config <k> <v>   - override one, live, and remember it across restarts
  // nightshare:config reset     - drop overrides, back to the manifest and config.js
  if (ev.id === "nightshare:config") {
    const args = (ev.message ?? "").trim().split(" ").filter(Boolean);

    if (args.length === 0) {
      const rows = settings
        .report()
        .map((r) => `  \u00a7e${r.key}\u00a7r = \u00a76${r.shown}\u00a7r \u00a78(${r.source})  ${r.hint}\u00a7r`)
        .join(String.fromCharCode(10));
      ui.broadcast(`\u00a77Settings\u00a7r\n${rows}\n\u00a78scriptevent nightshare:config <key> <value>\u00a7r`);
      return;
    }

    if (args[0] === "reset") {
      settings.clear();
      ui.broadcast("\u00a77Overrides cleared.\u00a7r Back to the manifest defaults and config.js.");
      return;
    }

    if (args.length < 2) {
      ui.broadcast(`\u00a7cNeed a value.\u00a7r Try \u00a77scriptevent nightshare:config ${args[0]} <value>\u00a7r`);
      return;
    }

    const result = settings.set(args[0], args.slice(1).join(" "));
    ui.broadcast(result.ok ? `\u00a7aSet\u00a7r ${result.message}` : `\u00a7c${result.message}`);
    return;
  }

  if (ev.id !== "nightshare:debug") return;

  const state = ledger.get();
  const names = new Map(world.getAllPlayers().map((p) => [p.id, p.name]));
  const label = (id) => `${names.get(id) ?? "\u00a78(offline)\u00a7r"}${state.spent.includes(id) ? " \u00a7a*\u00a7r" : ""}`;
  const eff = settings.report().map((r) => `${r.key}=${r.shown}(${r.source})`).join(" ");

  ui.broadcast(
    `\u00a77${eff}\u00a7r\n` +
      `\u00a77time=\u00a7r${world.getTimeOfDay()} \u00a77day=\u00a7r${world.getDay()} ` +
      `\u00a77night=\u00a7r${ledger.isNight()} \u00a77sleepPct=\u00a7r${world.gameRules.playersSleepingPercentage} ` +
      `\u00a77handoff=\u00a7r${handoff.armed() ? "armed" : "idle"}\n` +
      `\u00a77share=\u00a7r${Math.round(ledger.shareTicks())} ticks  ` +
      `\u00a77pending=\u00a7r${Math.round(state.pendingTicks)} ticks\n` +
      `\u00a77roster(${state.roster.length}):\u00a7r ${state.roster.map(label).join(", ") || "\u00a78none\u00a7r"}`
  );
});