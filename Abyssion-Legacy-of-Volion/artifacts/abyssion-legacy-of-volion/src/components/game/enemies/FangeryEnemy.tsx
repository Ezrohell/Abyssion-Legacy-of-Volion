'use client';

import React, { useRef } from 'react';
import * as THREE from 'three';
import BaseEnemy, { EnemyContext } from './BaseEnemy';
import { EnemyProps, requestAttackerToken, releaseAttackerToken } from './types';
import { useGameStore } from '@/lib/store';
import { playerRigidBodyRef } from '../Player';
import { guardedPlayerImpulse } from '@/lib/playerImpulse';
import { DUNGEON_ENEMY_CONFIGS } from '@/lib/encounterConfig';

/**
 * M2D4 #2 — PHASE 2: Fangery.
 *
 * Melee-only: a straight lunge with a short windup. On a CONFIRMED bite
 * (player within attackRange during the lunge) it applies a fixed
 * Bleeding I for 3 s — no roll table, no projectile. Values come from
 * DUNGEON_ENEMY_CONFIGS.fangery.
 */

const _curr = new THREE.Vector3();
const _toPlayer = new THREE.Vector3();

export default function FangeryEnemy({ position }: EnemyProps) {
  const config = DUNGEON_ENEMY_CONFIGS.fangery;
  const groupRef = useRef<THREE.Group>(null);
  const phaseRef = useRef<'none' | 'lunge' | 'recover'>('none');
  const timerRef = useRef(0);
  const bitRef = useRef(false);
  const lungeDirRef = useRef(new THREE.Vector3(0, 0, 1));

  const handleCustomUpdate = (ctx: EnemyContext, delta: number): boolean => {
    const { state, setState, rigidBodyRef, playerPos, distToPlayer, enemyId } = ctx;
    if (!rigidBodyRef.current || state === 'death') return false;

    const t = rigidBodyRef.current.translation();
    const curr = _curr.set(t.x, t.y, t.z);

    if (state === 'chase') {
      const toPlayer = _toPlayer.copy(playerPos).sub(curr);
      toPlayer.y = 0;
      if (toPlayer.lengthSq() > 0.01 && groupRef.current) {
        groupRef.current.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
      }
      if (distToPlayer <= config.attackRange && ctx.cooldownTimer <= 0) {
        if (!requestAttackerToken(enemyId)) return true;
        phaseRef.current = 'lunge';
        timerRef.current = 0.35;
        bitRef.current = false;
        lungeDirRef.current.copy(toPlayer).setY(0).normalize();
        return false;
      }
      return false;
    }

    if (state === 'attack') {
      const lungeDir = lungeDirRef.current;
      if (phaseRef.current === 'lunge') {
        timerRef.current -= delta;
        rigidBodyRef.current.setLinvel(
          { x: lungeDir.x * 9, y: rigidBodyRef.current.linvel().y, z: lungeDir.z * 9 },
          true,
        );
        if (!bitRef.current && distToPlayer <= config.attackRange) {
          bitRef.current = true;
          const hitTaken = useGameStore.getState().damagePlayer(config.damage);
          if (hitTaken) {
            // A confirmed bite applies Bleeding I (3 s), fixed.
            useGameStore.getState().applyDebuff('bleeding', 1, 3);
            if (playerRigidBodyRef.current) {
              guardedPlayerImpulse({
                x: lungeDir.x * config.knockback,
                y: 3,
                z: lungeDir.z * config.knockback,
              });
            }
          }
        }
        if (timerRef.current <= 0) {
          phaseRef.current = 'recover';
          timerRef.current = 0.4;
        }
        return true;
      }
      if (phaseRef.current === 'recover') {
        timerRef.current -= delta;
        rigidBodyRef.current.setLinvel(
          { x: 0, y: rigidBodyRef.current.linvel().y, z: 0 },
          true,
        );
        if (timerRef.current <= 0) {
          releaseAttackerToken(enemyId);
          phaseRef.current = 'none';
          setState('chase');
        }
        return true;
      }
    }

    if (phaseRef.current !== 'none') {
      releaseAttackerToken(enemyId);
      phaseRef.current = 'none';
    }
    return false;
  };

  const renderMesh = (ctx: EnemyContext) => (
    <group ref={groupRef} position={[0, 0.4, 0]}>
      <mesh castShadow receiveShadow position={[0, 0.4, 0]}>
        <boxGeometry args={[0.7, 0.7, 1.4]} />
        <meshToonMaterial color={ctx.hitFlash ? '#ffffff' : config.color} />
      </mesh>
      <mesh castShadow position={[0, 0.7, 0.8]}>
        <boxGeometry args={[0.5, 0.5, 0.6]} />
        <meshToonMaterial color={ctx.hitFlash ? '#ffffff' : '#7f1d1d'} />
      </mesh>
      <mesh castShadow position={[0, 0.6, 1.2]}>
        <boxGeometry args={[0.3, 0.3, 0.4]} />
        <meshToonMaterial color="#450a0a" />
      </mesh>
      {/* Glowing fangs */}
      <mesh position={[0.12, 0.5, 1.35]}>
        <coneGeometry args={[0.05, 0.18, 4]} />
        <meshToonMaterial color="#fef2f2" emissive="#fecaca" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[-0.12, 0.5, 1.35]}>
        <coneGeometry args={[0.05, 0.18, 4]} />
        <meshToonMaterial color="#fef2f2" emissive="#fecaca" emissiveIntensity={0.6} />
      </mesh>
      {/* Eyes */}
      <mesh position={[0.15, 0.82, 1.02]}>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshToonMaterial color="#f97316" emissive="#f97316" emissiveIntensity={1.6} />
      </mesh>
      <mesh position={[-0.15, 0.82, 1.02]}>
        <boxGeometry args={[0.08, 0.08, 0.08]} />
        <meshToonMaterial color="#f97316" emissive="#f97316" emissiveIntensity={1.6} />
      </mesh>
      <mesh position={[0, 0.5, -0.9]} rotation={[-0.5, 0, 0]}>
        <cylinderGeometry args={[0.08, 0.15, 0.8]} />
        <meshToonMaterial color="#7f1d1d" />
      </mesh>
    </group>
  );

  return (
    <BaseEnemy position={position} config={config} customUpdate={handleCustomUpdate} renderMesh={renderMesh} />
  );
}
