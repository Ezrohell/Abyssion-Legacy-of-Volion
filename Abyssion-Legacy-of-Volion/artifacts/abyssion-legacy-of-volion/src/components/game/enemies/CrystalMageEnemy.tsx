'use client';

import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import BaseEnemy, { EnemyContext } from './BaseEnemy';
import { EnemyProps, requestAttackerToken, releaseAttackerToken, hasAttackerToken } from './types';
import { useGameStore } from '@/lib/store';
import { playerRigidBodyRef } from '../Player';
import { guardedPlayerImpulse } from '@/lib/playerImpulse';
import { DUNGEON_ENEMY_CONFIGS } from '@/lib/encounterConfig';

/** M2D4 #1 PHASE 2 — Crystal Mage. Slowest caster (2.5 s) with the fastest
 *  projectile (20 m/s). Drops delegate to ENEMY_DROP_TABLES. */

interface Projectile {
  id: string;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  life: number;
}

const _currPos = new THREE.Vector3();
const _dirToPlayer = new THREE.Vector3();
const _spawnPos = new THREE.Vector3();
const _flyDir = new THREE.Vector3();
const _kbDir = new THREE.Vector3();
const _playerPos = new THREE.Vector3();

export default function CrystalMageEnemy({ position }: EnemyProps) {
  const config = DUNGEON_ENEMY_CONFIGS.crystal;
  const meshRef = useRef<THREE.Group>(null);
  const currentPosRef = useRef(new THREE.Vector3(position[0], position[1], position[2]));
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  // M2D5 #2 F4 — meshes are moved imperatively; state is written only when a
  // projectile is added/removed, never for pure movement.
  const projectileMeshRefs = useRef<Map<string, THREE.Mesh>>(new Map());
  const castTimerRef = useRef(0);
  const isCastingRef = useRef(false);

  useFrame((_, delta) => {
    if (projectiles.length === 0) return;
    const pp = useGameStore.getState().player.position;
    _playerPos.set(pp[0], pp[1] + 1.0, pp[2]);
    let changed = false;
    const survivors: Projectile[] = [];
    for (const p of projectiles) {
      p.life -= delta;
      p.pos.addScaledVector(p.dir, p.speed * delta);
      if (p.pos.distanceTo(_playerPos) <= 2.0) {
        const hitTaken = useGameStore.getState().damagePlayer(config.damage);
        if (hitTaken && playerRigidBodyRef.current) {
          const kb = _kbDir.copy(_playerPos).sub(p.pos).setY(0).normalize();
          guardedPlayerImpulse({ x: kb.x * config.knockback, y: 3, z: kb.z * config.knockback });
        }
        changed = true;
        continue;
      }
      if (p.life <= 0 || p.pos.y <= 0.2) {
        changed = true;
        continue;
      }
      survivors.push(p);
      // F4 — move the mounted mesh directly instead of re-rendering.
      const mesh = projectileMeshRefs.current.get(p.id);
      if (mesh) {
        mesh.position.set(
          p.pos.x - currentPosRef.current.x,
          p.pos.y - currentPosRef.current.y,
          p.pos.z - currentPosRef.current.z,
        );
      }
    }
    // F4 — React state only when a projectile leaves the list.
    if (changed) setProjectiles(survivors);
  });

  const handleCustomUpdate = (ctx: EnemyContext, delta: number): boolean => {
    const { state, setState, rigidBodyRef, playerPos, distToPlayer, cooldownTimer, enemyId } = ctx;
    if (!rigidBodyRef.current || state === 'death') return false;
    const t = rigidBodyRef.current.translation();
    const curr = _currPos.set(t.x, t.y, t.z);
    currentPosRef.current.copy(curr);

    const facePlayer = () => {
      const dir = _dirToPlayer.copy(playerPos).sub(curr);
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
          const sp = _spawnPos.copy(curr);
          sp.y += 1.6;
          const fd = _flyDir.copy(playerPos);
          fd.y += 0.8;
          fd.sub(sp).normalize();
          setProjectiles((prev) => [
            ...prev,
            {
              id: `crystal_${Math.random().toString(36).slice(2, 9)}`,
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
        <meshToonMaterial color={ctx.hitFlash ? '#ffffff' : '#0e7490'} />
      </mesh>
      <mesh castShadow position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.25, 12, 12]} />
        <meshToonMaterial color="#155e75" />
      </mesh>
      <mesh position={[0, 2.1, 0]} rotation={[0.2, 0, 0]}>
        <coneGeometry args={[0.4, 0.8, 12]} />
        <meshToonMaterial color="#155e75" />
      </mesh>
      <mesh position={[0.4, 1.6, 0]}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshToonMaterial color={config.color} emissive={config.color} emissiveIntensity={1.4} />
      </mesh>
      {projectiles.map((p) => (
        <mesh
          key={p.id}
          ref={(m) => {
            if (m) projectileMeshRefs.current.set(p.id, m);
            else projectileMeshRefs.current.delete(p.id);
          }}
          position={[
            p.pos.x - currentPosRef.current.x,
            p.pos.y - currentPosRef.current.y,
            p.pos.z - currentPosRef.current.z,
          ]}
        >
          <octahedronGeometry args={[0.32, 0]} />
          <meshToonMaterial color={config.color} emissive={config.color} emissiveIntensity={2} />
        </mesh>
      ))}
    </group>
  );

  return (
    <BaseEnemy position={position} config={config} customUpdate={handleCustomUpdate} renderMesh={renderMesh} />
  );
}
