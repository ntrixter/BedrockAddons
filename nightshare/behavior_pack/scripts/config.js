/**
 * Nightshare - default values.
 *
 * Three of these are also exposed on the in-game settings screen (the gear beside
 * Nightshare in the world Behavior Packs list): the vanilla guard, the skip
 * length and the chat announcement. What the screen says wins; these are the
 * fallbacks for when it has not been touched or the engine cannot supply it.
 * Everything else here is edit-the-file only.
 *
 * Nightshare - tunable constants.
 *
 * Everything here is safe to edit. NIGHT_START is the one most likely to need
 * tuning: the wiki documents Java's sleep window (12523 clear / 12002 rain) and
 * does not break Bedrock out separately, so confirm in-game when a bed actually
 * accepts sleep and adjust to match.
 */

/** First tick of the night budget - roughly when beds become usable. */
export const NIGHT_START = 12542;

/**
 * Last tick of the night budget. Deliberately dawn (24000) rather than the end
 * of the sleep window, so that spending 100% of shares lands exactly on sunrise
 * and a full turnout is indistinguishable from a vanilla full skip.
 */
export const NIGHT_END = 24000;

/** Total skippable span: 11458 ticks, about 9m33s of real time. */
export const SPAN = NIGHT_END - NIGHT_START;

/**
 * How long a skip takes in real ticks, whatever its size. 90 ticks is 4.5
 * seconds, near vanilla's own ~5 second sleep.
 *
 * This is a duration, not a speed, and that distinction matters. A fixed speed
 * makes the wait scale with the skip, so a solo player - who owns the whole
 * night - waits longest of anyone: 29 seconds at the old rate of 20, against
 * 2.9 for one of ten players. Pacing by duration means every skip feels the
 * same regardless of how many people are on.
 *
 * Raise it for a slower, more cinematic sweep; lower it for a snappier one.
 */
export const BURN_DURATION_TICKS = 100;

/** Floor on the per-tick step, so a tiny share still finishes promptly. */
export const MIN_BURN_RATE = 4;

/**
 * How long a player must stay in bed before their share is banked, so tapping a
 * bed to set spawn doesn't spend it. 20 ticks = 1 second.
 */
export const SLEEP_CONFIRM_TICKS = 20;

/** Ticks between sleeper scans. The burner still runs every tick. */
export const SCAN_INTERVAL = 10;

/**
 * Dimensions whose players own a share. Players in the Nether and End can't
 * sleep at all, so counting them would permanently cap the night skip below
 * 100% - they neither contribute nor dilute.
 */
export const COUNT_DIMENSIONS = ["minecraft:overworld"];

/** Broadcast a chat line when someone spends their share. */
export const ANNOUNCE = true;

/**
 * Whether to stop vanilla firing its own night skip alongside ours.
 *
 * Nightshare exists to move the night along when *not everyone can sleep*. Once
 * everyone who is able to sleep has slept, vanilla ending the night is the right
 * answer rather than a bug, so by default we leave it alone and let it fire.
 *
 * Vanilla skips when every player currently in the Overworld is asleep - and
 * since players in the Nether or End cannot sleep at all, that condition means
 * exactly "everyone who could sleep did".
 *
 *   "off"    - default. Never touch the gamerule. If everyone present sleeps,
 *              vanilla ends the night, including where that is more than the
 *              shares actually paid for.
 *   "auto"   - hold vanilla off while a roster member is away from the
 *              Overworld, so the night runs exactly as long as the unspent
 *              shares say. Anyone sleeping during that window sees Bedrock's
 *              "Skip night by sleeping is turned off" message on the bed screen.
 *   "always" - hold vanilla off for the whole session. Everyone sees that
 *              message every time they sleep. This is what 1.0.0 did.
 */
export const VANILLA_GUARD = "off";

/** Any value above 100 means "the night cannot be skipped". */
export const GUARD_PERCENTAGE = 101;

/** Remembers the world's own setting so the guard can hand it back. */
export const ORIGINAL_PCT_KEY = "nightshare:originalSleepPct";

/** Marks the one-off cleanup of the always-on guard shipped in 1.0.0. */
export const MIGRATED_KEY = "nightshare:guardMigrated";

/** Dynamic property holding runtime overrides set with nightshare:config. */
export const OVERRIDE_KEY = "nightshare:overrides";

/** Dynamic property holding the whole night's state as one JSON blob. */
export const STATE_KEY = "nightshare:state";
