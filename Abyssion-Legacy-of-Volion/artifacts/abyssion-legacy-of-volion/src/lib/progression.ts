/**
 * Per-item progression (M1W2D4 — P6) and player stat foundation (P8).
 *
 * One authoritative source: each item (weapon/Core) owns its own EXP/level/
 * unlocked skills; the player owns one stat block. Both are persisted through
 * the existing save architecture by the store (never via a second save path).
 *
 * No global EXP pool: Sword A ≠ Sword B, Core A ≠ Core B.
 */

import { weaponCategoryOf, type WeaponCategory } from './items';

export type { WeaponCategory };

/** EXP required to go from level N to N+1. Simple thresholds, not over-engineered. */
export function expForLevel(level: number): number {
  return 100 + (level - 1) * 50;
}

export const MAX_ITEM_LEVEL = 10;

/** Skills unlock by item level (1-based index into the item's skill list). */
export const SKILL_UNLOCK_LEVELS: readonly number[] = [1, 1, 3, 3, 5];

export interface ItemProgression {
  exp: number;
  level: number;
}

export function createItemProgression(): ItemProgression {
  return { exp: 0, level: 1 };
}

export function grantItemExp(
  prog: ItemProgression,
  amount: number,
  skillCount: number,
): { prog: ItemProgression; leveledTo: number } {
  let { exp, level } = prog;
  let leveledTo = level;
  exp += amount;
  while (level < MAX_ITEM_LEVEL && exp >= expForLevel(level)) {
    exp -= expForLevel(level);
    level += 1;
    leveledTo = level;
  }
  if (level >= MAX_ITEM_LEVEL) exp = Math.min(exp, expForLevel(MAX_ITEM_LEVEL));
  return { prog: { exp, level }, leveledTo };
}

/** Is the skill at 0-based `index` unlocked for an item at `level`? */
export function isSkillUnlocked(level: number, index: number): boolean {
  const req = SKILL_UNLOCK_LEVELS[Math.min(index, SKILL_UNLOCK_LEVELS.length - 1)] ?? 1;
  return level >= req;
}

// ── Player stats (P8) ──────────────────────────────────────────────────────
// One authoritative block. Combat/UI read it; nothing else writes it.

export interface PlayerStats {
  hp: number; // → max health
  agility: number;
  speed: number; // → movement speed
  attack: number; // → outgoing damage scaling
  attackSpeed: number; // → attack interval scaling
  cooldown: number; // → skill cooldown scaling
  fightingStyle: number;
  sword: number;
  staff: number;
  bow: number;
  gun: number;
  abyssal: number;
  ancestral: number;
}

export function createPlayerStats(): PlayerStats {
  return {
    hp: 1, agility: 1, speed: 1, attack: 1, attackSpeed: 1, cooldown: 1,
    fightingStyle: 1, sword: 1, staff: 1, bow: 1, gun: 1, abyssal: 1, ancestral: 1,
  };
}

/** Derived multipliers (clamped so one stat point can never zero out gameplay). */
export function statMultipliers(stats: PlayerStats) {
  return {
    maxHealth: 1 + (stats.hp - 1) * 0.1,
    moveSpeed: 1 + (stats.speed - 1) * 0.05,
    damage: 1 + (stats.attack - 1) * 0.08,
    attackInterval: 1 / (1 + (stats.attackSpeed - 1) * 0.05),
    skillCooldown: 1 / (1 + (stats.cooldown - 1) * 0.04),
  };
}

/** Weapon category → its proficiency stat key. */
export function categoryStatKey(cat: WeaponCategory): keyof PlayerStats | null {
  switch (cat) {
    case 'sword': return 'sword';
    case 'gun': return 'gun';
    case 'core': return 'abyssal';
    case 'dagger': return 'fightingStyle';
    case 'staff': return 'staff';
    default: return null;
  }
}

// ── M2D1 #1 — Mastery ──────────────────────────────────────────────────────
// Player-side mastery is a pure function of the EXP held in
// player.mastery[itemId]. Level is always DERIVED, never stored. This is a
// separate curve from the older 1-based item-progression system above
// (MAX_ITEM_LEVEL / SKILL_UNLOCK_LEVELS / ItemProgression) — that system is
// untouched and unrelated.

/** Skill-slot letters. The Core owns all five; every other weapon the first
 *  two (the staff keeps a third). Mirrors the skill bar's own labelling. */
export type SkillSlot = 'Z' | 'F' | 'X' | 'C' | 'V';

/** Cumulative mastery points required to BE at `level`.
 *
 *    cost(1) = 10                       (the tutorial segment)
 *    cost(N) = 10 * 2^(N-1)   for N in 2..50
 *    cost(N) = cost(N-1) * 1.5 for N in 51..999
 *
 *  CAPPED: the cumulative sum passes Number.MAX_SAFE_INTEGER partway through
 *  level 50 (level 50 alone already needs ~1.126e16), so every level at or
 *  after the crossing point returns Number.MAX_SAFE_INTEGER. No BigInt, and
 *  this never throws. */
export function masteryThreshold(level: number): number {
  const target = Math.floor(level);
  if (!Number.isFinite(target) || target <= 0) return 0;
  const capped = Math.min(target, 999);
  let cost = 10; // cost(1)
  let total = 0;
  for (let n = 1; n <= capped; n += 1) {
    if (n > 1) cost = n <= 50 ? cost * 2 : cost * 1.5;
    total += cost;
    // Safe-integer cap: stop accumulating rather than silently lose precision.
    if (total >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  }
  return total;
}

/** Highest level L in [0, 999] with masteryThreshold(L) <= exp. */
export function masteryLevelFor(exp: number): number {
  if (!Number.isFinite(exp) || exp <= 0) return 0;
  let lo = 0;
  let hi = 999;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (masteryThreshold(mid) <= exp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Kill-count mastery scaling: +0.1% per kill, so the multiplier is 1.0 at
 *  0 kills and 2.0 at 1000 kills, then flat above the cap. */
export function killGainMultiplier(totalKills: number): number {
  return 1 + Math.min(totalKills, 1000) * 0.001;
}

/** Mastery points awarded for one mastery event. */
export function masteryPointsForEvent(
  kind: 'skill' | 'm1' | 'kill',
  totalKills: number,
): number {
  switch (kind) {
    case 'skill': return 3;
    case 'm1': return 0.5;
    case 'kill': return 5 * killGainMultiplier(totalKills);
  }
}

/** Additive per-mastery-level bonus: level 0 → 1.0, level 10 → 2.0. */
export function statBonusMultiplier(masteryLevel: number): number {
  return 1 + masteryLevel * 0.1;
}

/** Which skill slots a weapon category owns. */
export const WEAPON_SKILL_SLOTS: Record<WeaponCategory, readonly SkillSlot[]> = {
  core: ['Z', 'F', 'X', 'C', 'V'],
  sword: ['Z', 'X'],
  dagger: ['Z', 'X'],
  gun: ['Z', 'X'],
  staff: ['Z', 'X', 'C'],
};

/** Per-weapon mastery level required for a slot. Deliberately EMPTY: an absent
 *  entry means "unlocked at any mastery level". Nothing here invents
 *  thresholds — the operator fills this table. */
export const WEAPON_SKILL_UNLOCK_LEVELS: Record<string, Partial<Record<SkillSlot, number>>> = {};

/** Skill slots owned by a weapon id ([] when the id is not a weapon/Core). */
export function skillSlotsForWeapon(itemId: string): readonly SkillSlot[] {
  const cat = weaponCategoryOf(itemId);
  if (!cat) return [];
  return WEAPON_SKILL_SLOTS[cat] ?? [];
}

/** Is `slot` unlocked for `itemId` at `masteryLevel`? Fails closed for a slot
 *  the weapon does not own; otherwise unlocked unless a per-weapon threshold
 *  exists in WEAPON_SKILL_UNLOCK_LEVELS (empty at HEAD). */
export function isSkillUnlockedForWeapon(
  itemId: string,
  slot: SkillSlot,
  masteryLevel: number,
): boolean {
  if (!skillSlotsForWeapon(itemId).includes(slot)) return false;
  const required = WEAPON_SKILL_UNLOCK_LEVELS[itemId]?.[slot];
  if (required === undefined) return true;
  return masteryLevel >= required;
}
