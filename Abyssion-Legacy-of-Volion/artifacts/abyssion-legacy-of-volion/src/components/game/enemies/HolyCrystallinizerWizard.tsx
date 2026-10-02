'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import BaseEnemy, { EnemyContext } from './BaseEnemy';
import { EnemyConfig, EnemyProps } from './types';
import { useGameStore } from '@/lib/store';
import { playerRigidBodyRef } from '../Player';
import { guardedPlayerImpulse } from '@/lib/playerImpulse';
import { addItem } from '@/lib/inventory';

/**
 * M2D4 #2 — PHASE 3: Holy Crystallinizer Wizard (dungeon boss).
 *
 * Four HP-band phases (ALL VALUES ARE PLACEHOLDERS from the brief; the bands
 * are applied as ratios of the level-scaled max HP so the fractions hold at
 * any player level):
 *   500..376 (ratio > 0.75):  Fireball every 3 s, 30 damage
 *   375..251 (ratio > 0.50):  Crystal Shard every 2.5 s, 25 damage
 *   250..126 (ratio > 0.25):  summon Ice Viscount every 10 s (max 2 mounted)
 *   125..1   (else):          Frosted Magma every 15 s (30 dmg, 4 m radius)
 *                             + Fangbite melee within 2 m (Bleeding I)
 *
 * Phase transition shows a short colour flash placeholder.
 *
 * Death reward: BaseEnemy's existing death path already handles the generic
 * loot/EXP/kill-credit. The 100..500 Coin reward is delivered THROUGH that
 * path by randomising this instance's config.lootAmount once at mount. This
 * component adds only the boss-specific extras (defeat flag + one random food
 * item) and routes inventory overflow to spawnWorldDrop.
 *
 * Boss HP bar and boss music are NOT IMPLEMENTED (no boss-specific values
 * invented; the generic BaseEnemy health bar is inherited, not added).
 */

type BossPhase = 0 | 1 | 2 | 3;

const PHASE_COLORS = ['#f97316', '#7dd3fc', '#38bdf8', '#a855f7'] as const;

const FOOD_IDS = ['bread', 'apple', 'crispy_chicken', 'chicken_steak', 'beef_steak', 'chicken_katsu'] as const;

const ICE_VISCOUNT_CONFIG: EnemyConfig = {
  name: 'Ice Ally',
  maxHp: 20,
  damage: 6,
  moveSpeed: 2.6,
  patrolSpeed: 1.1,
  detectionRange: 11,
  attackRange: 2.4,
  leashRange: 30,
  attackCooldown: 1.4,
  attackWindup: 0.4,
  attackRecovery: 0.4,
  knockback: 1,
  lootName: 'Gold Coins',
  lootAmount: 5,
  lootColor: '#38bdf8',
  faction: 'wolf',
  expReward: 10,
};

const BOSS_BASE: EnemyConfig = {
  name: 'Holy Crystallinizer Wizard',
  maxHp: 500,
  moveSpeed: 2.2,
  patrolSpeed: 1.0,
  detectionRange: 14,
  attackRange: 10,
  leashRange: 40,
  attackCooldown: 3,
  attackWindup: 0.9,
  attackRecovery: 0.6,
  damage: 25,
  knockback: 3,
  lootName: 'Gold Coins',
  lootAmount: 250,
  lootColor: '#facc15',
  faction: 'mage',
  expReward: 500,
};

interface BossProjectile {
  id: string;
  kind: 'fireball' | 'shard';
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  life: number;
  damage: number;
  color: string;
}

/** 500..376 → 0 ; 375..251 → 1 ; 250..126 → 2 ; 125..1 → 3 (by HP ratio). */
function phaseForRatio(ratio: number): BossPhase {
  if (ratio > 375 / 500) return 0;
  if (ratio > 250 / 500) return 1;
  if (ratio > 125 / 500) return 2;
  return 3;
}

const _curr = new THREE.Vector3();
const _toPlayer = new THREE.Vector3();
const _move = new THREE.Vector3();
const _spawn = new THREE.Vector3();
const _fly = new THREE.Vector3();
const _kbDir = new THREE.Vector3();
const _playerPos = new THREE.Vector3();
const _magmaCenter = new THREE.Vector3();

function IceViscountMesh({ ctx }: { ctx: EnemyContext }) {
  return (
    <group position={[0, 0.4, 0]}>
      <mesh castShadow position={[0, 0.4, 0]} rotation={[0, 0, Math.PI / 6]}>
        <octahedronGeometry args={[0.45, 0]} />
        <meshToonMaterial color={ctx.hitFlash ? '#ffffff' : '#38bdf8'} emissive="#0ea5e9" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0.16, 0.72, 0.14]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshToonMaterial color="#e0f2fe" emissive="#bae6fd" emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[-0.16, 0.72, 0.14]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshToonMaterial color="#e0f2fe" emissive="#bae6fd" emissiveIntensity={1.2} />
      </mesh>
    </group>
  );
}

export default function HolyCrystallinizerWizard({ position }: EnemyProps) {
  // Random 100..500 Coin reward, delivered through BaseEnemy's existing coin
  // death drop (no duplicate drop path is added here).
  const coinReward = useMemo(() => 100 + Math.floor(Math.random() * 401), []);
  const config = useMemo<EnemyConfig>(() => ({ ...BOSS_BASE, lootAmount: coinReward }), [coinReward]);

  const meshRef = useRef<THREE.Group>(null);
  const currentPosRef = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  // renderMesh copies the live hp here each render, so the no-dependency effect
  // below can observe the death frame (BaseEnemy owns hp and cannot be changed).
  const hpSeenRef = useRef(config.maxHp);
  const deathHandledRef = useRef(false);

  const phaseRef = useRef<BossPhase>(0);
  const [phase, setPhase] = useState<BossPhase>(0);
  const [flash, setFlash] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [projectiles, setProjectiles] = useState<BossProjectile[]>([]);
  const [allies, setAllies] = useState<{ id: string; pos: [number, number, number] }[]>([]);

  const attackTimerRef = useRef(3);
  const summonTimerRef = useRef(10);
  const magmaTimerRef = useRef(15);
  const fangTimerRef = useRef(0);
  const magmaFxRef = useRef<THREE.Mesh>(null);
  const magmaFxStateRef = useRef<{ pos: THREE.Vector3; scale: number; opacity: number } | null>(null);

  useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  // Boss-only death extras. Runs after every render; hpSeenRef is refreshed by
  // renderMesh during render, so on the death frame hpSeenRef.current is 0.
  useEffect(() => {
    if (deathHandledRef.current) return;
    if (hpSeenRef.current > 0) return;
    deathHandledRef.current = true;
    const store = useGameStore.getState();
    store.defeatBoss();

    // Grant one item into the inventory; anything that will not fit becomes a
    // world drop at the boss's position. Reads FRESH state per grant so two
    // grants in one death cannot clobber each other's inventory write.
    const grantOrDrop = (itemId: string) => {
      const cur = useGameStore.getState();
      const { inv, added } = addItem(cur.player.inventory, itemId, 1);
      if (added > 0) cur.setInventory(inv);
      const overflow = 1 - added;
      if (overflow > 0) {
        const pos = currentPosRef.current;
        cur.spawnWorldDrop(itemId, overflow, [pos.x, pos.y + 0.5, pos.z], 'enemy');
      }
    };
    const foodId = FOOD_IDS[Math.floor(Math.random() * FOOD_IDS.length)];
    grantOrDrop(foodId);
    // P4-R4 — the boss also drops All For Staff (drop-only weapon).
    grantOrDrop('all_for_staff');
    store.addNotification('Holy Crystallinizer Wizard Defeated!');
  });

  useFrame((_, delta) => {
    // Animate the Frosted Magma flash (ref-driven, no per-frame React state).
    const fx = magmaFxStateRef.current;
    if (fx && magmaFxRef.current) {
      fx.scale += delta * 7;
      fx.opacity = Math.max(0, fx.opacity - delta * 1.8);
      if (fx.opacity <= 0) {
        magmaFxStateRef.current = null;
        magmaFxRef.current.visible = false;
      } else {
        magmaFxRef.current.visible = true;
        magmaFxRef.current.scale.setScalar(fx.scale);
        (magmaFxRef.current.material as THREE.MeshToonMaterial).opacity = fx.opacity;
        magmaFxRef.current.position.set(
          fx.pos.x - currentPosRef.current.x,
          fx.pos.y - currentPosRef.current.y,
          fx.pos.z - currentPosRef.current.z,
        );
      }
    }

    if (projectiles.length === 0) return;
    setProjectiles((prev) => {
      const pp = useGameStore.getState().player.position;
      _playerPos.set(pp[0], pp[1] + 1.0, pp[2]);
      const next: BossProjectile[] = [];
      for (const p of prev) {
        p.life -= delta;
        p.pos.addScaledVector(p.dir, p.speed * delta);
        if (p.pos.distanceTo(_playerPos) <= 2.2) {
          const hit = useGameStore.getState().damagePlayer(p.damage);
          if (hit && playerRigidBodyRef.current) {
            const kb = _kbDir.copy(_playerPos).sub(p.pos).setY(0).normalize();
            guardedPlayerImpulse({ x: kb.x * config.knockback, y: 3, z: kb.z * config.knockback });
          }
          continue;
        }
        if (p.life <= 0 || p.pos.y <= 0.2) continue;
        next.push(p);
      }
      return next;
    });
  });

  const spawnProjectile = (from: THREE.Vector3, target: THREE.Vector3, isFire: boolean) => {
    const sp = _spawn.copy(from);
    sp.y += 2.0;
    const fd = _fly.copy(target);
    fd.y += 0.8;
    fd.sub(sp).normalize();
    setProjectiles((prev) => [
      ...prev,
      {
        id: `${isFire ? 'fire' : 'shard'}_${Math.random().toString(36).slice(2, 9)}`,
        kind: isFire ? 'fireball' : 'shard',
        pos: sp.clone(),
        dir: fd.clone(),
        speed: isFire ? 14 : 20,
        life: 3,
        damage: isFire ? 30 : 25,
        color: isFire ? '#f97316' : '#7dd3fc',
      },
    ]);
  };

  const handleCustomUpdate = (ctx: EnemyContext, delta: number): boolean => {
    const { state, rigidBodyRef, playerPos, distToPlayer, scaledConfig } = ctx;
    if (!rigidBodyRef.current || state === 'death') return false;
    hpSeenRef.current = ctx.hp;

    const t = rigidBodyRef.current.translation();
    const curr = _curr.set(t.x, t.y, t.z);
    currentPosRef.current.copy(curr);

    // Phase from HP ratio; a change triggers the colour-flash placeholder.
    const ratio = scaledConfig.maxHp > 0 ? ctx.hp / scaledConfig.maxHp : 0;
    const nextPhase = phaseForRatio(ratio);
    if (nextPhase !== phaseRef.current) {
      phaseRef.current = nextPhase;
      setPhase(nextPhase);
      setFlash(true);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        flashTimerRef.current = null;
        setFlash(false);
      }, 320);
    }

    const toPlayer = _toPlayer.copy(playerPos).sub(curr);
    toPlayer.y = 0;
    if (meshRef.current && toPlayer.lengthSq() > 0.01) {
      meshRef.current.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    }

    // Close to just inside attackRange, otherwise hold ground.
    if (distToPlayer > config.attackRange - 1) {
      const dir = _move.copy(toPlayer);
      if (dir.lengthSq() > 0.01) {
        dir.normalize();
        rigidBodyRef.current.setLinvel(
          { x: dir.x * config.moveSpeed, y: rigidBodyRef.current.linvel().y, z: dir.z * config.moveSpeed },
          true,
        );
      }
    } else {
      rigidBodyRef.current.setLinvel({ x: 0, y: rigidBodyRef.current.linvel().y, z: 0 }, true);
    }

    attackTimerRef.current = Math.max(0, attackTimerRef.current - delta);
    summonTimerRef.current = Math.max(0, summonTimerRef.current - delta);
    magmaTimerRef.current = Math.max(0, magmaTimerRef.current - delta);
    fangTimerRef.current = Math.max(0, fangTimerRef.current - delta);

    if (distToPlayer > config.attackRange) return true;

    if (phaseRef.current <= 1) {
      if (attackTimerRef.current <= 0) {
        const isFire = phaseRef.current === 0;
        attackTimerRef.current = isFire ? 3 : 2.5;
        spawnProjectile(curr, playerPos, isFire);
      }
    } else if (phaseRef.current === 2) {
      if (summonTimerRef.current <= 0) {
        summonTimerRef.current = 10;
        const spawnPos: [number, number, number] = [
          curr.x + (Math.random() - 0.5) * 5,
          curr.y,
          curr.z + (Math.random() - 0.5) * 5,
        ];
        setAllies((prev) =>
          prev.length >= 2 ? prev : [...prev, { id: `viscount_${Math.random().toString(36).slice(2, 7)}`, pos: spawnPos }],
        );
      }
    } else {
      if (magmaTimerRef.current <= 0) {
        magmaTimerRef.current = 15;
        const center = _magmaCenter.set(curr.x, curr.y + 0.4, curr.z);
        magmaFxStateRef.current = { pos: center.clone(), scale: 0.5, opacity: 1 };
        const pp = useGameStore.getState().player.position;
        if (Math.hypot(pp[0] - curr.x, pp[2] - curr.z) <= 4) {
          useGameStore.getState().damagePlayer(30);
        }
      }
      if (distToPlayer <= 2 && fangTimerRef.current <= 0) {
        fangTimerRef.current = 2.5;
        const hit = useGameStore.getState().damagePlayer(config.damage);
        if (hit) {
          useGameStore.getState().applyDebuff('bleeding', 1, 3);
          if (playerRigidBodyRef.current) {
            const kb = _kbDir.copy(playerPos).sub(curr).setY(0).normalize();
            guardedPlayerImpulse({ x: kb.x * config.knockback, y: 3, z: kb.z * config.knockback });
          }
        }
      }
    }
    return true;
  };

  const renderMesh = (ctx: EnemyContext) => {
    // Bridge BaseEnemy's authoritative hp to the death effect above.
    hpSeenRef.current = ctx.hp;
    const phaseColor = PHASE_COLORS[phase];
    const bodyColor = flash || ctx.hitFlash ? '#ffffff' : phaseColor;
    return (
      <group ref={meshRef}>
        <mesh castShadow position={[0, 1.1, 0]}>
          <cylinderGeometry args={[0.45, 0.85, 1.9, 12]} />
          <meshToonMaterial color={bodyColor} emissive={phaseColor} emissiveIntensity={flash ? 2 : 0.35} />
        </mesh>
        <mesh castShadow position={[0, 2.15, 0]}>
          <sphereGeometry args={[0.35, 12, 12]} />
          <meshToonMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0, 2.75, 0]} rotation={[0.15, 0, 0]}>
          <coneGeometry args={[0.55, 1.1, 12]} />
          <meshToonMaterial color={phaseColor} emissive={phaseColor} emissiveIntensity={0.8} />
        </mesh>
        <mesh position={[0.6, 1.9, 0]}>
          <sphereGeometry args={[0.22, 12, 12]} />
          <meshToonMaterial color={phaseColor} emissive={phaseColor} emissiveIntensity={1.6} />
        </mesh>
        {projectiles.map((p) => (
          <mesh
            key={p.id}
            position={[
              p.pos.x - currentPosRef.current.x,
              p.pos.y - currentPosRef.current.y,
              p.pos.z - currentPosRef.current.z,
            ]}
          >
            {p.kind === 'shard' ? (
              <octahedronGeometry args={[0.3, 0]} />
            ) : (
              <sphereGeometry args={[0.32, 12, 12]} />
            )}
            <meshToonMaterial color={p.color} emissive={p.color} emissiveIntensity={2} />
          </mesh>
        ))}
        <mesh ref={magmaFxRef} visible={false}>
          <sphereGeometry args={[1.5, 16, 16]} />
          <meshToonMaterial color="#a855f7" transparent opacity={0} emissive="#7dd3fc" emissiveIntensity={1.4} />
        </mesh>
      </group>
    );
  };

  return (
    <>
      <BaseEnemy position={position} config={config} customUpdate={handleCustomUpdate} renderMesh={renderMesh} />
      {allies.map((a) => (
        <BaseEnemy
          key={a.id}
          position={a.pos}
          config={ICE_VISCOUNT_CONFIG}
          renderMesh={(c) => <IceViscountMesh ctx={c} />}
        />
      ))}
    </>
  );
}
