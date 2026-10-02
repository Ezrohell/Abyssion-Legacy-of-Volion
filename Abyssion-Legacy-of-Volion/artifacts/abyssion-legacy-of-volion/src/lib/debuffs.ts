/**
 * M2D1 #2 — debuff (curse) data model.
 *
 * Authoritative per-type, per-tier magnitude table. Nothing here is runtime
 * state: an applied curse is a DebuffInstance in the store
 * (player.debuffs[]) and its combined effect is DERIVED per frame through
 * aggregateMagnitudes — aggregate values are never stored.
 *
 * Durations are not part of this table. The caller of applyDebuff supplies
 * them, so a designer can lengthen a curse without touching the magnitudes.
 *
 * Wiring status (M2D1 #2): hpPerSec, staminaPerSec, moveSpeedMult,
 * damageOutMult are consumed by Player.tsx. attackSpeedMult, rateOfFireMult,
 * aimJitterDeg and randomMovePct are present and aggregated but deliberately
 * NOT wired — attack speed / rate of fire reduction, aim jitter and random
 * movement are out of scope for this session.
 */

export type DebuffType =
  | 'slowness' | 'weakness' | 'fatigue' | 'poison'
  | 'bleeding' | 'crazy' | 'intoxicated';

export type DebuffTier = 1 | 2 | 3 | 4 | 5;

export interface DebuffInstance {
  id: string;
  type: DebuffType;
  tier: DebuffTier;
  remainingSec: number;
  /** M2D1 #2 — where the curse came from. 'enemy' curses always apply;
   *  'item' curses are suppressed by the backpack (non-item, always worn). */
  source: 'enemy' | 'item';
}

export interface DebuffMagnitude {
  hpPerSec: number;
  staminaPerSec: number;
  moveSpeedMult: number;
  damageOutMult: number;
  attackSpeedMult: number;
  rateOfFireMult: number;
  aimJitterDeg: number;
  randomMovePct: number;
  dmgBoostMult: number;
}

/** Neutral row: no drain, no modifier. Every table entry spreads this first
 *  and then overrides only the fields its design actually specifies. */
const NEUTRAL: DebuffMagnitude = {
  hpPerSec: 0,
  staminaPerSec: 0,
  moveSpeedMult: 1.0,
  damageOutMult: 1.0,
  attackSpeedMult: 1.0,
  rateOfFireMult: 1.0,
  aimJitterDeg: 0,
  randomMovePct: 0,
  dmgBoostMult: 1.0,
};

export const DEBUFF_MAGNITUDES: Record<DebuffType, Record<DebuffTier, DebuffMagnitude>> = {
  slowness: {
    1: { ...NEUTRAL, moveSpeedMult: 0.95 },
    2: { ...NEUTRAL, moveSpeedMult: 0.90 },
    3: { ...NEUTRAL, moveSpeedMult: 0.75 },
    4: { ...NEUTRAL, moveSpeedMult: 0.75, attackSpeedMult: 0.95 },
    5: { ...NEUTRAL, moveSpeedMult: 0.75, attackSpeedMult: 0.90 },
  },
  weakness: {
    1: { ...NEUTRAL, damageOutMult: 0.975, attackSpeedMult: 0.975 },
    2: { ...NEUTRAL, damageOutMult: 0.95, attackSpeedMult: 0.95 },
    3: { ...NEUTRAL, damageOutMult: 0.925, attackSpeedMult: 0.925 },
    4: { ...NEUTRAL, damageOutMult: 0.90, attackSpeedMult: 0.90 },
    5: { ...NEUTRAL, damageOutMult: 0.90, attackSpeedMult: 0.90, moveSpeedMult: 0.975 },
  },
  fatigue: {
    1: { ...NEUTRAL, attackSpeedMult: 0.97, rateOfFireMult: 0.97 },
    2: { ...NEUTRAL, attackSpeedMult: 0.95, rateOfFireMult: 0.95 },
    3: { ...NEUTRAL, attackSpeedMult: 0.92, rateOfFireMult: 0.92 },
    4: { ...NEUTRAL, attackSpeedMult: 0.90, rateOfFireMult: 0.90, aimJitterDeg: 2.5 },
    5: { ...NEUTRAL, attackSpeedMult: 0.90, rateOfFireMult: 0.90, aimJitterDeg: 3, randomMovePct: 0.5 },
  },
  poison: {
    1: { ...NEUTRAL, hpPerSec: 2 },
    2: { ...NEUTRAL, hpPerSec: 5 },
    3: { ...NEUTRAL, hpPerSec: 8 },
    4: { ...NEUTRAL, hpPerSec: 10 },
    5: { ...NEUTRAL, hpPerSec: 10, staminaPerSec: 5 },
  },
  bleeding: {
    1: { ...NEUTRAL, hpPerSec: 1 },
    2: { ...NEUTRAL, hpPerSec: 3 },
    3: { ...NEUTRAL, hpPerSec: 5, staminaPerSec: 1 },
    4: { ...NEUTRAL, hpPerSec: 5, staminaPerSec: 3 },
    5: { ...NEUTRAL, hpPerSec: 5, staminaPerSec: 5 },
  },
  // crazy / intoxicated are tier-independent by design: the magnitude row is
  // identical across I–V and only the duration distinguishes them.
  crazy: {
    1: { ...NEUTRAL, dmgBoostMult: 1.50, aimJitterDeg: 5, randomMovePct: 0.5 },
    2: { ...NEUTRAL, dmgBoostMult: 1.50, aimJitterDeg: 5, randomMovePct: 0.5 },
    3: { ...NEUTRAL, dmgBoostMult: 1.50, aimJitterDeg: 5, randomMovePct: 0.5 },
    4: { ...NEUTRAL, dmgBoostMult: 1.50, aimJitterDeg: 5, randomMovePct: 0.5 },
    5: { ...NEUTRAL, dmgBoostMult: 1.50, aimJitterDeg: 5, randomMovePct: 0.5 },
  },
  intoxicated: {
    1: { ...NEUTRAL, dmgBoostMult: 1.25, randomMovePct: 0.5 },
    2: { ...NEUTRAL, dmgBoostMult: 1.25, randomMovePct: 0.5 },
    3: { ...NEUTRAL, dmgBoostMult: 1.25, randomMovePct: 0.5 },
    4: { ...NEUTRAL, dmgBoostMult: 1.25, randomMovePct: 0.5 },
    5: { ...NEUTRAL, dmgBoostMult: 1.25, randomMovePct: 0.5 },
  },
};

/** Cure items -> fraction of the remaining curse cleared per use. */
export const CURE_ITEMS: Record<string, number> = {
  antidote:      0.05,
  bandage:       0.05,
  first_aid_kit: 0.15,
};

/** Reward/rest tuning: a rest shortens a minor curse's remaining time by 2×,
 *  a high-level curse only by 1.25×. */
export const REST_MULTIPLIER_LOW = 2.0;
export const REST_MULTIPLIER_HIGH = 1.25;

/** High-level curses. `crazy` and `intoxicated` do not scale with tier (their
 *  magnitude row is identical across I–V) and grant a damage bonus, so they
 *  are the curses rest recovers from slowest. */
export function isHighLevelCurse(type: DebuffType): boolean {
  return type === 'crazy' || type === 'intoxicated';
}

/** Derive one combined magnitude row from every active instance.
 *  Drains and jitter add; multipliers compose multiplicatively. */
export function aggregateMagnitudes(
  instances: readonly DebuffInstance[]
): DebuffMagnitude {
  let acc: DebuffMagnitude = { ...NEUTRAL };
  for (const instance of instances) {
    const row = DEBUFF_MAGNITUDES[instance.type]?.[instance.tier];
    if (!row) continue;
    acc = {
      hpPerSec: acc.hpPerSec + row.hpPerSec,
      staminaPerSec: acc.staminaPerSec + row.staminaPerSec,
      moveSpeedMult: acc.moveSpeedMult * row.moveSpeedMult,
      damageOutMult: acc.damageOutMult * row.damageOutMult,
      attackSpeedMult: acc.attackSpeedMult * row.attackSpeedMult,
      rateOfFireMult: acc.rateOfFireMult * row.rateOfFireMult,
      aimJitterDeg: acc.aimJitterDeg + row.aimJitterDeg,
      randomMovePct: acc.randomMovePct + row.randomMovePct,
      dmgBoostMult: acc.dmgBoostMult * row.dmgBoostMult,
    };
  }
  return acc;
}

/** M2D1 #2 — which curse an enemy applies when its strike LANDS, and how
 *  often. Keyed by the runtime enemy-name string that reaches onEnemyKilled
 *  (the five story-world names plus the three arena overrides).
 *  'Training Dummy' is deliberately absent: it is a training target, not an
 *  attacking enemy, so it can never roll a curse. */
export const ENEMY_DEBUFF_ON_HIT: Record<string, {
  type: DebuffType;
  tier: DebuffTier;
  chance: number;
}> = {
  'Arcane Mage':    { type: 'poison',   tier: 5, chance: 0.10 },
  'Bouncy Slime':   { type: 'slowness', tier: 4, chance: 0.15 },
  'Dire Wolf':      { type: 'bleeding', tier: 2, chance: 0.30 },
  'Bandit Fighter': { type: 'weakness', tier: 1, chance: 0.30 },
  'Thornback':      { type: 'bleeding', tier: 3, chance: 0.05 },

  'Arena Slime':    { type: 'slowness', tier: 4, chance: 0.15 },
  'Arena Wolf':     { type: 'bleeding', tier: 2, chance: 0.30 },
  'Arena Bandit':   { type: 'weakness', tier: 1, chance: 0.30 },
};

/** Flat 3-second duration for every enemy-applied curse at this time. */
export const ENEMY_DEBUFF_DURATION_SEC = 3;

/** Roll whether an enemy strike applies its mapped curse. `rng` is injected so
 *  the outcome is testable; call sites pass Math.random. Returns null for an
 *  enemy with no mapping and on a miss. No clamp, no dedupe, no stacking
 *  limit — repeated landed hits create independent instances, exactly like
 *  any other applyDebuff caller. */
export function rollEnemyDebuff(
  enemyName: string,
  rng: () => number
): { type: DebuffType; tier: DebuffTier; durationSec: number } | null {
  const entry = ENEMY_DEBUFF_ON_HIT[enemyName];
  if (!entry) return null;
  if (rng() >= entry.chance) return null;
  return {
    type: entry.type,
    tier: entry.tier,
    durationSec: ENEMY_DEBUFF_DURATION_SEC,
  };
}

/** M2D2 #1 — operator constant. How the aggregated `aimJitterDeg` is turned
 *  into a fire-direction offset:
 *    'once_per_shot' — one fresh random offset per shot
 *    'per_frame'     — only the per-frame accumulated drift
 *    'both'          — fresh offset + accumulated drift */
export type AimJitterMode =
  | 'once_per_shot'
  | 'per_frame'
  | 'both';

export const AIM_JITTER_MODE: AimJitterMode = 'both';

/** M2D2 #1 — operator constant. When the aggregated `randomMovePct` roll
 *  succeeds, the player's standard movement direction is substituted with a
 *  fixed heading for `durationSec` seconds: `arcDeg` is either 'full_360' or a
 *  half-width in degrees centred on the current heading. */
export interface RandomMoveMode {
  trigger: 'per_frame' | 'per_second';
  durationSec: number;
  arcDeg: number | 'full_360';
}

export const RANDOM_MOVE_MODE: RandomMoveMode = {
  trigger: 'per_frame',
  durationSec: 0.2,
  arcDeg: 'full_360',
};
