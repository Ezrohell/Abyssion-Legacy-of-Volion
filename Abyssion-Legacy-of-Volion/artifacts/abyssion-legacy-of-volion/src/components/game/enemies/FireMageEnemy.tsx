'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import BaseEnemy, { EnemyContext } from './BaseEnemy';
import { EnemyProps, requestAttackerToken, releaseAttackerToken, hasAttackerToken } from './types';
import { useGameStore } from '@/lib/store';
import { playerRigidBodyRef } from '../Player';
import { guardedPlayerImpulse } from '@/lib/playerImpulse';
import { DUNGEON_ENEMY_CONFIGS, FIRE_MAGE_POSITIONS, FROST_MAGE_POSITIONS } from '@/lib/encounterConfig';

/**
 * M2D4 #2 — PHASE 2: Fire Mage.
 *
 * Projectile caster. Every landed fireball applies a throttled "Sunburn"
 * marker — SUNBURN is UNSPECIFIED as a distinct debuff, so it is implemented
 * as applyDebuff('poison', 1, 5) at most once every 10 s.
 *
 * Frosted Magma (placeholder): 30 s cooldown, cast only while a Frost Mage is
 * within 5 m; deals 30 damage in a 4 m radius centred on that Frost Mage.
 * All Frosted Magma numbers are placeholders from the brief.
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

const SUNBURN_INTERVAL = 10;
const MAGMA_COOLDOWN = 30;
const MAGMA_TRIGGER_DIST = 5;
const MAGMA_RADIUS = 4;
const MAGMA_DAMAGE = 30;

export default function FireMageEnemy({ position }: EnemyProps) {
  const config = DUNGEON_ENEMY_CONFIGS.fire;
  const meshRef = useRef<THREE.Group>(null);
  const idRef = useRef(`fire_${Math.random().toString(36).slice(2, 9)}`);
  const currentPosRef = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const castTimerRef = useRef(0);
  const isCastingRef = useRef(false);
  const sunburnTimerRef = useRef(0);
  const magmaTimerRef = useRef(MAGMA_COOLDOWN);
  const magmaFxRef = useRef<THREE.Mesh>(null);
  const magmaFxStateRef = useRef<{ pos: THREE.Vector3; scale: number; opacity: number } | null>(null);

  // Register this caster so a Frost Mage can find it for the cross-combo.
  useEffect(() => {
    const entry = { id: idRef.current, x: position[0], z: position[2] };
    FIRE_MAGE_POSITIONS.push(entry);
    return () => {
      const idx = FIRE_MAGE_POSITIONS.indexOf(entry);
      if (idx >= 0) FIRE_MAGE_POSITIONS.splice(idx, 1);
    };
  }, [position]);

  useFrame((_, delta) => {
    sunburnTimerRef.current = Math.max(0, sunburnTimerRef.current - delta);

    // ── Frosted Magma ultimate (placeholder cross-combo) ────────────────────
    magmaTimerRef.current -= delta;
    if (magmaTimerRef.current <= 0) {
      const self = currentPosRef.current;
      const target = FROST_MAGE_POSITIONS.find(
        (f) => Math.hypot(f.x - self.x, f.z - self.z) <= MAGMA_TRIGGER_DIST,
      );
      if (target) {
        magmaTimerRef.current = MAGMA_COOLDOWN;
        const det = new THREE.Vector3(target.x, self.y + 0.6, target.z);
        magmaFxStateRef.current = { pos: det.clone(), scale: 0.6, opacity: 1 };
        const pp = useGameStore.getState().player.position;
        if (Math.hypot(pp[0] - det.x, pp[2] - det.z) <= MAGMA_RADIUS) {
          useGameStore.getState().damagePlayer(MAGMA_DAMAGE);
        }
      } else {
        magmaTimerRef.current = 0.5; // re-check soon
      }
    }

    // Animate the magma flash (ref-driven, no per-frame React state)
    const fx = magmaFxStateRef.current;
    if (fx && magmaFxRef.current) {
      fx.scale += delta * 10;
      fx.opacity = Math.max(0, fx.opacity - delta * 2.2);
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
      const next: Projectile[] = [];
      for (const p of prev) {
        p.life -= delta;
        p.pos.addScaledVector(p.dir, p.speed * delta);
        if (p.pos.distanceTo(_playerPos) <= 2.0) {
          const hitTaken = useGameStore.getState().damagePlayer(config.damage);
          if (hitTaken) {
            if (sunburnTimerRef.current <= 0) {
              useGameStore.getState().applyDebuff('poison', 1, 5);
              sunburnTimerRef.current = SUNBURN_INTERVAL;
            }
            if (playerRigidBodyRef.current) {
              const kb = _kbDir.copy(_playerPos).sub(p.pos).setY(0).normalize();
              guardedPlayerImpulse({ x: kb.x * config.knockback, y: 3, z: kb.z * config.knockback });
            }
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
      if (distToPlayer < 5) {
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
              id: `fire_${Math.random().toString(36).slice(2, 9)}`,
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
        <meshToonMaterial color={ctx.hitFlash ? '#ffffff' : '#7c2d12'} />
      </mesh>
      <mesh castShadow position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.25, 12, 12]} />
        <meshToonMaterial color="#9a3412" />
      </mesh>
      <mesh position={[0, 2.1, 0]} rotation={[0.2, 0, 0]}>
        <coneGeometry args={[0.4, 0.8, 12]} />
        <meshToonMaterial color="#9a3412" />
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
          <sphereGeometry args={[0.3, 12, 12]} />
          <meshToonMaterial color={config.color} emissive={config.color} emissiveIntensity={2} />
        </mesh>
      ))}
      <mesh ref={magmaFxRef} visible={false}>
        <sphereGeometry args={[1.4, 16, 16]} />
        <meshToonMaterial color="#f97316" transparent opacity={0} emissive="#ef4444" emissiveIntensity={1.5} />
      </mesh>
    </group>
  );

  return (
    <BaseEnemy position={position} config={config} customUpdate={handleCustomUpdate} renderMesh={renderMesh} />
  );
}
