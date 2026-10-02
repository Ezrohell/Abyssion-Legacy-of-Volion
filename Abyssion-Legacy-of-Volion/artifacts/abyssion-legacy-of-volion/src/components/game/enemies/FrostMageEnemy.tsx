'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import BaseEnemy, { EnemyContext } from './BaseEnemy';
import { EnemyConfig, EnemyProps, requestAttackerToken, releaseAttackerToken, hasAttackerToken } from './types';
import { useGameStore } from '@/lib/store';
import { playerRigidBodyRef } from '../Player';
import { guardedPlayerImpulse } from '@/lib/playerImpulse';
import { DUNGEON_ENEMY_CONFIGS, ICE_ALLY_TIERS, FIRE_MAGE_POSITIONS, FROST_MAGE_POSITIONS } from '@/lib/encounterConfig';

/**
 * M2D4 #2 — PHASE 2: Frost Mage.
 *
 * Projectile caster plus a SEQUENCED ally schedule (ICE_ALLY_TIERS): one
 * lightweight BaseEnemy ally per tier, looped every 180 s. Ice allies have no
 * unique AI — they are plain BaseEnemy instances with the tier's hp/damage and
 * the shared 'Ice Ally' drop key.
 *
 * Frosted Magma is mirrored from the Fire Mage (placeholder): 30 s cooldown,
 * only while a Fire Mage is within 5 m.
 */

interface Projectile {
  id: string;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  life: number;
}

const _curr = new THREE.Vector3();
const _toPlayer = new THREE.Vector3();
const _spawn = new THREE.Vector3();
const _flyDir = new THREE.Vector3();
const _kbDir = new THREE.Vector3();
const _playerPos = new THREE.Vector3();

const MAGMA_COOLDOWN = 30;
const MAGMA_TRIGGER_DIST = 5;
const MAGMA_RADIUS = 4;
const MAGMA_DAMAGE = 30;
const ALLY_LOOP_SEC = 180;

function iceAllyConfig(tier: { name: string; hp: number; damage: number }): EnemyConfig {
  return {
    name: 'Ice Ally',
    maxHp: tier.hp,
    moveSpeed: 2.6,
    patrolSpeed: 1.1,
    detectionRange: 11,
    attackRange: 2.4,
    leashRange: 18,
    attackCooldown: 1.4,
    attackWindup: 0.4,
    attackRecovery: 0.4,
    damage: tier.damage,
    knockback: 1,
    lootName: 'Gold Coins',
    lootAmount: 5,
    lootColor: '#38bdf8',
    faction: 'wolf',
    expReward: 10,
  };
}

function IceAllyMesh({ ctx }: { ctx: EnemyContext }) {
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

export default function FrostMageEnemy({ position }: EnemyProps) {
  const config = DUNGEON_ENEMY_CONFIGS.frost;
  const meshRef = useRef<THREE.Group>(null);
  const idRef = useRef(`frost_${Math.random().toString(36).slice(2, 9)}`);
  const currentPosRef = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [allies, setAllies] = useState<{ id: string; tier: (typeof ICE_ALLY_TIERS)[number] }[]>([]);
  const castTimerRef = useRef(0);
  const isCastingRef = useRef(false);
  const spawnElapsedRef = useRef(0);
  const spawnedTiersRef = useRef<Set<number>>(new Set());
  const magmaTimerRef = useRef(MAGMA_COOLDOWN);

  // Register this caster so a Fire Mage can find it for the cross-combo.
  useEffect(() => {
    const entry = { id: idRef.current, x: position[0], z: position[2] };
    FROST_MAGE_POSITIONS.push(entry);
    return () => {
      const idx = FROST_MAGE_POSITIONS.indexOf(entry);
      if (idx >= 0) FROST_MAGE_POSITIONS.splice(idx, 1);
    };
  }, [position]);

  useFrame((_, delta) => {
    // ── Sequenced ally spawns (loop every 180 s) ───────────────────────────
    spawnElapsedRef.current += delta;
    if (spawnElapsedRef.current >= ALLY_LOOP_SEC) {
      spawnElapsedRef.current -= ALLY_LOOP_SEC;
      spawnedTiersRef.current.clear();
      setAllies([]);
    }
    for (const tier of ICE_ALLY_TIERS) {
      if (spawnElapsedRef.current >= tier.at && !spawnedTiersRef.current.has(tier.at)) {
        spawnedTiersRef.current.add(tier.at);
        setAllies((prev) => [
          ...prev,
          { id: `ice_${tier.at}_${Math.random().toString(36).slice(2, 7)}`, tier },
        ]);
      }
    }

    // ── Frosted Magma (mirrored placeholder cross-combo) ───────────────────
    magmaTimerRef.current -= delta;
    if (magmaTimerRef.current <= 0) {
      const self = currentPosRef.current;
      const target = FIRE_MAGE_POSITIONS.find(
        (f) => Math.hypot(f.x - self.x, f.z - self.z) <= MAGMA_TRIGGER_DIST,
      );
      if (target) {
        magmaTimerRef.current = MAGMA_COOLDOWN;
        const pp = useGameStore.getState().player.position;
        if (Math.hypot(pp[0] - target.x, pp[2] - target.z) <= MAGMA_RADIUS) {
          useGameStore.getState().damagePlayer(MAGMA_DAMAGE);
        }
      } else {
        magmaTimerRef.current = 0.5;
      }
    }

    if (projectiles.length === 0) return;
    setProjectiles((prev) => {
      const pp = useGameStore.getState().player.position;
      _playerPos.set(pp[0], pp[1] + 1.0, pp[2]);
      const next: Projectile[] = [];
      for (const p of prev) {
        p.life -= delta;
        p.pos.addScaledVector(p.dir, p.speed * delta);
        if (p.pos.distanceTo(_playerPos) <= 2.0) {
          const hitTaken = useGameStore.getState().damagePlayer(config.damage);
          if (hitTaken && playerRigidBodyRef.current) {
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

  const handleCustomUpdate = (ctx: EnemyContext, delta: number): boolean => {
    const { state, setState, rigidBodyRef, playerPos, distToPlayer, cooldownTimer, enemyId } = ctx;
    if (!rigidBodyRef.current || state === 'death') return false;
    const t = rigidBodyRef.current.translation();
    const curr = _curr.set(t.x, t.y, t.z);
    currentPosRef.current.copy(curr);

    const facePlayer = () => {
      const dir = _toPlayer.copy(playerPos).sub(curr);
      dir.y = 0;
      if (dir.lengthSq() > 0.01 && meshRef.current) meshRef.current.rotation.y = Math.atan2(dir.x, dir.z);
    };

    if (state === 'chase') {
      facePlayer();
      if (distToPlayer < 4.5) {
        const away = _kbDir.copy(curr).sub(playerPos).setY(0).normalize();
        rigidBodyRef.current.setLinvel(
          { x: away.x * config.moveSpeed, y: rigidBodyRef.current.linvel().y, z: away.z * config.moveSpeed },
          true,
        );
        return true;
      }
      if (distToPlayer <= config.attackRange && cooldownTimer <= 0) {
        if (!requestAttackerToken(enemyId)) return true;
        return false;
      }
    }

    if (state === 'attack') {
      if (!hasAttackerToken(enemyId)) {
        isCastingRef.current = false;
        setState('chase');
        return true;
      }
      rigidBodyRef.current.setLinvel({ x: 0, y: rigidBodyRef.current.linvel().y, z: 0 }, true);
      facePlayer();
      if (!isCastingRef.current) {
        isCastingRef.current = true;
        castTimerRef.current = ctx.config.attackWindup;
      } else {
        castTimerRef.current -= delta;
        if (castTimerRef.current <= 0) {
          const sp = _spawn.copy(curr);
          sp.y += 1.6;
          const fd = _flyDir.copy(playerPos);
          fd.y += 0.8;
          fd.sub(sp).normalize();
          setProjectiles((prev) => [
            ...prev,
            {
              id: `frost_${Math.random().toString(36).slice(2, 9)}`,
              pos: sp.clone(),
              dir: fd.clone(),
              speed: config.projectileSpeed,
              life: config.projectileLifetime,
            },
          ]);
          isCastingRef.current = false;
          releaseAttackerToken(enemyId);
          setState('chase');
        }
      }
      return true;
    }
    return false;
  };

  const renderMesh = (ctx: EnemyContext) => (
    <group ref={meshRef}>
      <mesh castShadow position={[0, 0.9, 0]}>
        <cylinderGeometry args={[0.3, 0.6, 1.4, 12]} />
        <meshToonMaterial color={ctx.hitFlash ? '#ffffff' : '#0c4a6e'} />
      </mesh>
      <mesh castShadow position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.25, 12, 12]} />
        <meshToonMaterial color="#075985" />
      </mesh>
      <mesh position={[0, 2.1, 0]} rotation={[0.2, 0, 0]}>
        <coneGeometry args={[0.4, 0.8, 12]} />
        <meshToonMaterial color="#075985" />
      </mesh>
      <mesh position={[0.4, 1.6, 0]}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshToonMaterial color={config.color} emissive={config.color} emissiveIntensity={1.4} />
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
          <icosahedronGeometry args={[0.3, 0]} />
          <meshToonMaterial color={config.color} emissive={config.color} emissiveIntensity={2} />
        </mesh>
      ))}
    </group>
  );

  return (
    <>
      <BaseEnemy position={position} config={config} customUpdate={handleCustomUpdate} renderMesh={renderMesh} />
      {allies.map((a) => {
        const spawnPos: [number, number, number] = [
          position[0] + (Math.random() - 0.5) * 6,
          position[1],
          position[2] + (Math.random() - 0.5) * 6,
        ];
        return (
          <BaseEnemy
            key={a.id}
            position={spawnPos}
            config={iceAllyConfig(a.tier)}
            renderMesh={(c) => <IceAllyMesh ctx={c} />}
          />
        );
      })}
    </>
  );
}
