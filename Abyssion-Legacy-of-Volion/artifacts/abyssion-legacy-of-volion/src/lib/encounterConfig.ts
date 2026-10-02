/**
 * Centralized tuning for the encounter arena vertical slice.
 * All layout, enemy, and reward values live here.
 */
export const ENCOUNTER_CONFIG = {
  // Arena center (offset from world origin)
  centerX: 35,
  centerZ: -35,

  // Arena floor dimensions
  floorWidth: 24,
  floorDepth: 24,
  floorColor: '#6b7280',
  wallColor: '#374151',
  wallHeight: 3,

  // Pillar dressing
  pillarColor: '#4b5563',
  pillarHeight: 4,
  pillarRadius: 0.5,

  // Encounter enemies — names must be unique so onEnemyKilled can track them
  enemies: [
    { name: 'Arena Slime', position: [-3, 0, -6] as [number, number, number] },
    { name: 'Arena Wolf',   position: [3, 0, -6] as [number, number, number] },
    { name: 'Arena Bandit', position: [0, 0, -9] as [number, number, number] },
  ],

  // Completion portal
  portalZ: 10,
  portalRadius: 1.5,
  portalProximityDist: 2.5,

  // Reward on completion
  rewardExp: 200,
  rewardGold: 150,

  // Entrance marker — positioned at the walkable entrance path
  entranceMarkerZ: 13,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// M2D4 #1 — PHASE 2: DUNGEON ENEMIES
// Four new enemy configs (single source of truth; the enemy components import
// these). Sunburn / Frosted Magma effect values are placeholders — see the
// components for the UNSPECIFIED notes.
// ═══════════════════════════════════════════════════════════════════════════

import type { EnemyConfig } from '../components/game/enemies/types';

/** An enemy config plus the dungeon-only fields the mage components need. */
export interface DungeonEnemyConfig extends EnemyConfig {
  /** Mesh colour for the dungeon enemy. */
  color: string;
  /** Projectile speed (m/s). 0 for melee-only enemies. */
  projectileSpeed: number;
  /** Projectile lifetime (seconds). 0 for melee-only. */
  projectileLifetime: number;
}

export const DUNGEON_ENEMY_CONFIGS: Record<
  'crystal' | 'fire' | 'frost' | 'fangery',
  DungeonEnemyConfig
> = {
  crystal: {
    name: 'Crystal Mage',
    maxHp: 40,
    damage: 12,
    attackRange: 8,
    knockback: 2,
    moveSpeed: 2.6,
    patrolSpeed: 1.2,
    detectionRange: 12,
    leashRange: 22,
    attackCooldown: 2.5, // castInterval — the slowest caster
    attackWindup: 1.1,
    attackRecovery: 0.7,
    projectileSpeed: 20,
    projectileLifetime: 3,
    color: '#7dd3fc',
    faction: 'mage',
    expReward: 40,
    lootName: 'Gold Coins',
    lootAmount: 30,
    lootColor: '#7dd3fc',
  },
  fire: {
    name: 'Fire Mage',
    maxHp: 45,
    damage: 14,
    attackRange: 7,
    knockback: 3,
    moveSpeed: 2.7,
    patrolSpeed: 1.2,
    detectionRange: 12,
    leashRange: 22,
    attackCooldown: 3,
    attackWindup: 1.0,
    attackRecovery: 0.7,
    projectileSpeed: 14,
    projectileLifetime: 3,
    color: '#f97316',
    faction: 'mage',
    expReward: 45,
    lootName: 'Gold Coins',
    lootAmount: 32,
    lootColor: '#f97316',
  },
  frost: {
    name: 'Frost Mage',
    maxHp: 60,
    damage: 8,
    attackRange: 6,
    knockback: 1,
    moveSpeed: 2.4,
    patrolSpeed: 1.1,
    detectionRange: 12,
    leashRange: 22,
    attackCooldown: 4,
    attackWindup: 1.1,
    attackRecovery: 0.7,
    projectileSpeed: 10,
    projectileLifetime: 3,
    color: '#38bdf8',
    faction: 'mage',
    expReward: 60,
    lootName: 'Gold Coins',
    lootAmount: 40,
    lootColor: '#38bdf8',
  },
  fangery: {
    name: 'Fangery',
    maxHp: 30,
    damage: 10,
    attackRange: 2,
    knockback: 2,
    moveSpeed: 3.6,
    patrolSpeed: 1.5,
    detectionRange: 11,
    leashRange: 20,
    attackCooldown: 1.6,
    attackWindup: 0.5,
    attackRecovery: 0.4,
    projectileSpeed: 0,
    projectileLifetime: 0,
    color: '#dc2626',
    faction: 'wolf',
    expReward: 30,
    lootName: 'Gold Coins',
    lootAmount: 18,
    lootColor: '#dc2626',
  },
};

/** Frost Mage's sequenced ally spawns (seconds → Ice tier). The 20 s / 40 s
 *  "Ice Count" duplicate in the brief is resolved to Marquess at 40 s. */
export const ICE_ALLY_TIERS: ReadonlyArray<{ at: number; name: string; hp: number; damage: number }> = [
  { at: 5, name: 'Ice Baron', hp: 15, damage: 5 },
  { at: 10, name: 'Ice Viscount', hp: 20, damage: 6 },
  { at: 20, name: 'Ice Count', hp: 25, damage: 7 },
  { at: 40, name: 'Ice Marquess', hp: 30, damage: 8 },
  { at: 60, name: 'Ice Duke', hp: 35, damage: 9 },
  { at: 90, name: 'Ice Queen', hp: 40, damage: 10 },
  { at: 120, name: 'Ice King', hp: 45, damage: 11 },
  { at: 150, name: 'Ice Emperor', hp: 50, damage: 12 },
];

/** M2D4 #2 — live world-space XZ positions of active dungeon casters. The
 *  Fire/Frost Magma cross-combo (each casts only while an opposite-element
 *  mage is within 5 m) reads these. Placeholder coordination only: entries are
 *  registered on mount and removed on unmount. */
export const FROST_MAGE_POSITIONS: { id: string; x: number; z: number }[] = [];
export const FIRE_MAGE_POSITIONS: { id: string; x: number; z: number }[] = [];
