'use client';

import { Suspense, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import { KeyboardControls, Sky, Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  EffectComposer,
  EffectPass,
  RenderPass,
  BloomEffect,
  BlendFunction,
  OutlineEffect,
  VignetteEffect,
  HueSaturationEffect,
  NoiseEffect,
  ChromaticAberrationEffect,
} from 'postprocessing';
import Player, { playerRigidBodyRef, HOUSE_POSITION, BED_POSITION } from './Player';
import { useGameStore } from '@/lib/store';
import SlimeEnemy from './enemies/SlimeEnemy';
import WolfEnemy from './enemies/WolfEnemy';
import BanditEnemy from './enemies/BanditEnemy';
import MageEnemy from './enemies/MageEnemy';
import ThornbackEnemy from './enemies/ThornbackEnemy';
import CrystalMageEnemy from './enemies/CrystalMageEnemy';
import FireMageEnemy from './enemies/FireMageEnemy';
import FrostMageEnemy from './enemies/FrostMageEnemy';
import FangeryEnemy from './enemies/FangeryEnemy';
import HolyCrystallinizerWizard from './enemies/HolyCrystallinizerWizard';
import Checkpoint from './Checkpoint';
import NPC from './NPC';
import InteractionManager from './InteractionManager';
import { NPCS_DATA } from '@/lib/questData';
import { ENCOUNTER_CONFIG } from '@/lib/encounterConfig';
import { LANDMARKS } from '@/lib/minimap';
import EncounterArea from './EncounterArea';
import EnemyDummy from './EnemyDummy';
import WorldFX from './WorldFX';
import { getItem } from '@/lib/items';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════
// M2D4 #1 — VERTICAL SLICE: DUNGEON SHELL
// Single source of truth for the dungeon. The shell is a distant, plain
// 10-room + bossroom box at DUNGEON_ORIGIN so it never interferes with the
// main map. Content (enemies, puzzles, traps, boss) arrives in later phases.
// ═══════════════════════════════════════════════════════════════════════════

export const DUNGEON_DOOR_WORLD_POSITION: [number, number, number] = [30, 0, 60];
export const DUNGEON_ORIGIN: [number, number, number] = [500, 0, 0];
export const DUNGEON_ROOM_COUNT = 10;
export const DUNGEON_BOSSROOM_INDEX = 10;
export const DUNGEON_ROOM_SIZE: [number, number] = [12, 12];
export const DUNGEON_BOSSROOM_SIZE: [number, number] = [20, 20];
/** Room sequence (magic / puzzle / trap / puzzle_trap). Room 11 = bossroom.
 *  Infrastructure only this session: every room is a plain box. */
export const ROOM_SEQUENCE: readonly string[] = [
  'magic', 'puzzle', 'trap', 'puzzle_trap', 'magic',
  'trap', 'magic', 'puzzle_trap', 'puzzle', 'magic',
];

/** Room N's centre x in dungeon local space: (N - 1) * 12 + 6. */
const DUNGEON_ROOM_CENTER_X = (n: number) =>
  (n - 1) * DUNGEON_ROOM_SIZE[0] + DUNGEON_ROOM_SIZE[0] / 2;
/** Bossroom centre x in dungeon local space: 10 * 12 + 12 + 10 = 142. */
const DUNGEON_BOSSROOM_CENTER_X =
  DUNGEON_BOSSROOM_INDEX * DUNGEON_ROOM_SIZE[0] + 12 + DUNGEON_BOSSROOM_SIZE[0] / 2;

const DUNGEON_WALL_T = 0.2;
const DUNGEON_WALL_H = 3;
const DUNGEON_DOOR_W = 2.4;
const DUNGEON_PALETTE = { wall: '#a16207', floor: '#8a6b4a', ceiling: '#5a3d22' } as const;

/** Interact labels. Owned by the door zones; Player never invents them. */
const DUNGEON_PROMPT_ENTER = 'Enter Dungeon';
const DUNGEON_PROMPT_BOSSROOM = 'Enter Bossroom';
const DUNGEON_PROMPT_EXIT = 'Leave Dungeon';

/** World-space entry point for room `room` (1..10) or the bossroom (11).
 *  Room 1's entry is the vestibule in front of its -z door. */
export function dungeonRoomEntryWorld(room: number): [number, number, number] {
  const [ox, oy, oz] = DUNGEON_ORIGIN;
  if (room >= DUNGEON_BOSSROOM_INDEX + 1) return [ox + DUNGEON_BOSSROOM_CENTER_X - 8, oy + 1, oz];
  if (room <= 1) return [ox + DUNGEON_ROOM_CENTER_X(1), oy + 1, oz - 9];
  return [ox + DUNGEON_ROOM_CENTER_X(room) - 5, oy + 1, oz];
}

/** World-space return point beside the world-side door (door + 2 m in +z). */
export function dungeonExitWorldPosition(): [number, number, number] {
  return [
    DUNGEON_DOOR_WORLD_POSITION[0],
    DUNGEON_DOOR_WORLD_POSITION[1] + 1,
    DUNGEON_DOOR_WORLD_POSITION[2] + 2,
  ];
}

const dungeonBossroomDoorWorld = (): [number, number, number] => [
  DUNGEON_ORIGIN[0] + DUNGEON_ROOM_CENTER_X(DUNGEON_ROOM_COUNT) + DUNGEON_ROOM_SIZE[0] / 2,
  DUNGEON_ORIGIN[1],
  DUNGEON_ORIGIN[2],
];

const dungeonExitDoorWorld = (): [number, number, number] => [
  DUNGEON_ORIGIN[0] + DUNGEON_BOSSROOM_CENTER_X,
  DUNGEON_ORIGIN[1],
  DUNGEON_ORIGIN[2] + DUNGEON_BOSSROOM_SIZE[1] / 2,
];

interface DungeonSolid {
  key: string;
  pos: [number, number, number];
  size: [number, number, number];
  color: string;
}

/** x-wall at x = cx (perpendicular to x) spanning z ∈ [cz-halfD, cz+halfD]. */
function dungeonXWall(cx: number, cz: number, halfD: number, gap: boolean, key: string): DungeonSolid[] {
  if (!gap) return [{ key, pos: [cx, DUNGEON_WALL_H / 2, cz], size: [DUNGEON_WALL_T, DUNGEON_WALL_H, halfD * 2], color: DUNGEON_PALETTE.wall }];
  const seg = (halfD * 2 - DUNGEON_DOOR_W) / 2;
  return [
    { key: `${key}a`, pos: [cx, DUNGEON_WALL_H / 2, cz - DUNGEON_DOOR_W / 2 - seg / 2], size: [DUNGEON_WALL_T, DUNGEON_WALL_H, seg], color: DUNGEON_PALETTE.wall },
    { key: `${key}b`, pos: [cx, DUNGEON_WALL_H / 2, cz + DUNGEON_DOOR_W / 2 + seg / 2], size: [DUNGEON_WALL_T, DUNGEON_WALL_H, seg], color: DUNGEON_PALETTE.wall },
  ];
}

/** z-wall at z = cz spanning x ∈ [cx-halfW, cx+halfW]. */
function dungeonZWall(cx: number, cz: number, halfW: number, gap: boolean, key: string): DungeonSolid[] {
  if (!gap) return [{ key, pos: [cx, DUNGEON_WALL_H / 2, cz], size: [halfW * 2, DUNGEON_WALL_H, DUNGEON_WALL_T], color: DUNGEON_PALETTE.wall }];
  const seg = (halfW * 2 - DUNGEON_DOOR_W) / 2;
  return [
    { key: `${key}a`, pos: [cx - DUNGEON_DOOR_W / 2 - seg / 2, DUNGEON_WALL_H / 2, cz], size: [seg, DUNGEON_WALL_H, DUNGEON_WALL_T], color: DUNGEON_PALETTE.wall },
    { key: `${key}b`, pos: [cx + DUNGEON_DOOR_W / 2 + seg / 2, DUNGEON_WALL_H / 2, cz], size: [seg, DUNGEON_WALL_H, DUNGEON_WALL_T], color: DUNGEON_PALETTE.wall },
  ];
}

/** Build every dungeon solid (floor / ceiling / walls) in WORLD space. A shared
 *  wall between two adjacent rooms is emitted exactly once. */
function buildDungeonSolids(): DungeonSolid[] {
  const out: DungeonSolid[] = [];
  const hw = DUNGEON_ROOM_SIZE[0] / 2;
  const hd = DUNGEON_ROOM_SIZE[1] / 2;
  for (let n = 1; n <= DUNGEON_ROOM_COUNT; n++) {
    const cx = DUNGEON_ROOM_CENTER_X(n);
    out.push({ key: `r${n}-floor`, pos: [cx, -0.5, 0], size: [DUNGEON_ROOM_SIZE[0], 1, DUNGEON_ROOM_SIZE[1]], color: DUNGEON_PALETTE.floor });
    out.push({ key: `r${n}-ceiling`, pos: [cx, DUNGEON_WALL_H, 0], size: [DUNGEON_ROOM_SIZE[0], 0.2, DUNGEON_ROOM_SIZE[1]], color: DUNGEON_PALETTE.ceiling });
    // East (+x): room 10's east wall is solid — its "door" is the bossroom
    // interact (E → loading → teleport), not a walk-through gap.
    out.push(...dungeonXWall(cx + hw, 0, hd, n < DUNGEON_ROOM_COUNT, `r${n}-east`));
    out.push(...dungeonZWall(cx, hd, hw, false, `r${n}-north`));
    // South (-z): room 1 opens to the entry vestibule.
    out.push(...dungeonZWall(cx, -hd, hw, n === 1, `r${n}-south`));
    // West (-x): only room 1 owns its own west wall; the rest reuse the
    // previous room's east wall (rooms are contiguous along +x).
    if (n === 1) out.push(...dungeonXWall(cx - hw, 0, hd, false, 'r1-west'));
  }
  // Bossroom — 20 × 20, 12 m after room 10. Exit door on the +z wall.
  const bx = DUNGEON_BOSSROOM_CENTER_X;
  const bhw = DUNGEON_BOSSROOM_SIZE[0] / 2;
  const bhd = DUNGEON_BOSSROOM_SIZE[1] / 2;
  out.push({ key: 'boss-floor', pos: [bx, -0.5, 0], size: [DUNGEON_BOSSROOM_SIZE[0], 1, DUNGEON_BOSSROOM_SIZE[1]], color: DUNGEON_PALETTE.floor });
  out.push({ key: 'boss-ceiling', pos: [bx, DUNGEON_WALL_H, 0], size: [DUNGEON_BOSSROOM_SIZE[0], 0.2, DUNGEON_BOSSROOM_SIZE[1]], color: DUNGEON_PALETTE.ceiling });
  out.push(...dungeonXWall(bx - bhw, 0, bhd, false, 'boss-west'));
  out.push(...dungeonXWall(bx + bhw, 0, bhd, false, 'boss-east'));
  out.push(...dungeonZWall(bx, -bhd, bhw, false, 'boss-south'));
  out.push(...dungeonZWall(bx, bhd, bhw, true, 'boss-north'));
  // Entry vestibule 6 × 6 immediately before room 1. Its +z side is room 1's
  // south door, so no vestibule wall is drawn there.
  const vx = DUNGEON_ROOM_CENTER_X(1);
  const vz = -9;
  out.push({ key: 'vest-floor', pos: [vx, -0.5, vz], size: [6, 1, 6], color: DUNGEON_PALETTE.floor });
  out.push({ key: 'vest-ceiling', pos: [vx, DUNGEON_WALL_H, vz], size: [6, 0.2, 6], color: DUNGEON_PALETTE.ceiling });
  out.push(...dungeonXWall(vx - 3, vz, 3, false, 'vest-west'));
  out.push(...dungeonXWall(vx + 3, vz, 3, false, 'vest-east'));
  out.push(...dungeonZWall(vx, vz - 3, 3, false, 'vest-south'));
  const [ox, oy, oz] = DUNGEON_ORIGIN;
  return out.map((s) => ({ ...s, pos: [s.pos[0] + ox, s.pos[1] + oy, s.pos[2] + oz] as [number, number, number] }));
}

/** The dungeon shell: fixed colliders + palette-matched meshes. Every surface
 *  carries its own <CuboidCollider>; auto-colliders are deliberately disabled. */
function DungeonShell() {
  const solids = useMemo(() => buildDungeonSolids(), []);
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        {solids.map((s) => (
          <CuboidCollider
            key={`c-${s.key}`}
            args={[s.size[0] / 2, s.size[1] / 2, s.size[2] / 2]}
            position={s.pos}
          />
        ))}
      </RigidBody>
      {solids.map((s) => (
        <mesh key={`m-${s.key}`} position={s.pos} castShadow receiveShadow>
          <boxGeometry args={s.size} />
          <meshToonMaterial color={s.color} />
        </mesh>
      ))}
      {/* Room 10 +x bossroom door (dark slab) and the bossroom +z exit door. */}
      <mesh position={dungeonBossroomDoorWorld()} castShadow receiveShadow>
        <boxGeometry args={[0.24, DUNGEON_WALL_H, DUNGEON_DOOR_W]} />
        <meshToonMaterial color="#4a3220" />
      </mesh>
      <mesh position={dungeonExitDoorWorld()} castShadow receiveShadow>
        <boxGeometry args={[DUNGEON_DOOR_W, DUNGEON_WALL_H, 0.24]} />
        <meshToonMaterial color="#4a3220" />
      </mesh>
    </group>
  );
}

/** World-side dungeon door at the map edge (2 m × 3 m dark slab) and a small
 *  access plinth so the door is reachable through the +z boundary gap. */
function DungeonWorldDoor() {
  const [dx, dy, dz] = DUNGEON_DOOR_WORLD_POSITION;
  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[3, 0.5, 8]} position={[dx, dy - 0.5, dz - 4]} />
      </RigidBody>
      <mesh position={[dx, dy - 0.5, dz - 4]} receiveShadow>
        <boxGeometry args={[6, 1, 16]} />
        <meshToonMaterial color="#8a6b4a" />
      </mesh>
      <mesh position={[dx, dy + 1.5, dz]} castShadow receiveShadow>
        <boxGeometry args={[2, 3, 0.3]} />
        <meshToonMaterial color="#4a3220" />
      </mesh>
      <mesh position={[dx, dy + 1.5, dz - 0.2]} castShadow>
        <boxGeometry args={[2.2, 3.2, 0.1]} />
        <meshToonMaterial color={DUNGEON_PALETTE.wall} />
      </mesh>
    </group>
  );
}

/** Registers the interact prompt for a dungeon door while the player is within
 *  `radius` (horizontal). Writes only on change and self-heals if a frame of
 *  InteractionManager clears it. */
function DungeonDoorZone({ position, label, radius = 2 }: { position: [number, number, number]; label: string; radius?: number }) {
  useFrame(() => {
    const st = useGameStore.getState();
    const p = st.player.position;
    const dx = p[0] - position[0];
    const dz = p[2] - position[2];
    const inRange = dx * dx + dz * dz <= radius * radius;
    const cur = st.ui.interactPrompt;
    if (inRange) {
      if (cur !== label) {
        useGameStore.setState((s) => ({ ui: { ...s.ui, interactPrompt: label } }));
      }
    } else if (cur === label) {
      useGameStore.setState((s) => ({ ui: { ...s.ui, interactPrompt: null } }));
    }
  });
  return null;
}

/** Room-crossing checkpoint. Entering room N (or the bossroom) updates
 *  dungeonCheckpointRoom + dungeonRoom once per entry (local lastRoom ref,
 *  reset when the player is between rooms / out of the dungeon). */
function DungeonRoomTracker() {
  const lastRoomRef = useRef(0);
  useFrame(() => {
    const t = readPlayerBody();
    if (!t) return;
    const lx = t.x - DUNGEON_ORIGIN[0];
    const lz = t.z - DUNGEON_ORIGIN[2];
    let room = 0;
    const hw = DUNGEON_ROOM_SIZE[0] / 2;
    const hd = DUNGEON_ROOM_SIZE[1] / 2;
    for (let n = 1; n <= DUNGEON_ROOM_COUNT; n++) {
      if (Math.abs(lx - DUNGEON_ROOM_CENTER_X(n)) <= hw && Math.abs(lz) <= hd) {
        room = n;
        break;
      }
    }
    if (room === 0) {
      const bhw = DUNGEON_BOSSROOM_SIZE[0] / 2;
      const bhd = DUNGEON_BOSSROOM_SIZE[1] / 2;
      if (Math.abs(lx - DUNGEON_BOSSROOM_CENTER_X) <= bhw && Math.abs(lz) <= bhd) {
        room = DUNGEON_BOSSROOM_INDEX + 1;
      }
    }
    if (room === 0) {
      // Outside every room (or back in the world) — re-arm for the next entry.
      lastRoomRef.current = 0;
      return;
    }
    if (room === lastRoomRef.current) return;
    lastRoomRef.current = room;
    const st = useGameStore.getState();
    st.setDungeonCheckpoint(room);
    st.setDungeonRoom(room);
  });
  return null;
}

/** ── Outdoor house (P2.3): four walls + separate sloped roof with overhang,
 *    door opening, two windows, entrance path. Wall and roof are separate
 *    geometry groups with distinct materials. NOT a single cuboid. ── */
function VillageHouse({
  position,
  wallColor = '#b45309',
  scale = 1,
}: {
  position: [number, number, number];
  wallColor?: string;
  scale?: number;
}) {
  const W = 3 * scale;   // width (x)
  const D = 3 * scale;   // depth (z)
  const H = 2.8 * scale; // wall height
  const T = 0.15;        // wall thickness
  const DOOR_W = 0.9 * scale;
  const doorOffset = W / 2 - DOOR_W / 2; // door on the +z wall, off-centre
  return (
    <group position={position}>
      {/* Entrance access path (ground-level, no collision) */}
      <mesh position={[0, 0.011, D / 2 + 0.9]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[1.4 * scale, 1.8 * scale]} />
        <meshToonMaterial color="#a3a37a" />
      </mesh>
      {/* Four walls — front wall built from segments so the door opening is real */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[W / 2, H / 2, T / 2]} position={[0, H / 2, -D / 2]} />
        <CuboidCollider args={[T / 2, H / 2, D / 2]} position={[-W / 2, H / 2, 0]} />
        <CuboidCollider args={[T / 2, H / 2, D / 2]} position={[W / 2, H / 2, 0]} />
        {/* Front (+z): two segments around the door gap + header above the door */}
        <CuboidCollider args={[doorOffset / 2, H / 2, T / 2]} position={[-(W / 2 - doorOffset / 2), H / 2, D / 2]} />
        <CuboidCollider args={[doorOffset / 2, H / 2, T / 2]} position={[W / 2 - doorOffset / 2, H / 2, D / 2]} />
        <CuboidCollider args={[DOOR_W, (H - 1.9 * scale) / 2, T / 2]} position={[doorOffset, 1.9 * scale + (H - 1.9 * scale) / 2, D / 2]} />
      </RigidBody>
      <group>
        <mesh position={[0, H / 2, -D / 2]} castShadow receiveShadow>
          <boxGeometry args={[W, H, T]} />
          <meshToonMaterial color={wallColor} />
        </mesh>
        <mesh position={[-W / 2, H / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[T, H, D]} />
          <meshToonMaterial color={wallColor} />
        </mesh>
        <mesh position={[W / 2, H / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[T, H, D]} />
          <meshToonMaterial color={wallColor} />
        </mesh>
        {/* Front wall segments + door header */}
        <mesh position={[-(W / 2 - doorOffset / 2), H / 2, D / 2]} castShadow receiveShadow>
          <boxGeometry args={[doorOffset, H, T]} />
          <meshToonMaterial color={wallColor} />
        </mesh>
        <mesh position={[W / 2 - doorOffset / 2, H / 2, D / 2]} castShadow receiveShadow>
          <boxGeometry args={[doorOffset, H, T]} />
          <meshToonMaterial color={wallColor} />
        </mesh>
        <mesh position={[doorOffset, 1.9 * scale + (H - 1.9 * scale) / 2, D / 2]} castShadow receiveShadow>
          <boxGeometry args={[DOOR_W, H - 1.9 * scale, T]} />
          <meshToonMaterial color={wallColor} />
        </mesh>
        {/* Two windows (front + side), slightly inset frames — separate material */}
        <mesh position={[-W / 4, H * 0.62, D / 2 + 0.01]} castShadow>
          <boxGeometry args={[0.5 * scale, 0.5 * scale, 0.05]} />
          <meshToonMaterial color="#1e293b" emissive="#38bdf8" emissiveIntensity={0.35} />
        </mesh>
        <mesh position={[W / 2 + 0.01, H * 0.62, -D / 4]} castShadow>
          <boxGeometry args={[0.05, 0.5 * scale, 0.5 * scale]} />
          <meshToonMaterial color="#1e293b" emissive="#38bdf8" emissiveIntensity={0.35} />
        </mesh>
      </group>
      {/* Separate sloped roof with visible overhang (4-sided pyramid)
          — its own geometry group + material, extending past the walls. */}
      <group>
        <mesh position={[0, H + 0.55 * scale, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[W * 0.95, 1.1 * scale, 4]} />
          <meshToonMaterial color="#7f1d1d" />
        </mesh>
      </group>
    </group>
  );
}

/** House interior door sensor: when the player steps into the entrance zone,
 *  triggers the exterior→interior transition (one-shot until they leave). */
function HouseDoorSensor({
  doorPos,
  interiorId,
  radius = 1.6,
}: {
  doorPos: [number, number, number];
  interiorId: string;
  radius?: number;
}) {
  const armedRef = useRef(true);
  useFrame(() => {
    const t = readPlayerBody();
    if (!t) return;
    const dx = t.x - doorPos[0];
    const dz = t.z - doorPos[2];
    const inside = dx * dx + dz * dz <= radius * radius;
    const s = useGameStore.getState();
    if (inside && armedRef.current && !s.houseInterior && !s.activeDialogue && s.gamePhase === 'playing') {
      armedRef.current = false;
      s.enterHouseInterior(interiorId);
    } else if (!inside && !armedRef.current) {
      armedRef.current = true;
    }
  });
  return null;
}

/** Interior exit zone: stepping into it returns to the exterior world. */
function ExitDoorZone({ exitPos, radius = 1.2 }: { exitPos: [number, number, number]; radius?: number }) {
  const armedRef = useRef(true);
  useFrame(() => {
    const t = readPlayerBody();
    if (!t) return;
    const dx = t.x - exitPos[0];
    const dz = t.z - exitPos[2];
    const inside = dx * dx + dz * dz <= radius * radius;
    const s = useGameStore.getState();
    if (inside && armedRef.current && s.houseInterior) {
      armedRef.current = false;
      s.exitHouseInterior();
    } else if (!inside && !armedRef.current) {
      armedRef.current = true;
    }
  });
  return null;
}

/** Exterior→interior transition: teleports the player body to the interior
 *  spawn point once per armed press. */
function InteriorTeleporter({ target }: { target: [number, number, number] }) {
  const prevInteriorRef = useRef<string | null>(null);
  useFrame(() => {
    const s = useGameStore.getState();
    if (prevInteriorRef.current === null && s.houseInterior !== null) {
      teleportPlayerBody(target);
    }
    prevInteriorRef.current = s.houseInterior;
  });
  return null;
}


/** P0 lifecycle-safe read of the shared player rigid body. A destroyed Rapier
 *  body throws from Rust; when that happens we clear the stale ref so it can
 *  never be read again, and report the body as unavailable this frame. */
function readPlayerBody(): { x: number; y: number; z: number } | null {
  const body = playerRigidBodyRef.current;
  if (!body) return null;
  try {
    return body.translation();
  } catch {
    // Body was destroyed between mount and this frame — drop the stale ref.
    playerRigidBodyRef.current = null;
    return null;
  }
}

/** P0 lifecycle-safe WRITE to the shared player rigid body (same contract as
 *  readPlayerBody): existence check first, and if the underlying Rapier body
 *  was destroyed before the call, the throw is absorbed only to drop the
 *  stale ref so it can never be read or written again. */
function teleportPlayerBody(target: [number, number, number]): void {
  const body = playerRigidBodyRef.current;
  if (!body) return;
  try {
    body.setTranslation({ x: target[0], y: target[1], z: target[2] }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  } catch {
    // Body was destroyed between the ref check and the call — drop the stale
    // ref instead of surfacing a Rust null-pointer error.
    playerRigidBodyRef.current = null;
  }
}

/** Arrow Bundle world pickup (M1W2D6 #5): spawns one bundle into the loot
 *  system per session while the crossbow exists in the world economy. Uses
 *  the existing loot-drop collection path — no second pickup system. */
function ArrowBundlePickup({ position }: { position: [number, number, number] }) {
  const spawnRef = useRef(false);
  useFrame(() => {
    const s = useGameStore.getState();
    if (spawnRef.current) return;
    if (s.gamePhase === 'playing') {
      spawnRef.current = true;
      s.addLootDrop({
        name: 'Arrow Bundle',
        type: 'material',
        x: position[0],
        y: position[1] + 0.5,
        z: position[2],
        amount: 1,
        color: '#d6b370',
      });
    }
  }  );
  return null;
}

/** M2D2 #1 — the single edge house: floor, north/east/west walls, a south wall
 *  with a doorway gap, a ceiling, one bed and a door threshold marker.
 *  Interior geometry only; minimal materials reuse the village palette. Its
 *  world position comes from Player.tsx (which owns the bed interaction), so
 *  the mesh and the sleep trigger can never drift apart. */
function EdgeHouse() {
  const wallColor = '#a16207';
  const half = 3;
  return (
    <group position={HOUSE_POSITION}>
      {/* Floor: collider slab + surface (lifted 1 cm to avoid z-fighting). */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[half, 0.5, half]} position={[0, -0.5, 0]} />
      </RigidBody>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[half * 2, half * 2]} />
        <meshToonMaterial color="#8a6b4a" />
      </mesh>
      {/* Ceiling (visual only — the player cannot jump out of the room). */}
      <mesh position={[0, 3, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[half * 2, half * 2]} />
        <meshToonMaterial color="#5a3d22" side={THREE.DoubleSide} />
      </mesh>
      {/* Solid north / east / west walls (one collider slab per wall). */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[half, 1.5, 0.1]} position={[0, 1.5, -half]} />
        <CuboidCollider args={[0.1, 1.5, half]} position={[-half, 1.5, 0]} />
        <CuboidCollider args={[0.1, 1.5, half]} position={[half, 1.5, 0]} />
      </RigidBody>
      {([
        [[0, 1.5, -half], [half * 2, 3, 0.2]],
        [[-half, 1.5, 0], [0.2, 3, half * 2]],
        [[half, 1.5, 0], [0.2, 3, half * 2]],
      ] as const).map(([pos, size], i) => (
        <mesh
          key={`edge-wall-${i}`}
          position={pos as unknown as [number, number, number]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={size as unknown as [number, number, number]} />
          <meshToonMaterial color={wallColor} />
        </mesh>
      ))}
      {/* South wall split around a 1.4 m doorway gap. */}
      {([
        [[-1.85, 1.5, half], [2.3, 3, 0.2]],
        [[1.85, 1.5, half], [2.3, 3, 0.2]],
      ] as const).map(([pos, size], i) => (
        <RigidBody key={`edge-south-wall-${i}`} type="fixed">
          <mesh
            position={pos as unknown as [number, number, number]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={size as unknown as [number, number, number]} />
            <meshToonMaterial color={wallColor} />
          </mesh>
        </RigidBody>
      ))}
      {/* Door threshold marker. */}
      <mesh position={[0, 0.02, half]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.4, 0.5]} />
        <meshToonMaterial color="#4a3220" />
      </mesh>
      {/* The only furniture: one bed, at the absolute BED_POSITION. */}
      <group position={[BED_POSITION[0] - HOUSE_POSITION[0], 0, BED_POSITION[2] - HOUSE_POSITION[2]]}>
        <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.1, 0.5, 2]} />
          <meshToonMaterial color="#5a3d22" />
        </mesh>
        <mesh position={[0, 0.58, 0]} castShadow>
          <boxGeometry args={[1, 0.16, 1.8]} />
          <meshToonMaterial color="#9ca3af" />
        </mesh>
        <mesh position={[0, 0.7, -0.7]} castShadow>
          <boxGeometry args={[0.7, 0.14, 0.4]} />
          <meshToonMaterial color="#e5e7eb" />
        </mesh>
      </group>
    </group>
  );
}

/** M2D2 #1 — mirrors the house footprint into player.inHouse. No lock, no
 *  collider change: enemies may enter (R7). Only writes on an edge so it never
 *  churns subscribers while the player stands still. */
function HouseOccupancyZone({
  center,
  halfX,
  halfZ,
}: {
  center: [number, number, number];
  halfX: number;
  halfZ: number;
}) {
  const wasInsideRef = useRef(false);
  useFrame(() => {
    const t = readPlayerBody();
    if (!t) return;
    const inside =
      Math.abs(t.x - center[0]) <= halfX && Math.abs(t.z - center[2]) <= halfZ;
    if (inside === wasInsideRef.current) return;
    wasInsideRef.current = inside;
    const s = useGameStore.getState();
    if (inside) s.enterHouse();
    else s.leaveHouse();
  });
  return null;
}

/** M2D2 #1 — world-drop meshes. Renders one 0.2 m cube RigidBody per drop that
 *  is within 30 m of the player AND inside the camera frustum. Rapier owns the
 *  simulation (gravity, plus the collider mass set from the item's weightGrams);
 *  the store owns the authoritative list. Drops outside the render window are
 *  simply not mounted, so a reload re-mounts them lazily when they enter view. */
function WorldDropMeshes() {
  const worldDrops = useGameStore((s) => s.player.worldDrops);
  const { camera } = useThree();
  // Ids currently in the render window. Held in a ref too so the per-frame
  // frustum test only calls setState when membership actually changes — no
  // per-frame re-render, no per-frame allocation (scratch objects are reused).
  const visibleRef = useRef<string[]>([]);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const frustumRef = useRef(new THREE.Frustum());
  const projScreenRef = useRef(new THREE.Matrix4());
  const scratchRef = useRef(new THREE.Vector3());

  useFrame(() => {
    // Read the player position off the store instead of subscribing: it is
    // rewritten every frame, and a subscription would re-render this component
    // on every frame.
    const [px, py, pz] = useGameStore.getState().player.position;
    camera.updateMatrixWorld();
    frustumRef.current.setFromProjectionMatrix(
      projScreenRef.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const frustum = frustumRef.current;
    const scratch = scratchRef.current;
    const next: string[] = [];
    for (const d of worldDrops) {
      const dx = d.position[0] - px;
      const dy = d.position[1] - py;
      const dz = d.position[2] - pz;
      if (dx * dx + dy * dy + dz * dz > 30 * 30) continue;
      scratch.set(d.position[0], d.position[1], d.position[2]);
      if (frustum.containsPoint(scratch)) next.push(d.id);
    }
    const prev = visibleRef.current;
    if (next.length !== prev.length || next.some((id, i) => id !== prev[i])) {
      visibleRef.current = next;
      setVisibleIds(next);
    }
  });

  if (visibleIds.length === 0) return null;
  return (
    <group>
      {visibleIds.map((id) => {
        const drop = worldDrops.find((d) => d.id === id);
        if (!drop) return null;
        const mass = Math.max(1, getItem(drop.itemId)?.weightGrams ?? 1);
        return (
          <RigidBody
            key={drop.id}
            colliders={false}
            position={drop.position}
            linearDamping={0.2}
            angularDamping={0.4}
          >
            <CuboidCollider args={[0.1, 0.1, 0.1]} mass={mass} />
            <mesh castShadow>
              <boxGeometry args={[0.2, 0.2, 0.2]} />
              <meshToonMaterial color="#d9a441" />
            </mesh>
          </RigidBody>
        );
      })}
    </group>
  );
}

/** Simple tree component */
function Tree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <RigidBody type="fixed">
      <group position={position} scale={[scale, scale, scale]}>
        <mesh position={[0, 1.2, 0]} castShadow>
          <coneGeometry args={[0.8, 2.5, 8]} />
          <meshToonMaterial color="#166534" />
        </mesh>
        <mesh position={[0, 0.3, 0]} castShadow>
          <cylinderGeometry args={[0.15, 0.2, 0.6, 6]} />
          <meshToonMaterial color="#78350f" />
        </mesh>
      </group>
    </RigidBody>
  );
}

/** Simple rock component */
function Rock({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <RigidBody type="fixed">
      <mesh position={position} castShadow scale={[scale, scale, scale]}>
        <dodecahedronGeometry args={[0.6, 0]} />
        <meshToonMaterial color="#6b7280" />
      </mesh>
    </RigidBody>
  );
}

/** Dead tree for wilderness */
function DeadTree({ position }: { position: [number, number, number] }) {
  return (
    <RigidBody type="fixed">
      <group position={position}>
        <mesh position={[0, 0.8, 0]} rotation={[0, 0, 0.15]} castShadow>
          <cylinderGeometry args={[0.08, 0.15, 1.6, 6]} />
          <meshToonMaterial color="#451a03" />
        </mesh>
        <mesh position={[0.3, 1.2, 0]} rotation={[0, 0, -0.4]} castShadow>
          <cylinderGeometry args={[0.04, 0.06, 0.8, 5]} />
          <meshToonMaterial color="#451a03" />
        </mesh>
        <mesh position={[-0.2, 1.4, 0.1]} rotation={[0, 0, 0.3]} castShadow>
          <cylinderGeometry args={[0.03, 0.05, 0.6, 5]} />
          <meshToonMaterial color="#451a03" />
        </mesh>
      </group>
    </RigidBody>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
 * M1W3D6 #1 E2 — DAY CYCLE + ZONE MOOD
 *
 * One real minute = one in-game hour, and the world day is 30 in-game hours,
 * so a full cycle is 30 real minutes. The ONLY time-of-day source is the day
 * progress ref inside <DayNightCycle> (0..1); the sun, the ambient intensity
 * and the fog all derive from it. There is no second "current hour" anywhere,
 * and none of this is persisted (it dies with the scene on New Game / load).
 * ══════════════════════════════════════════════════════════════════════════ */
const DAY_CYCLE_SECONDS = 30 * 60;
const DAY_IN_GAME_HOURS = 30;
/** Progress 0 is dawn — in-game hour 6. */
const DAY_START_HOUR = 6;

/** The existing directional light's baseline. The sun's per-frame position is
 *  this vector rotated about the X axis; the baseline itself is never
 *  re-authored, so Y / Z stay exactly as authored. */
const SUN_BASE_X = 10;
const SUN_BASE_Y = 20;
const SUN_BASE_Z = 10;
/** Baseline angle in the YZ plane (from +Y toward +Z); the rotation is offset
 *  by it so the horizon crossings land on the authored day/night bands. */
const SUN_PHI0 = Math.atan2(SUN_BASE_Z, SUN_BASE_Y);

/** Module scratch — the sun position is written into these, never allocated. */
const _sunPos = new THREE.Vector3();
const _sunAxisX = new THREE.Vector3(1, 0, 0);

/** Ambient intensity for an in-game hour (the E2 anchor table). */
function ambientAtHour(hour: number): number {
  if (hour < 6) return 0.10;                                    // 0–6   night
  if (hour < 8) return 0.30 + ((hour - 6) / 2) * 0.25;          // 6–8   dawn  0.30 → 0.55
  if (hour < 18) return 0.55 + ((hour - 8) / 10) * 0.20;        // 8–18  day   0.55 → 0.75
  if (hour < 20) return 0.55 - ((hour - 18) / 2) * 0.25;        // 18–20 dusk  0.55 → 0.30
  return 0.30 - ((hour - 20) / 10) * 0.20;                      // 20–30 night 0.30 → 0.10
}

/** X-axis rotation to apply to the sun baseline. The sun is above the horizon
 *  for in-game hours 6–20 (14 hours) and below it for the remaining 16 hours,
 *  matching the ambient bands. Continuous and monotonic across midnight. */
function sunRotationAtHour(hour: number): number {
  if (hour >= 6 && hour < 20) return -Math.PI / 2 + (Math.PI * (hour - 6)) / 14 - SUN_PHI0;
  const nightHour = hour < 6 ? hour + DAY_IN_GAME_HOURS : hour; // 20 → 36
  return Math.PI / 2 + (Math.PI * (nightHour - 20)) / 16 - SUN_PHI0;
}

/** Night band for the fog fade — the two bands whose ambient anchor is 0.10. */
function isNightHour(hour: number): boolean {
  return hour < 6 || hour >= 20;
}

/** Zone mood presets. Zone is a READ of authored world data — nothing here
 *  writes zone state. Dangerous Territory = the encounter arena's authored
 *  extents (lib/encounterConfig); Village Haven vs the unnamed wilderness is
 *  the nearest authored named landmark (lib/minimap LANDMARKS). No new zone
 *  bounds are invented. */
type ZoneId = 'village' | 'dangerous' | 'wilderness';

const FOG_BASE_DENSITY = 0.015;
const FOG_ZONE_DENSITY: Record<ZoneId, number> = { village: 0.85, dangerous: 1.25, wilderness: 1.10 };
const FOG_ZONE_COLOR: Record<ZoneId, number> = { village: 0xc9a47a, dangerous: 0x4a4a44, wilderness: 0x35383a };
const FOG_NIGHT_COLOR_SCALE = 0.5;
const FOG_NIGHT_DENSITY_SCALE = 1.2;

/** Allocation-free zone lookup for a world XZ position. */
function zoneAt(x: number, z: number): ZoneId {
  const halfW = ENCOUNTER_CONFIG.floorWidth * 0.5;
  const halfD = ENCOUNTER_CONFIG.floorDepth * 0.5;
  if (
    Math.abs(x - ENCOUNTER_CONFIG.centerX) <= halfW &&
    Math.abs(z - ENCOUNTER_CONFIG.centerZ) <= halfD
  ) {
    return 'dangerous';
  }
  let nearestId = '';
  let nearestDistSq = Infinity;
  for (const lm of LANDMARKS) {
    const dx = lm.x - x;
    const dz = lm.z - z;
    const d = dx * dx + dz * dz;
    if (d < nearestDistSq) {
      nearestDistSq = d;
      nearestId = lm.id;
    }
  }
  return nearestId === 'cp_village' ? 'village' : 'wilderness';
}

/* ── M1W3D6 #2 F4 — SKY + CLEAR COLOUR FOLLOW THE DAY CYCLE (E4 §8) ────────
 *  E4 §8's 96×96 two-tone gradient and star-field textures do not exist yet and
 *  this session does not author textures, so the sky is split by what can be
 *  hit exactly today:
 *    - the horizon tone is carried exactly by the scene clear colour, which is
 *      what §8 says the clear colour is for (no hard line against the fog);
 *    - the zenith side is approximated through the drei <Sky> scattering
 *      parameters, the only band-aware control the component exposes.
 *  Nothing here invents a time source: `hour` comes from DayNightCycle.
 *  Band boundaries are E2's ambient-table boundaries. */
type SkyBand = 'dawn' | 'day' | 'dusk' | 'night';

/** E4 §8 horizon tone per band — drives the scene clear colour. */
const SKY_HORIZON: Record<SkyBand, number> = {
  dawn: 0xc9a47a,
  day: 0xa8a08a,
  dusk: 0xc9a47a,
  night: 0x1a1f2a,
};

/** drei <Sky> scattering parameters per band — the §8 zenith tones approximated.
 *  dawn and dusk share one pair, as §8 shares #5A4A55 between them. */
const SKY_SCATTER: Record<
  SkyBand,
  { turbidity: number; rayleigh: number; mieCoefficient: number; mieDirectionalG: number }
> = {
  dawn: { turbidity: 6, rayleigh: 2.6, mieCoefficient: 0.006, mieDirectionalG: 0.86 },
  day: { turbidity: 3, rayleigh: 1.4, mieCoefficient: 0.005, mieDirectionalG: 0.8 },
  dusk: { turbidity: 6, rayleigh: 2.6, mieCoefficient: 0.006, mieDirectionalG: 0.86 },
  night: { turbidity: 10, rayleigh: 0.4, mieCoefficient: 0.004, mieDirectionalG: 0.9 },
};

/** Band for an in-game hour — the same boundaries as E2's ambient table. */
function skyBandAtHour(hour: number): SkyBand {
  if (hour >= 6 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 18) return 'day';
  if (hour >= 18 && hour < 20) return 'dusk';
  return 'night';
}

/** The mounted drei <Sky> mesh's shader uniforms, structurally typed so this
 *  file needs no direct three-stdlib import (drei's Sky is a three-stdlib Sky,
 *  a Mesh whose ShaderMaterial carries these six uniforms). */
type SkyUniforms = {
  sunPosition: { value: THREE.Vector3 };
  turbidity: { value: number };
  rayleigh: { value: number };
  mieCoefficient: { value: number };
  mieDirectionalG: { value: number };
};

/** Uniforms of the mounted drei <Sky>, or null before it mounts. */
function skyUniforms(mesh: THREE.Mesh | null): SkyUniforms | null {
  if (!mesh) return null;
  return (mesh.material as THREE.ShaderMaterial).uniforms as unknown as SkyUniforms;
}

/**
 * E2 driver. Renders nothing; per frame it advances the day progress and
 * writes (a) the ambient light intensity, (b) the existing directional
 * light's position (the baseline rotated about X), (c) the single scene fog
 * object's colour + density and (d) — F4 — the sky's uniforms and the clear
 * colour. No per-frame allocation.
 */
function DayNightCycle({
  sunRef,
  ambientRef,
  skyRef,
}: {
  sunRef: RefObject<THREE.DirectionalLight | null>;
  ambientRef: RefObject<THREE.AmbientLight | null>;
  skyRef: RefObject<THREE.Mesh | null>;
}) {
  const scene = useThree((s) => s.scene);
  // The single time-of-day value. Mount == New Game / load-from-save (the menu
  // and loading phases render their own screens instead of GameScene), and it
  // is not remounted by interior transitions, death or respawn — so time
  // resets exactly where the spec asks and nowhere else.
  const progressRef = useRef(0);
  // The single fog object for this scene: created once, attached once,
  // detached on unmount. Never re-created per frame.
  const fogRef = useRef<THREE.FogExp2 | null>(null);
  if (fogRef.current === null) fogRef.current = new THREE.FogExp2(0x000000, 0);

  // M1W4D1 #1 — E4 v2b zone post-process intensity. The tick rides this
  // component's existing per-frame useFrame (no second useFrame): it already
  // reads the authoritative player position and the zoneAt resolver for fog.
  const currentZoneRef = useRef<ZoneId | ''>('');
  const zoneFromRef = useRef(ZONE_POSTFX_INTENSITY.village);
  const zoneTargetRef = useRef(ZONE_POSTFX_INTENSITY.village);
  const zoneIntensityRef = useRef(ZONE_POSTFX_INTENSITY.village);
  const zoneTransitionStartRef = useRef(0);

  useEffect(() => {
    const fog = fogRef.current;
    if (!fog) return;
    scene.fog = fog;
    return () => {
      if (scene.fog === fog) scene.fog = null;
    };
  }, [scene]);

  // Modal / death / interior suppression. Some of these pause the render loop
  // (settings, inventory, HUD editor set frameloop 'never'), so the frame loop
  // alone cannot do the zeroing — mirror the flag into an effect as well.
  const fogSuppressed = useGameStore(
    (s) =>
      s.ui.showSettings ||
      s.ui.showInventory ||
      s.ui.showQuestLog ||
      s.ui.mapOpen ||
      s.ui.showShop ||
      s.ui.deathOverlay ||
      s.hudEditMode ||
      s.activeDialogue !== null ||
      s.houseInterior !== null,
  );
  useEffect(() => {
    if (fogSuppressed && fogRef.current) fogRef.current.density = 0;
  }, [fogSuppressed]);

  useFrame((_state, delta) => {
    progressRef.current = (progressRef.current + delta / DAY_CYCLE_SECONDS) % 1;
    const hour = (DAY_START_HOUR + progressRef.current * DAY_IN_GAME_HOURS) % DAY_IN_GAME_HOURS;
    const night = isNightHour(hour);

    // Ambient: the only light-intensity write of the cycle.
    if (ambientRef.current) ambientRef.current.intensity = ambientAtHour(hour);

    // Sun: rotate the existing baseline about the X axis. Colour, intensity and
    // the whole shadow configuration (map size, bias, camera bounds) are
    // untouched, as is the light's JSX baseline.
    if (sunRef.current) {
      _sunPos
        .set(SUN_BASE_X, SUN_BASE_Y, SUN_BASE_Z)
        .applyAxisAngle(_sunAxisX, sunRotationAtHour(hour));
      sunRef.current.position.copy(_sunPos);
    }

    // F4 — sky + clear colour read the same `hour` and the same rotated sun
    // vector as the block above: no second time source, no allocation. This
    // runs before the fog-suppression return below, so the sky keeps moving
    // while a modal pauses the rest of the frame.
    const band = skyBandAtHour(hour);
    const skyU = skyUniforms(skyRef.current);
    if (skyU) {
      // The Sky's disc tracks the directional light: the very vector the sun
      // block just rotated, copied into the uniform's existing Vector3.
      skyU.sunPosition.value.copy(_sunPos);
      const sc = SKY_SCATTER[band];
      skyU.turbidity.value = sc.turbidity;
      skyU.rayleigh.value = sc.rayleigh;
      skyU.mieCoefficient.value = sc.mieCoefficient;
      skyU.mieDirectionalG.value = sc.mieDirectionalG;
    }
    // Clear colour = the band's horizon tone, written in place into the Color
    // that <color attach="background" /> created on this scene.
    const bg = scene.background;
    if (bg instanceof THREE.Color) bg.setHex(SKY_HORIZON[band]);

    const fog = fogRef.current;
    if (!fog) return;
    if (fogSuppressed) {
      fog.density = 0; // interiors, menus, modals and the death overlay are fog-free
      return;
    }

    // Zone mood: one Color write + one density write, from the authoritative
    // player position (read-only) and the derived zone.
    const pos = useGameStore.getState().player.position;
    const zone = zoneAt(pos[0], pos[2]);
    fog.color.setHex(FOG_ZONE_COLOR[zone]);
    if (night) fog.color.multiplyScalar(FOG_NIGHT_COLOR_SCALE);
    fog.density = FOG_BASE_DENSITY * FOG_ZONE_DENSITY[zone] * (night ? FOG_NIGHT_DENSITY_SCALE : 1);

    // M1W4D1 #1 — E4 v2b zone post-process intensity. The first frame snaps to
    // the starting zone; later zone changes interpolate over
    // ZONE_POSTFX_TRANSITION_MS. Every write targets an existing field — no
    // Color / Vector2 / array allocation per frame.
    const now = performance.now();
    if (currentZoneRef.current === '') {
      currentZoneRef.current = zone;
      zoneFromRef.current = ZONE_POSTFX_INTENSITY[zone];
      zoneTargetRef.current = ZONE_POSTFX_INTENSITY[zone];
      zoneTransitionStartRef.current = now;
    } else if (zone !== currentZoneRef.current) {
      currentZoneRef.current = zone;
      zoneFromRef.current = zoneIntensityRef.current;
      zoneTargetRef.current = ZONE_POSTFX_INTENSITY[zone];
      zoneTransitionStartRef.current = now;
    }
    const t = Math.min(1, (now - zoneTransitionStartRef.current) / ZONE_POSTFX_TRANSITION_MS);
    const intensity = zoneFromRef.current + (zoneTargetRef.current - zoneFromRef.current) * t;
    zoneIntensityRef.current = intensity;
    const stack = horrorStack;
    if (stack) {
      const wilderness = zone === 'wilderness';
      stack.vignette.darkness =
        HORROR_VIGNETTE_DARKNESS * intensity
        + (wilderness ? HORROR_WILDERNESS_DARKNESS_BOOST * intensity : 0);
      stack.hueSat.saturation =
        HORROR_SATURATION * intensity
        - (wilderness ? HORROR_WILDERNESS_SATURATION_BOOST * intensity : 0);
      stack.noise.blendMode.opacity.value = HORROR_NOISE_OPACITY * intensity;
      const chromaOffset = HORROR_CHROMA_OFFSET * intensity;
      stack.chroma.offset.set(chromaOffset, chromaOffset);
    }
  });

  return null;
}

/* ── M1W3D6 #2 F7 — POST-PROCESSING PIPELINE (E4 §6) ───────────────────────
 *  Chain: RenderPass → Bloom → Outline → the E4 v2b horror stack (vignette,
 *  hue/saturation, noise, chromatic aberration). The half-resolution
 *  buffer is the primary pixelated reading; the screen-space pixelation effect
 *  was removed in E4 v2b. Bloom is threshold 0.85, intensity 0.3, radius 0.6,
 *  mipmap blur, in its OWN pass. The cel shader and the outline are F8.
 *
 *  The library is driven directly rather than through
 *  @react-three/postprocessing: that wrapper declares `postprocessing` as a
 *  *peer* dependency and this workspace sets autoInstallPeers:false, so using
 *  it would have meant two entries in package.json, and it also carries a hard
 *  dependency on n8ao — an SSAO implementation, which §6 forbids outright.
 *
 *  Rendering is taken over from R3F (useFrame priority 1): the composer owns
 *  the frame while the Canvas keeps owning the loop, so the modal-driven
 *  frameloop='never' pauses this with everything else. The composer reads the
 *  scene and writes no game state; it mounts, re-sizes and disposes with
 *  GameScene.
 */

/* ── M1W4D1 #1 — QUALITY + FPS SETTINGS ─────────────────────────────────────
 *  Quality replaces the §6a min(0.5, 1280 / width) art cap: each label maps to
 *  a target internal render resolution, and the composer's buffers are sized to
 *  that target height (never exceeding the device resolution). FPS caps how
 *  often the composer renders — gameplay, physics and input are untouched. */
const QUALITY_PRESETS: Record<string, { width: number; height: number }> = {
  '144p': { width: 256, height: 144 },
  'LD': { width: 640, height: 360 },
  'LD+': { width: 720, height: 400 },
  'SD': { width: 854, height: 480 },
  'SD+': { width: 960, height: 540 },
  'HD': { width: 1280, height: 720 },
  'HD+': { width: 1600, height: 900 },
  'FHD': { width: 1920, height: 1080 },
  'FHD+': { width: 2560, height: 1080 },
  'QHD': { width: 2560, height: 1440 },
};
const DEFAULT_QUALITY = 'HD';
const DEFAULT_FPS = 60;
/** §6b bloom. */
const POST_FX_BLOOM_THRESHOLD = 0.85;
const POST_FX_BLOOM_SMOOTHING = 0.2;
const POST_FX_BLOOM_INTENSITY = 0.3;
const POST_FX_BLOOM_RADIUS = 0.6;

/* ── M1W4D1 #1 — E4 v2b HORROR POST-PROCESSING STACK (E4 v2 §6) ─────────────
 *  One pass, four library effects, driven by zone intensity: Village Haven
 *  0.30×, Dangerous Territory 1.00×, unnamed wilderness 1.00× plus a darkness
 *  boost. A zone change interpolates over 3 s. No custom shader, and the
 *  per-frame tick writes only into the effects' existing numeric fields. */
const HORROR_VIGNETTE_OFFSET = 0.35;
const HORROR_VIGNETTE_DARKNESS = 0.65;
const HORROR_SATURATION = -0.35;
const HORROR_NOISE_OPACITY = 0.08;
const HORROR_CHROMA_OFFSET = 0.0008;
/** Wilderness-only boost applied on top of the 1.00× stack. */
const HORROR_WILDERNESS_DARKNESS_BOOST = 0.10;
const HORROR_WILDERNESS_SATURATION_BOOST = 0.05;
const ZONE_POSTFX_INTENSITY: Record<ZoneId, number> = { village: 0.30, dangerous: 1.00, wilderness: 1.00 };
const ZONE_POSTFX_TRANSITION_MS = 3000;

/** M1W4D1 #1 — the live horror effect instances. Written once on composer mount
 *  and read by DayNightCycle's single per-frame tick, so the zone intensity
 *  needs no second useFrame. */
interface HorrorStack {
  vignette: VignetteEffect;
  hueSat: HueSaturationEffect;
  noise: NoiseEffect;
  chroma: ChromaticAberrationEffect;
}
let horrorStack: HorrorStack | null = null;

/* ── M1W3D6 #2 F8b — OUTLINE (E4 §3) ───────────────────────────────────────
 *  The library's OutlineEffect has NO pixel-thickness option. Its edge detector
 *  (OutlineMaterial) samples the selection mask at ±1 texel of its own buffer
 *  — texelSize = 1 / resolution.width — and the compositing shader adds no
 *  offset of its own, so the outline is exactly ONE texel of that buffer wide.
 *  That buffer is the pass size times resolution.scale, and the composite maps
 *  it 1:1 onto the canvas, so one outline texel covers
 *      canvasDeviceWidth / resolution.width
 *        = canvasDeviceWidth / (canvasDeviceWidth * resolution.scale)
 *        = 1 / resolution.scale
 *  of the pass, i.e. 2 / resolution.scale device pixels for the half-res §6a
 *  pipeline this composer uses. §3's thickness therefore maps onto the
 *  library's own unit as resolution.scale = 2 / (thicknessPx * dpr).
 */
const OUTLINE_COLOR = 0x1a1410;
const OUTLINE_BASE_PX = 2;
const OUTLINE_REFERENCE_HEIGHT = 1080;
const OUTLINE_MIN_PX = 1;
const OUTLINE_MAX_PX = 3;

/** §3 thickness in CSS px for a viewport height: 2 px at 1080p, scaled with the
 *  viewport height and clamped to [1, 3] px. */
function outlineThicknessPx(viewportHeight: number): number {
  const scaled = (OUTLINE_BASE_PX * viewportHeight) / OUTLINE_REFERENCE_HEIGHT;
  return Math.min(OUTLINE_MAX_PX, Math.max(OUTLINE_MIN_PX, scaled));
}

/** §3 outline targets. The drei <Sky> is a ShaderMaterial backdrop rather than a
 *  shaded mesh, so this test excludes it by construction: outlining the sky would
 *  draw a frame around the viewport, and §6 forbids a vignette. */
function isOutlineTargetMaterial(material: THREE.Material): boolean {
  return !(material instanceof THREE.ShaderMaterial);
}

/**
 * F7 driver. Renders nothing; it owns the frame and composites it through the
 * §6 pipeline. Must live inside <Canvas> — it takes its renderer, scene, camera
 * and canvas size from the R3F state, which only exists there, and that is also
 * what bounds it to the Canvas's render loop (R3).
 */
function PostProcessing() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  // The effective pixel ratio, so a DPR change alone still re-sizes the buffers.
  const dpr = useThree((s) => s.viewport.dpr);

  // M1W4D1 #1 — Quality drives the composer's render scale. The canvas `dpr`
  // stays display density (R4); this replaces the §6a art cap with the selected
  // ladder rung and is applied to the composer's buffers only.
  const quality = useGameStore((s) => s.settings.quality);
  const targetResolution = QUALITY_PRESETS[quality] ?? QUALITY_PRESETS[DEFAULT_QUALITY];
  const resolutionScale = Math.min(
    1,
    targetResolution.height / Math.max(1, height * dpr),
  );
  // M1W4D1 #1 — FPS cap. Read reactively so a change re-registers the callback.
  const fpsSetting = useGameStore((s) => s.settings.fps);
  const lastRenderRef = useRef(0);

  const composerRef = useRef<EffectComposer | null>(null);
  // F8b: the outline effect, so the resize effect can re-derive its §3 thickness.
  const outlineRef = useRef<OutlineEffect | null>(null);

  useLayoutEffect(() => {
    // R3F's renderer clears itself each frame; constructing the composer
    // disables that globally, so remember the original value and restore it.
    const autoClear = gl.autoClear;
    const composer = new EffectComposer(gl, {
      // §6a already renders at half resolution — MSAA would have nothing to
      // smooth and costs bandwidth.
      multisampling: 0,
      // A bloom threshold is a linear-luminance cut; 8-bit buffers band it.
      frameBufferType: THREE.HalfFloatType,
    });
    // Pass 1 renders the scene, pass 2 blooms it, pass 3 outlines it, pass 4
    // applies the E4 v2b horror stack.
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(
      new EffectPass(
        camera,
        new BloomEffect({
          intensity: POST_FX_BLOOM_INTENSITY,
          luminanceThreshold: POST_FX_BLOOM_THRESHOLD,
          luminanceSmoothing: POST_FX_BLOOM_SMOOTHING,
          radius: POST_FX_BLOOM_RADIUS,
          mipmapBlur: true,
        }),
      ),
    );
    // Pass 4 (F8b, §3) — the outline runs LAST so it traces the already
    // composited, already pixelated frame. It needs its own pass for the same
    // reason the pixelation pass is separate: the library cannot merge a
    // convolution effect (bloom) with a non-convolution one.
    const outline = new OutlineEffect(scene, camera, {
      // The library documents ALPHA as the blend function to use for dark edges.
      blendFunction: BlendFunction.ALPHA,
      edgeStrength: 1,
      // §3 does not ask for edges that show through geometry.
      xRay: false,
      visibleEdgeColor: OUTLINE_COLOR,
      hiddenEdgeColor: OUTLINE_COLOR,
    });
    // §3 wants characters and weapons only. The scene graph carries no
    // character-vs-environment marker: no object userData, no THREE.Layers use
    // and no object names anywhere in src/, and the only discriminator is
    // rapier's <RigidBody type> prop, which is not readable from the mounted
    // graph. Registering one would mean editing every character component, which
    // this session must not do, so B2's documented fallback applies — outline
    // every shaded mesh and record the deviation. The traversal is mount-time
    // only; the selection layer is restored on unmount below.
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material;
      const shaded = Array.isArray(material)
        ? material.some(isOutlineTargetMaterial)
        : isOutlineTargetMaterial(material);
      if (shaded) outline.selection.add(mesh);
    });
    composer.addPass(new EffectPass(camera, outline));
    // Pass 4 (M1W4D1 #1, E4 v2b) — the horror stack: ONE pass, four library
    // effects, order Vignette → HueSaturation → Noise → ChromaticAberration.
    // Their numeric parameters are driven per zone by DayNightCycle's tick, so
    // the instances are published for that tick to reach them.
    const vignette = new VignetteEffect({
      offset: HORROR_VIGNETTE_OFFSET,
      darkness: HORROR_VIGNETTE_DARKNESS,
    });
    const hueSat = new HueSaturationEffect({ hue: 0, saturation: HORROR_SATURATION });
    const noise = new NoiseEffect({
      premultiply: true,
      blendFunction: BlendFunction.OVERLAY,
    });
    noise.blendMode.opacity.value = HORROR_NOISE_OPACITY;
    const chroma = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(HORROR_CHROMA_OFFSET, HORROR_CHROMA_OFFSET),
      radialModulation: true,
      modulationOffset: 0.15,
    });
    // FilmEffect does not exist in postprocessing@6.39.5 — skipped, no substitute.
    composer.addPass(new EffectPass(camera, vignette, hueSat, noise, chroma));
    horrorStack = { vignette, hueSat, noise, chroma };
    // postprocessing >= 6.36 keeps a main camera on the composer and forwards it
    // to every registered pass; the outline effect's internal depth and mask
    // passes need it for the near/far planes and the perspective define.
    composer.setMainCamera(camera);
    // §6a nearest-neighbour upscale on composite: the composer's two frame
    // buffers default to LinearFilter, which would smear the half-res blocks
    // when the final pass stretches them over the canvas. These two buffers are
    // the only filter hook the library exposes — bloom's internal mip chain
    // keeps the library's own filter. Set before first use, so the first GPU
    // upload already carries it; RenderTarget.setSize re-applies it on resize.
    for (const buffer of [composer.inputBuffer, composer.outputBuffer]) {
      buffer.texture.magFilter = THREE.NearestFilter;
    }
    composerRef.current = composer;
    outlineRef.current = outline;
    return () => {
      // Take the selection layer back off every mesh we tagged.
      outline.selection.clear();
      composer.dispose();
      composerRef.current = null;
      outlineRef.current = null;
      horrorStack = null;
      gl.autoClear = autoClear;
    };
  }, [gl, scene, camera]);

  useLayoutEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    // Size the composer's own render targets and passes to the art-direction
    // scale. EffectComposer.setSize is deliberately NOT used: it forwards to
    // gl.setSize and would resize the canvas itself — R4's "do not
    // double-apply" trap. This is the same work setSize does internally,
    // minus the renderer resize.
    // §3 thickness → the library's one-texel edge, re-derived per resize so the
    // outline tracks the viewport height. Set before the buffers are sized so
    // pass.setSize picks the new scale up in the same pass.
    const outline = outlineRef.current;
    if (outline) outline.resolution.scale = 2 / (outlineThicknessPx(height) * dpr);
    const ratio = dpr * resolutionScale;
    const bufferWidth = Math.max(1, Math.round(width * ratio));
    const bufferHeight = Math.max(1, Math.round(height * ratio));
    composer.inputBuffer.setSize(bufferWidth, bufferHeight);
    composer.outputBuffer.setSize(bufferWidth, bufferHeight);
    for (const pass of composer.passes) pass.setSize(bufferWidth, bufferHeight);
  }, [gl, width, height, dpr, resolutionScale]);

  // Priority 1 hands the frame to the composer and stops R3F from issuing its
  // own gl.render. It runs after every priority-0 subscriber, so the E2/F4 day
  // cycle has already written the lights, the sky and the clear colour.
  useFrame((_state, delta) => {
    const composer = composerRef.current;
    if (!composer) return;
    // M1W4D1 #1 — frame cap. Only the composer render is throttled; every
    // priority-0 subscriber (gameplay, physics, input) still runs at the full
    // tick rate, so the simulation is never frame-limited.
    if (fpsSetting !== 'unlimited') {
      const targetFps = typeof fpsSetting === 'number' && fpsSetting > 0 ? fpsSetting : DEFAULT_FPS;
      const minIntervalMs = 1000 / targetFps;
      const now = performance.now();
      if (now - lastRenderRef.current < minIntervalMs) return;
      lastRenderRef.current = now;
    }
    composer.render(delta);
  }, 1);

  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
 * M1W3D6 #2 E3 — WILDERNESS REDISTRIBUTION (fixed seed 42)
 *
 * Village Haven and the Dangerous Territory keep their authored dressing; the
 * unnamed wilderness between them was empty. These two lists scatter the
 * EXISTING prefabs (Tree, Rock) into open ground only. They are derived once at
 * import from a fixed seed, so the layout is identical on every reload — no
 * Math.random() at scene-build time. Nothing here runs per frame.
 * ══════════════════════════════════════════════════════════════════════════ */
const WILDERNESS_SEED = 42;

/** mulberry32 — tiny deterministic PRNG, no dependency. */
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Open ground = inside the playable bounds (walls at ±50) and clear of every
 *  named zone: Village Haven with its winding path, the Dangerous Territory
 *  band (enemy clusters), and the trial arena. E3 must not disturb the areas
 *  the named zones above already own. */
function isOpenWilderness(x: number, z: number): boolean {
  if (Math.abs(x) > 46 || Math.abs(z) > 46) return false;          // wall margin
  if (z >= -21 && Math.abs(x) <= 15) return false;                 // Village Haven + path
  if (z <= -21 && z >= -46 && Math.abs(x) <= 16) return false;     // Dangerous Territory
  if (x >= 21 && z <= -21) return false;                           // trial arena
  return true;
}

/** Deterministic scatter of `count` points across open wilderness ground. */
function scatterWilderness(seed: number, count: number): [number, number][] {
  const rnd = seededRng(seed);
  const out: [number, number][] = [];
  for (let attempt = 0; out.length < count && attempt < 6000; attempt++) {
    const x = Math.round(rnd() * 92 - 46);
    const z = Math.round(rnd() * 92 - 46);
    if (isOpenWilderness(x, z)) out.push([x, z]);
  }
  return out;
}

const WILDERNESS_TREES: [number, number][] = scatterWilderness(WILDERNESS_SEED, 40);
const WILDERNESS_ROCKS: [number, number][] = scatterWilderness(WILDERNESS_SEED + 1, 26);

/* ══════════════════════════════════════════════════════════════════════════
 * M1W3D6 #2 E3b — AMBIENT WILDLIFE
 *
 * Purely decorative: no collider, no damage, no dialogue, no interaction, no
 * store state and no save state. Two moods, both resolved through E2's single
 * zoneAt() resolver — warm and alive around Village Haven, sparse and wrong in
 * the Dangerous Territory and the unnamed wilderness.
 *
 * Placement is computed ONCE at import from mulberry32(1337): deterministic
 * across reloads, never per frame. One module-level instance array and one
 * useFrame that walks it in place — no allocation per frame, no per-instance
 * useFrame.
 * ══════════════════════════════════════════════════════════════════════════ */
const WILDLIFE_SEED = 1337;
/** R4 hard cap on the whole world; the per-zone caps sit with each placement. */
const WILDLIFE_MAX = 40;
/** Tree prefab: cone centred at y 1.2 with height 2.5, so the tip is at 2.45. */
const TREE_TOP_Y = 2.45;
/** Arena wall boxes are centred at wallHeight/2, so their top is wallHeight. */
const ARENA_WALL_TOP_Y = ENCOUNTER_CONFIG.wallHeight;
/** Arena floor box top is 0.03; sit just above it. */
const ARENA_GROUND_Y = 0.05;

/** Module scratch — the per-frame mover facing test allocates nothing. */
const _wildFwd = new THREE.Vector3();

type WildlifeKind = 'butterfly' | 'bird' | 'cat' | 'crow' | 'catThin' | 'mover' | 'rat';

interface WildlifeInstance {
  kind: WildlifeKind;
  /** Anchor the motion is relative to; authored once, never re-authored. */
  x: number;
  y: number;
  z: number;
  /** Motion phase offset (s) so instances never move in lockstep. */
  phase: number;
  /** Idle-action period (s); 0 when the kind has no idle action. */
  period: number;
  /** Butterfly: wander radius. Rat: hop length. Mover: drift radius. */
  amp: number;
  /** Lateral unit axis for the rat hop. */
  dx: number;
  dz: number;
  /** birds only: whether this bird tail-flicks at all (1-in-4). */
  flicks: boolean;
  /** movers only: retired for the session once the player looks at it. */
  used: boolean;
  /** movers only: 0..1 fade-out progress. */
  fade: number;
}

/** Deterministic pick of `n` distinct entries (import time only). */
function pickDistinct<T>(arr: readonly T[], n: number, rnd: () => number): T[] {
  const idx: number[] = [];
  for (let i = 0; i < arr.length; i++) idx.push(i);
  const out: T[] = [];
  while (out.length < n && idx.length > 0) {
    const j = Math.floor(rnd() * idx.length);
    out.push(arr[idx[j]]);
    idx.splice(j, 1);
  }
  return out;
}

/**
 * Builds the whole wildlife layout once, at import. Every instance goes
 * through `place()`, which refuses any anchor whose position does not resolve
 * to the mood zone it is meant to carry — zoneAt stays the single zone
 * authority and no wildlife can leak across a mood boundary.
 */
function buildWildlife(): WildlifeInstance[] {
  const rnd = seededRng(WILDLIFE_SEED);
  const out: WildlifeInstance[] = [];

  const place = (w: WildlifeInstance, zone: ZoneId) => {
    if (out.length < WILDLIFE_MAX && zoneAt(w.x, w.z) === zone) out.push(w);
  };
  const make = (
    kind: WildlifeKind,
    x: number,
    y: number,
    z: number,
    extra: Partial<WildlifeInstance> = {},
  ): WildlifeInstance => ({
    kind,
    x,
    y,
    z,
    phase: rnd() * 100,
    period: 0,
    amp: 0,
    dx: 0,
    dz: 0,
    flicks: false,
    used: false,
    fade: 0,
    ...extra,
  });

  // Anchors come from the E3 scatter, filtered by the zone they resolve to.
  const trees = WILDERNESS_TREES.map(([x, z], i) => ({ x, z, i, d: x * x + z * z }));
  const villageTrees = trees
    .filter((t) => zoneAt(t.x, t.z) === 'village')
    .sort((a, b) => a.d - b.d || a.i - b.i);
  const wildTrees = trees.filter((t) => zoneAt(t.x, t.z) === 'wilderness');
  const wildRocks = WILDERNESS_ROCKS.map(([x, z], i) => ({ x, z, i })).filter(
    (r) => zoneAt(r.x, r.z) === 'wilderness',
  );

  // ── Village Haven (cap 16) ───────────────────────────────────────────────
  // Butterflies: slow wander on a jittered ring around the village well,
  // 0.8–1.6 above the ground, bobbing ±0.3 at 2 Hz.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = 3 + rnd() * 3;
    place(make('butterfly', Math.cos(a) * r, 0.8 + rnd() * 0.8, Math.sin(a) * r, { amp: 6 }), 'village');
  }

  // Birds: perched on the tree tops nearest the village. No flight this
  // session — a still bird, 1-in-4 of which tail-flicks every 4–7 s.
  for (const t of villageTrees.slice(0, 4)) {
    place(
      make('bird', t.x, TREE_TOP_Y, t.z, {
        period: 4 + rnd() * 3,
        amp: rnd() < 0.5 ? -0.1 : 0.1,
        flicks: rnd() < 0.25,
      }),
      'village',
    );
  }

  // Cats: one by the village checkpoint, one by Garrick's forge. Still, with
  // a tail sway at 0.5 Hz.
  place(make('cat', 1.8, 0, 1.6), 'village');
  place(make('cat', -4.6, 0, 4.0), 'village');

  // ── Dangerous Territory (cap 6) — the arena rect ─────────────────────
  // Crows perched on the arena wall tops; head turns every 8–12 s.
  const arenaWalls: [number, number][] = [
    [26, -47],
    [47, -31],
    [23, -41],
  ];
  for (const [ax, az] of arenaWalls) {
    place(make('crow', ax, ARENA_WALL_TOP_Y, az, { period: 8 + rnd() * 4 }), 'dangerous');
  }
  // Thin cats on the arena floor; still, no walk.
  place(make('catThin', 30, ARENA_GROUND_Y, -30), 'dangerous');
  place(make('catThin', 42, ARENA_GROUND_Y, -38), 'dangerous');

  // ── Unnamed wilderness (cap 18) ──────────────────────────────────────
  // Crows: one per two trees, picked by the seeded PRNG, head turn 10–15 s.
  for (const t of pickDistinct(wildTrees, Math.min(8, Math.ceil(wildTrees.length / 2)), rnd)) {
    place(make('crow', t.x, TREE_TOP_Y, t.z, { period: 10 + rnd() * 5 }), 'wilderness');
  }
  // Distant movers: one small dark box drifting laterally at the treeline.
  for (const t of pickDistinct(wildTrees, 5, rnd)) {
    place(make('mover', t.x + 2.5, 1.2, t.z - 2.5, { amp: 6 }), 'wilderness');
  }
  // Rats: beside the scattered rocks; a 0.3u lateral hop every 6–10 s.
  for (const r of pickDistinct(wildRocks, 3, rnd)) {
    place(
      make('rat', r.x, 0, r.z - 0.8, {
        period: 6 + rnd() * 4,
        amp: 0.3,
        dx: rnd() < 0.5 ? -1 : 1,
      }),
      'wilderness',
    );
  }

  return out;
}

/** The single wildlife instance array. Built once, at import. */
const WILDLIFE: WildlifeInstance[] = buildWildlife();

/** Static (never-animated) geometry for a kind; the animated child is separate. */
function WildlifeBody({ kind }: { kind: WildlifeKind }) {
  switch (kind) {
    case 'butterfly':
      return null;
    case 'bird':
      return (
        <>
          <mesh position={[0, 0.11, 0.06]}>
            <sphereGeometry args={[0.07, 6, 5]} />
            <meshLambertMaterial color="#8B7355" />
          </mesh>
          <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.08, 0.22, 6]} />
            <meshLambertMaterial color="#8B7355" />
          </mesh>
        </>
      );
    case 'cat':
    case 'catThin': {
      const fur = kind === 'catThin' ? '#7A7A7A' : '#4A4A4A';
      return (
        <>
          <mesh position={[0, 0.13, 0]} scale={kind === 'catThin' ? [0.7, 1, 1] : [1, 1, 1]}>
            <boxGeometry args={[0.16, 0.14, 0.4]} />
            <meshLambertMaterial color={fur} />
          </mesh>
          <mesh position={[0, 0.21, 0.25]}>
            <boxGeometry args={[0.13, 0.12, 0.12]} />
            <meshLambertMaterial color={fur} />
          </mesh>
          <mesh position={[-0.06, 0.04, 0.13]}>
            <boxGeometry args={[0.03, 0.09, 0.03]} />
            <meshLambertMaterial color={fur} />
          </mesh>
          <mesh position={[0.06, 0.04, 0.13]}>
            <boxGeometry args={[0.03, 0.09, 0.03]} />
            <meshLambertMaterial color={fur} />
          </mesh>
          <mesh position={[-0.06, 0.04, -0.13]}>
            <boxGeometry args={[0.03, 0.09, 0.03]} />
            <meshLambertMaterial color={fur} />
          </mesh>
          <mesh position={[0.06, 0.04, -0.13]}>
            <boxGeometry args={[0.03, 0.09, 0.03]} />
            <meshLambertMaterial color={fur} />
          </mesh>
        </>
      );
    }
    case 'crow':
      return (
        <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.09, 0.26, 6]} />
          <meshLambertMaterial color="#1A1A1A" />
        </mesh>
      );
    case 'mover':
      return (
        <mesh>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshBasicMaterial color="#2A2A2A" transparent opacity={1} depthWrite={false} />
        </mesh>
      );
    case 'rat':
      return (
        <mesh position={[0, 0.1, 0]}>
          <boxGeometry args={[0.3, 0.2, 0.15]} />
          <meshLambertMaterial color="#3A3028" />
        </mesh>
      );
  }
  return null;
}

/** The single animated child per instance (wings / tail / head), or nothing. */
function WildlifePart({ kind }: { kind: WildlifeKind }) {
  switch (kind) {
    case 'butterfly':
      return (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.24, 0.18]} />
            <meshBasicMaterial color="#E8B86B" side={THREE.DoubleSide} transparent opacity={0.95} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
            <planeGeometry args={[0.24, 0.18]} />
            <meshBasicMaterial color="#E8B86B" side={THREE.DoubleSide} transparent opacity={0.95} depthWrite={false} />
          </mesh>
        </>
      );
    case 'bird':
      return (
        <mesh position={[0, 0, -0.08]}>
          <boxGeometry args={[0.05, 0.03, 0.16]} />
          <meshLambertMaterial color="#8B7355" />
        </mesh>
      );
    case 'cat':
    case 'catThin':
      return (
        <mesh position={[0, 0, -0.1]}>
          <boxGeometry args={[0.035, 0.035, 0.22]} />
          <meshLambertMaterial color={kind === 'catThin' ? '#7A7A7A' : '#4A4A4A'} />
        </mesh>
      );
    case 'crow':
      return (
        <>
          <mesh position={[0, 0.08, 0.03]}>
            <sphereGeometry args={[0.07, 6, 5]} />
            <meshLambertMaterial color="#1A1A1A" />
          </mesh>
          <mesh position={[0, 0.08, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.03, 0.1, 5]} />
            <meshLambertMaterial color="#1A1A1A" />
          </mesh>
        </>
      );
    case 'mover':
    case 'rat':
      return null;
  }
  return null;
}

/**
 * One component, one instance array, one useFrame. Walks the array in place;
 * allocates nothing per frame. Hidden with the modals, the death overlay and
 * the HUD editor (MainMenu / LoadingScreen / Credits never mount GameScene).
 */
function AmbientLife() {
  const hidden = useGameStore(
    (s) =>
      s.ui.showSettings ||
      s.ui.showInventory ||
      s.ui.showQuestLog ||
      s.ui.mapOpen ||
      s.ui.showShop ||
      s.ui.deathOverlay ||
      s.hudEditMode ||
      s.activeDialogue !== null ||
      s.houseInterior !== null,
  );
  const rootRefs = useRef<(THREE.Group | null)[]>([]);
  const partRefs = useRef<(THREE.Group | null)[]>([]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const cam = state.camera;
    cam.getWorldDirection(_wildFwd);
    const pp = useGameStore.getState().player.position;

    for (let i = 0; i < WILDLIFE.length; i++) {
      const w = WILDLIFE[i];
      const root = rootRefs.current[i];
      if (!root) continue;
      const part = partRefs.current[i];

      switch (w.kind) {
        case 'butterfly': {
          const a = t * 0.6 + w.phase;
          root.position.set(
            w.x + Math.cos(a) * w.amp * 0.7,
            w.y + Math.sin(t * 4 * Math.PI + w.phase) * 0.3, // ±0.3 u at 2 Hz
            w.z + Math.sin(a * 0.73) * w.amp * 0.7,
          );
          root.rotation.y = -a;
          if (part) part.rotation.z = Math.sin(t * 14 + w.phase) * 0.6;
          break;
        }
        case 'bird': {
          if (!part) break;
          let flick = 0;
          if (w.flicks) {
            const ph = (t + w.phase) % w.period;
            if (ph < 0.45) flick = Math.sin((ph / 0.45) * Math.PI) * w.amp;
          }
          part.rotation.x = flick;
          break;
        }
        case 'cat':
        case 'catThin': {
          // Tail sway at 0.5 Hz.
          if (part) part.rotation.y = Math.sin(t * Math.PI + w.phase) * 0.35;
          break;
        }
        case 'crow': {
          if (!part) break;
          const ph = (t + w.phase) % w.period;
          // Head swings a full 180° and back, then rests until the next turn.
          part.rotation.y = ph < 1 ? ph * Math.PI : ph < 2 ? Math.PI : ph < 3 ? Math.PI * (3 - ph) : 0;
          break;
        }
        case 'rat': {
          const ph = (t + w.phase) % w.period;
          const k = ph < 0.4 ? Math.sin((ph / 0.4) * Math.PI) : 0;
          root.position.set(w.x + k * w.amp * w.dx, w.y + k * 0.12, w.z + k * w.amp * w.dz);
          break;
        }
        case 'mover': {
          if (w.used) {
            root.visible = false;
            break;
          }
          const mx = w.x + Math.sin(t * 0.15 + w.phase) * w.amp;
          root.position.set(mx, w.y, w.z);
          const cdx = mx - cam.position.x;
          const cdy = w.y - cam.position.y;
          const cdz = w.z - cam.position.z;
          const camSq = cdx * cdx + cdy * cdy + cdz * cdz;
          const pdx = mx - pp[0];
          const pdz = w.z - pp[2];
          const pSq = pdx * pdx + pdz * pdz;
          // Only in view range (camera ≤ 30 u) and only at 25–60 u from the player.
          if (camSq > 900 || pSq < 625 || pSq > 3600) {
            root.visible = false;
            break;
          }
          if (camSq > 1e-4) {
            const dot = (_wildFwd.x * cdx + _wildFwd.y * cdy + _wildFwd.z * cdz) / Math.sqrt(camSq);
            if (dot > 0.9) {
              // Looked at: fade out over 0.4 s, then retire for the session.
              w.fade += delta / 0.4;
              if (w.fade >= 1) {
                w.used = true;
                root.visible = false;
                break;
              }
            }
          }
          root.visible = true;
          const o = 1 - w.fade;
          for (let c = 0; c < root.children.length; c++) {
            const mat = (root.children[c] as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
            if (mat && mat.transparent) mat.opacity = o;
          }
          break;
        }
      }
    }
  });

  return (
    <group visible={!hidden}>
      {WILDLIFE.map((w, i) => (
        <group
          key={i}
          ref={(el) => {
            rootRefs.current[i] = el;
          }}
          position={[w.x, w.y, w.z]}
        >
          <WildlifeBody kind={w.kind} />
          <group
            ref={(el) => {
              partRefs.current[i] = el;
            }}
          >
            <WildlifePart kind={w.kind} />
          </group>
        </group>
      ))}
    </group>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// M2D4 #2 — PHASE 2: DUNGEON ENEMY SPAWNING
// Per-room enemy table (dungeon-LOCAL coordinates; DUNGEON_ORIGIN is added at
// mount time). Enemies are mounted only for the room the player currently
// occupies, so a room change despawns them and no live enemy state persists.
// No auto-advance on clear — the player must walk through the door.
// ══════════════════════════════════════════════════════════════════════════
type DungeonEnemyKind = 'arcane' | 'crystal' | 'fire' | 'frost' | 'fangery';

const DUNGEON_ROOM_ENEMIES: Record<number, { kind: DungeonEnemyKind; pos: [number, number, number] }[]> = {
  1: [{ kind: 'arcane', pos: [6, 0, 0] }],
  2: [
    { kind: 'arcane', pos: [18, 0, -3] },
    { kind: 'arcane', pos: [18, 0, 3] },
  ],
  3: [{ kind: 'crystal', pos: [30, 0, 0] }],
  4: [
    { kind: 'crystal', pos: [42, 0, -3] },
    { kind: 'crystal', pos: [42, 0, 3] },
  ],
  5: [{ kind: 'fire', pos: [54, 0, 0] }],
  6: [
    { kind: 'fire', pos: [66, 0, 0] },
    { kind: 'fangery', pos: [66, 0, -4] },
    { kind: 'fangery', pos: [66, 0, 4] },
  ],
  7: [{ kind: 'frost', pos: [78, 0, 0] }],
  8: [
    { kind: 'frost', pos: [90, 0, 0] },
    { kind: 'fire', pos: [90, 0, 4] },
  ],
  9: [
    { kind: 'fangery', pos: [102, 0, -3] },
    { kind: 'fangery', pos: [102, 0, 0] },
    { kind: 'fangery', pos: [102, 0, 3] },
  ],
  10: [
    { kind: 'crystal', pos: [114, 0, -5] },
    { kind: 'fire', pos: [114, 0, 5] },
    { kind: 'frost', pos: [114, 0, 0] },
    { kind: 'fangery', pos: [114, 0, -2] },
    { kind: 'fangery', pos: [114, 0, 2] },
  ],
};

function DungeonEnemies() {
  const dungeonRoom = useGameStore((state) => state.player.dungeonRoom);
  const list = DUNGEON_ROOM_ENEMIES[dungeonRoom];
  if (dungeonRoom <= 0 || !list) return null;
  const [ox, oy, oz] = DUNGEON_ORIGIN;
  return (
    <>
      {list.map((e, i) => {
        const pos: [number, number, number] = [ox + e.pos[0], oy + e.pos[1], oz + e.pos[2]];
        switch (e.kind) {
          case 'arcane':
            return <MageEnemy key={i} position={pos} name="Arcane Mage" />;
          case 'crystal':
            return <CrystalMageEnemy key={i} position={pos} />;
          case 'fire':
            return <FireMageEnemy key={i} position={pos} />;
          case 'frost':
            return <FrostMageEnemy key={i} position={pos} />;
          case 'fangery':
            return <FangeryEnemy key={i} position={pos} />;
          default:
            return null;
        }
      })}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// M2D4 #2 — PHASE 5: PUZZLE / TRAP INFRASTRUCTURE (placeholder content)
// RoomContent dispatches by ROOM_SEQUENCE for the current room; PuzzleZone and
// TrapZone are the only two content kinds. Puzzle and trap content beyond the
// interactable cube and the damage plane is UNSPECIFIED and deliberately NOT
// invented.
// ══════════════════════════════════════════════════════════════════════════
const PUZZLE_PROMPT = 'Inspect Rune';

/** The puzzle cube currently within interact range (null when none). Written
 *  by PuzzleZone each frame; read by GameScene's single E handler so the
 *  puzzle adds no global listener of its own. */
const puzzleInteractRef: { current: { room: number } | null } = { current: null };

/** P5-R2 — placeholder puzzle: one 0.5 m cube at the room centre. E within
 *  1.5 m marks the room cleared; an already-cleared room renders green. */
function PuzzleZone({ room }: { room: number }) {
  const cleared = useGameStore((s) => s.player.dungeonRoomCleared.includes(room));
  const cx = DUNGEON_ORIGIN[0] + DUNGEON_ROOM_CENTER_X(room);
  const cy = DUNGEON_ORIGIN[1];
  const cz = DUNGEON_ORIGIN[2];

  useFrame(() => {
    const t = readPlayerBody();
    const inRange = t !== null && Math.hypot(t.x - cx, t.z - cz) <= 1.5;
    const st = useGameStore.getState();
    if (inRange) {
      puzzleInteractRef.current = { room };
      if (st.ui.interactPrompt !== PUZZLE_PROMPT) {
        useGameStore.setState((s) => ({ ui: { ...s.ui, interactPrompt: PUZZLE_PROMPT } }));
      }
    } else {
      if (puzzleInteractRef.current?.room === room) puzzleInteractRef.current = null;
      if (st.ui.interactPrompt === PUZZLE_PROMPT) {
        useGameStore.setState((s) => ({ ui: { ...s.ui, interactPrompt: null } }));
      }
    }
  });

  // Clear the shared interact slot on unmount (room change / dungeon exit).
  useEffect(() => () => {
    if (puzzleInteractRef.current?.room === room) puzzleInteractRef.current = null;
  }, [room]);

  return (
    <mesh castShadow position={[cx, cy + 1, cz]}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshToonMaterial
        color={cleared ? '#22c55e' : '#eab308'}
        emissive={cleared ? '#16a34a' : '#a16207'}
        emissiveIntensity={0.6}
      />
    </mesh>
  );
}

/** P5-R3 — placeholder trap: a 4 × 4 m red plane. Overlap (< 2 m) applies
 *  Bleeding I with a local 2 s cooldown ref. Nothing else is implemented. */
function TrapZone({ room }: { room: number }) {
  const cooldownRef = useRef(0);
  const cx = DUNGEON_ORIGIN[0] + DUNGEON_ROOM_CENTER_X(room);
  const cy = DUNGEON_ORIGIN[1];
  const cz = DUNGEON_ORIGIN[2];

  useFrame((_, delta) => {
    cooldownRef.current = Math.max(0, cooldownRef.current - delta);
    if (cooldownRef.current > 0) return;
    const t = readPlayerBody();
    if (t && Math.hypot(t.x - cx, t.z - cz) < 2) {
      useGameStore.getState().applyDebuff('bleeding', 1, 3);
      cooldownRef.current = 2;
    }
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, cy + 0.02, cz]}>
      <planeGeometry args={[4, 4]} />
      <meshBasicMaterial color="#ef4444" transparent opacity={0.35} depthWrite={false} />
    </mesh>
  );
}

/** P5-R1/P5-R5 — dispatch content by ROOM_SEQUENCE[dungeonRoom - 1]. Rooms
 *  1..10 only; the bossroom (11) and the world mount nothing. */
function RoomContent() {
  const dungeonRoom = useGameStore((s) => s.player.dungeonRoom);
  if (dungeonRoom <= 0 || dungeonRoom > DUNGEON_ROOM_COUNT) return null;
  const kind = ROOM_SEQUENCE[dungeonRoom - 1];
  if (kind === 'magic') return null;
  return (
    <>
      {(kind === 'puzzle' || kind === 'puzzle_trap') && <PuzzleZone room={dungeonRoom} />}
      {(kind === 'trap' || kind === 'puzzle_trap') && <TrapZone room={dungeonRoom} />}
    </>
  );
}

export default function GameScene() {
  const worldPaused = useGameStore((state) => state.ui.showSettings || state.ui.showInventory || state.hudEditMode);
  const houseInterior = useGameStore((state) => state.houseInterior);
  const shadowsEnabled = useGameStore((state) => state.settings.shadows);
  // M2D4 #1 — the dungeon shell mounts only while the player is inside.
  const dungeonRoom = useGameStore((state) => state.player.dungeonRoom);
  // M2D4 #2 — the boss mounts in the bossroom only until it has been defeated.
  const bossDefeated = useGameStore((state) => state.player.bossDefeated);
  // E2: the two existing lights are driven imperatively by the day cycle
  // (position + intensity only); their JSX baseline stays as authored.
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  // F4: the drei <Sky> mesh, so the day cycle can write its uniforms per frame
  // (drei applies props on render, so a prop change would need a re-render).
  const skyRef = useRef<THREE.Mesh | null>(null);
  // WebGL support gate: R3F's root.configure() creates the WebGLRenderer with no
  // try/catch. When context creation throws (e.g. no GPU/software GL), the root's
  // internal `pending` promise never resolves, the reconciler never mounts the
  // Canvas subtree, and the world silently never exists — NPCs, interaction
  // prompts, movement all dead while the 2D HUD keeps rendering. Detect that
  // condition up front and fail loudly instead.
  const [webglSupported] = useState(() => {
    if (typeof document === 'undefined') return true;
    try {
      // A bare getContext('webgl') probe can succeed while R3F's actual
      // WebGLRenderer construction fails (it needs a working GL context with
      // shader compilation). When that happened the world silently never
      // mounted — NPCs, prompts, movement all dead. Probe with the real thing.
      const test = document.createElement('canvas');
      const gl = test.getContext('webgl2') || test.getContext('webgl');
      if (!gl) return false;
      const shader = gl.createShader(gl.VERTEX_SHADER);
      if (!shader) return false;
      gl.shaderSource(shader, 'void main() { gl_Position = vec4(0.0); }');
      gl.compileShader(shader);
      const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
      gl.deleteShader(shader);
      return ok;
    } catch {
      return false;
    }
  });
  // M2D4 #1 — dungeon transition UI state. `dungeonFade` is a full-screen black
  // div (outside the Canvas); `dungeonLoading` is the separate bossroom
  // loading overlay. Both reset on unmount.
  const [dungeonFade, setDungeonFade] = useState(0);
  const [dungeonLoading, setDungeonLoading] = useState(false);
  const dungeonTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // M2D4 #1 — E routing for the three dungeon doors. UI.tsx's E handler only
  // dispatches NPC / checkpoint interactions, so the dungeon doors are handled
  // here, where the fade / loading state lives. Fade: 0.5 s to black → action
  // at full black → 0.2 s hold → 2.3 s clear (3 s total).
  useEffect(() => {
    const timers = dungeonTimersRef.current;
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));

    const runFade = (apply: () => void, teleportTo: [number, number, number]) => {
      useGameStore.getState().setDungeonEntering(true);
      setDungeonFade(1);
      later(() => {
        apply();
        teleportPlayerBody(teleportTo);
      }, 500);
      later(() => setDungeonFade(0), 700);
      later(() => useGameStore.getState().setDungeonEntering(false), 3000);
    };

    const runBossroomLoading = () => {
      useGameStore.getState().setDungeonEntering(true);
      setDungeonLoading(true);
      later(() => {
        const st = useGameStore.getState();
        st.setDungeonRoom(DUNGEON_BOSSROOM_INDEX + 1);
        st.setDungeonCheckpoint(DUNGEON_BOSSROOM_INDEX + 1);
        teleportPlayerBody(dungeonRoomEntryWorld(DUNGEON_BOSSROOM_INDEX + 1));
        setDungeonLoading(false);
        st.setDungeonEntering(false);
      }, 5000);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || (e.key !== 'e' && e.key !== 'E')) return;
      const st = useGameStore.getState();
      if (st.gamePhase !== 'playing') return;
      if (
        st.activeDialogue || st.ui.showSettings || st.ui.showInventory ||
        st.ui.showQuestLog || st.ui.mapOpen || st.hudEditMode || st.ui.deathOverlay
      ) return;
      // M2D4 #2 — the puzzle cube (Phase 5) takes E when it is in range; it
      // publishes its room through puzzleInteractRef, not the prompt channel.
      const puzzle = puzzleInteractRef.current;
      if (puzzle) {
        useGameStore.getState().markDungeonRoomCleared(puzzle.room);
        return;
      }
      const prompt = st.ui.interactPrompt;
      if (prompt === DUNGEON_PROMPT_ENTER) {
        runFade(() => useGameStore.getState().enterDungeon(), dungeonRoomEntryWorld(1));
      } else if (prompt === DUNGEON_PROMPT_BOSSROOM) {
        runBossroomLoading();
      } else if (prompt === DUNGEON_PROMPT_EXIT) {
        runFade(() => useGameStore.getState().exitDungeon(), dungeonExitWorldPosition());
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
    };
  }, []);

  const keyboardMap = useMemo(() => [
    { name: 'forward', keys: ['ArrowUp', 'KeyW'] },
    { name: 'backward', keys: ['ArrowDown', 'KeyS'] },
    { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
    { name: 'right', keys: ['ArrowRight', 'KeyD'] },
    { name: 'jump', keys: ['Space'] },
    { name: 'sprint', keys: ['Shift'] },
    { name: 'attack', keys: ['KeyJ'] },
    { name: 'dodge', keys: ['KeyK'] },
    // Skill keys Z/X/C — shared by Water Staff (Z Waterball, X Waterslicer,
    // C Waterbullet) and Sword (Z Fatamorgana, X Dozens of Slashes).
    { name: 'skill1', keys: ['KeyZ'] },
    { name: 'skill2', keys: ['KeyX'] },
    { name: 'skill3', keys: ['KeyC'] },
    { name: 'skill4', keys: ['KeyV'] }, // Core special ultimate (V — Resonant Overdrive)
    { name: 'skill5', keys: ['KeyF'] }, // Core movement skill (F — Echo Step)
  ], []);

  return (
    <div className="absolute inset-0 z-0">
      {!webglSupported ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-center p-8">
          <h2 className="text-xl font-bold text-amber-300 mb-3">WebGL Unavailable</h2>
          <p className="text-sm text-gray-400 max-w-md">
            Abyssion needs WebGL to render its 3D world. Enable hardware acceleration
            in your browser settings or try a different browser, then reload.
          </p>
        </div>
      ) : (
      <KeyboardControls map={keyboardMap}>
        <Canvas shadows={shadowsEnabled} dpr={[1, 1.5]} camera={{ position: [0, 5, 10], fov: 60 }} frameloop={worldPaused ? 'never' : 'always'}>
          {/* F4 — the clear colour is re-written from the day cycle every frame
              (E4 §8's horizon tone for the current band); this is only the
              authored initial value, in the day band. */}
          <color attach="background" args={['#A8A08A']} />
          <ambientLight ref={ambientLightRef} intensity={0.5} />
          <directionalLight
            ref={sunLightRef}
            castShadow={shadowsEnabled}
            position={[10, 20, 10]}
            intensity={1.5}
            shadow-mapSize={[1024, 1024]}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
          />
          {/* F4 — the Sky's disc and scattering tone are driven per frame from
              the day cycle through the ref below. sunPosition here stays the
              authored baseline; drei applies it as a uniform on render, so the
              per-frame drive is a uniform write, not a prop change. */}
          <Sky
            ref={(m) => {
              skyRef.current = m;
            }}
            sunPosition={[10, 20, 10]}
          />

          {/* E2 — day cycle + zone fog driver (renders nothing; writes only the
              two lights above, one fog object, and (F4) the sky + clear
              colour on this scene). */}
          <DayNightCycle sunRef={sunLightRef} ambientRef={ambientLightRef} skyRef={skyRef} />

          {/* E3b — ambient wildlife (decorative only: no collider, no damage,
              no dialogue, no interaction; rendered outside <Physics>). */}
          <AmbientLife />

          <Suspense fallback={null}>
            <Physics>
              <Player />

              {/* F2 — the four combat VFX pools (damage numbers, hit sparks,
                  slash particles, loot drops) are published by the store and
                  had no consumer: this is their only render site, and the only
                  caller of collectLootDrop. Inside <Physics> because LootDrops
                  emits a sensor RigidBody. */}
              <WorldFX />

              {/* M2D2 #1 — discarded / overflow items as gravity-bound boxes. */}
              <WorldDropMeshes />

              {/* ═══════════════════════════════════════════════════════
                  CHECKPOINTS — Spawn 1: Village center, Spawn 2: Wilderness entrance
                  ═══════════════════════════════════════════════════════ */}
              <InteractionManager />
              <Checkpoint position={[0, 0, 0]} name="Village Haven" />
              <Checkpoint position={[0, 0, -18]} name="Wilderness Entrance" />

              {/* ═══════════════════════════════════════════════════════
                  NPCs — Settlement cluster
                  ═══════════════════════════════════════════════════════ */}
              {NPCS_DATA.map((npc) => (
                <NPC key={npc.id} data={npc} />
              ))}

              {/* ═══════════════════════════════════════════════════════
                  SETTLEMENT STRUCTURES
                  ═══════════════════════════════════════════════════════ */}

              {/* Marcus — Market Stall (east side) */}
              <RigidBody type="fixed" position={[6, 0, 2]}>
                <group>
                  <mesh position={[0, 2.5, 0]} castShadow>
                    <boxGeometry args={[2.5, 0.15, 2]} />
                    <meshToonMaterial color="#78350f" />
                  </mesh>
                  {[[-1.1, 1.3, 0.8],[1.1, 1.3, 0.8],[-1.1, 1.3, -0.8],[1.1, 1.3, -0.8]].map(([x,y,z],i) => (
                    <mesh key={i} position={[x,y,z]} castShadow>
                      <cylinderGeometry args={[0.04, 0.04, 2.5, 8]} />
                      <meshToonMaterial color="#92400e" />
                    </mesh>
                  ))}
                  <mesh position={[0, 0.5, 1]} castShadow>
                    <boxGeometry args={[2.5, 0.8, 0.3]} />
                    <meshToonMaterial color="#78350f" />
                  </mesh>
                </group>
              </RigidBody>

              {/* Garrick — Forge (west side) */}
              <RigidBody type="fixed" position={[-6, 0, 3]}>
                <group>
                  <mesh position={[0, 0.4, 0]} castShadow>
                    <boxGeometry args={[0.5, 0.4, 0.4]} />
                    <meshToonMaterial color="#475569" />
                  </mesh>
                  <mesh position={[0.8, 0.3, 0.5]} castShadow>
                    <boxGeometry args={[0.6, 0.5, 0.6]} />
                    <meshToonMaterial color="#334155" />
                  </mesh>
                  <mesh position={[0.8, 0.6, 0.5]}>
                    <sphereGeometry args={[0.2, 8, 8]} />
                    <meshToonMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} />
                  </mesh>
                </group>
              </RigidBody>

              {/* Hektor — Guard Post (south edge) */}
              <RigidBody type="fixed" position={[3, 0, -6]}>
                <group>
                  <mesh position={[0, 0.8, 0]} castShadow>
                    <boxGeometry args={[0.6, 1.6, 0.6]} />
                    <meshToonMaterial color="#1e3a8a" />
                  </mesh>
                  <mesh position={[0, 1.7, 0]} castShadow>
                    <boxGeometry args={[0.8, 0.1, 0.8]} />
                    <meshToonMaterial color="#1e40af" />
                  </mesh>
                </group>
              </RigidBody>

              {/* Seraphina — Healing Hut (north-west) */}
              <RigidBody type="fixed" position={[-4, 0, -5]}>
                <group>
                  <mesh position={[0, 1.2, 0]} castShadow>
                    <boxGeometry args={[1.8, 1.8, 1.8]} />
                    <meshToonMaterial color="#065f46" />
                  </mesh>
                  <mesh position={[0, 2.3, 0]} castShadow>
                    <coneGeometry args={[1.4, 1, 4]} />
                    <meshToonMaterial color="#047857" />
                  </mesh>
                  <mesh position={[0, 1.8, 0.91]}>
                    <boxGeometry args={[0.3, 0.1, 0.02]} />
                    <meshToonMaterial color="#d1fae5" emissive="#10b981" emissiveIntensity={1} />
                  </mesh>
                  <mesh position={[0, 1.8, 0.91]}>
                    <boxGeometry args={[0.1, 0.3, 0.02]} />
                    <meshToonMaterial color="#d1fae5" emissive="#10b981" emissiveIntensity={1} />
                  </mesh>
                </group>
              </RigidBody>

              {/* Village houses — the first house has an enterable interior.
                  The interior renders as a separate small space (only when
                  houseInterior is set) so the main world never carries all
                  interiors simultaneously (low-spec budget). */}
              <HouseDoorSensor doorPos={[4, 0, 5.6]} interiorId="village_house_1" />
              {/* Enterable house (door faces +z toward the door sensor). */}
              <VillageHouse position={[4, 0, 4]} wallColor="#b45309" />
              <VillageHouse position={[-5, 0, 5]} wallColor="#a16207" scale={0.9} />
              <VillageHouse position={[2, 0, -3]} wallColor="#92400e" scale={0.8} />

              {/* M2D2 #1 — the single edge house: an enterable shell with one
                  bed and a door threshold; no lock, no aggro change. */}
              <EdgeHouse />
              <HouseOccupancyZone center={HOUSE_POSITION} halfX={3} halfZ={3} />

              {/* M2D4 #1 — the world-side dungeon door + the shell (mounted only
                  while the player is inside it) + per-room checkpoint tracking. */}
              <DungeonWorldDoor />
              <DungeonDoorZone position={DUNGEON_DOOR_WORLD_POSITION} label={DUNGEON_PROMPT_ENTER} />
              {dungeonRoom > 0 && <DungeonShell />}
              <DungeonRoomTracker />
              {dungeonRoom === DUNGEON_ROOM_COUNT && (
                <DungeonDoorZone position={dungeonBossroomDoorWorld()} label={DUNGEON_PROMPT_BOSSROOM} />
              )}
              {dungeonRoom === DUNGEON_BOSSROOM_INDEX + 1 && (
                <DungeonDoorZone position={dungeonExitDoorWorld()} label={DUNGEON_PROMPT_EXIT} />
              )}
              {/* M2D4 #2 — dungeon enemies for the current room only. */}
              <DungeonEnemies />
              {/* M2D4 #2 — PHASE 5 puzzle / trap infrastructure (current room). */}
              <RoomContent />
              {/* M2D4 #2 — PHASE 3 boss: bossroom centre (dungeon-local x=142),
                  mounted while the bossroom is current and the boss is alive. */}
              {dungeonRoom === DUNGEON_BOSSROOM_INDEX + 1 && !bossDefeated && (
                <HolyCrystallinizerWizard
                  position={[DUNGEON_ORIGIN[0] + DUNGEON_BOSSROOM_CENTER_X, DUNGEON_ORIGIN[1], DUNGEON_ORIGIN[2]]}
                />
              )}

              {/* Campfire near Arthur */}
              <RigidBody type="fixed" position={[1.5, 0, 2]}>
                <group>
                  {/* Fire base stones */}
                  {[0, 0.8, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6].map((angle, i) => (
                    <mesh key={i} position={[Math.cos(angle) * 0.4, 0.1, Math.sin(angle) * 0.4]} castShadow>
                      <sphereGeometry args={[0.12, 6, 6]} />
                      <meshToonMaterial color="#6b7280" />
                    </mesh>
                  ))}
                  {/* Fire glow */}
                  <mesh position={[0, 0.3, 0]}>
                    <sphereGeometry args={[0.25, 8, 8]} />
                    <meshToonMaterial color="#f97316" emissive="#f97316" emissiveIntensity={3} transparent opacity={0.8} />
                  </mesh>
                  <mesh position={[0, 0.5, 0]}>
                    <coneGeometry args={[0.15, 0.4, 6]} />
                    <meshToonMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} transparent opacity={0.7} />
                  </mesh>
                </group>
              </RigidBody>

              {/* ═══════════════════════════════════════════════════════
                  WINDING PATH — Village → Wilderness
                  ═══════════════════════════════════════════════════════ */}
              {/* Path segments with curves */}
              {[
                [-1, -8], [0, -10], [-1, -12], [1, -14],
                [0, -16], [-1, -18],
              ].map(([x, z], i) => (
                <RigidBody key={`path-${i}`} type="fixed">
                  <mesh position={[x, 0.01, z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                    <planeGeometry args={[3, 4]} />
                    <meshToonMaterial color="#a3a37a" />
                  </mesh>
                </RigidBody>
              ))}

              {/* Path-side trees */}
              <Tree position={[-5, 0, -9]} />
              <Tree position={[5, 0, -10]} />
              <Tree position={[-4, 0, -13]} />
              <Tree position={[4, 0, -14]} />
              <Tree position={[-3, 0, -16]} />
              <Tree position={[5, 0, -17]} />

              {/* Path-side rocks */}
              <Rock position={[-3, 0, -11]} />
              <Rock position={[3, 0, -15]} />
              <Rock position={[-2, 0, -17]} />

              {/* Transition trees (darker, wilder) */}
              <Tree position={[-6, 0, -19]} scale={1.2} />
              <Tree position={[6, 0, -19]} scale={1.1} />
              <DeadTree position={[-4, 0, -20]} />
              <DeadTree position={[5, 0, -20]} />

              {/* ═══════════════════════════════════════════════════════
                  ENEMY ZONE — Distinct encounter areas
                  ═══════════════════════════════════════════════════════ */}

              {/* Zone label */}
              <Html position={[0, 4, -22]} center distanceFactor={20}>
                <div className="bg-red-950/80 text-red-200 border border-red-500/50 px-3 py-1 rounded-lg text-xs font-bold shadow-xl">
                  ⚔️ Dangerous Territory
                </div>
              </Html>

              {/* ── Slime Clearing (left side, z ≈ -23 to -29) ── */}
              <Html position={[-8, 3, -26]} center distanceFactor={20}>
                <div className="bg-green-950/60 text-green-200 border border-green-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                  🟢 Slime Clearing
                </div>
              </Html>
              <SlimeEnemy position={[-8, 0, -23]} name="Bouncy Slime" />
              <SlimeEnemy position={[-5, 0, -26]} name="Bouncy Slime" />
              <SlimeEnemy position={[-11, 0, -28]} name="Bouncy Slime" />
              {/* Slime area rocks and vegetation */}
              <Rock position={[-7, 0, -23]} scale={0.8} />
              <Rock position={[-11, 0, -25]} scale={0.6} />
              <Tree position={[-12, 0, -24]} />
              <Tree position={[-5, 0, -28]} />

              {/* ── Wolf Path (center-left, z ≈ -28 to -34) ── */}
              <Html position={[2, 3, -31]} center distanceFactor={20}>
                <div className="bg-amber-950/60 text-amber-200 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                  🐺 Wolf Path
                </div>
              </Html>
              <WolfEnemy position={[1, 0, -28]} name="Dire Wolf" />
              <WolfEnemy position={[5, 0, -31]} name="Dire Wolf" />
              <WolfEnemy position={[-2, 0, -34]} name="Dire Wolf" />
              {/* Thornbacks — rocky outskirts beyond the wolf path */}
              <ThornbackEnemy position={[9, 0, -30]} name="Thornback" />
              <ThornbackEnemy position={[13, 0, -33]} name="Thornback" />
              {/* Arrow Bundle supply drop for crossbow ammo */}
              <ArrowBundlePickup position={[8, 0, -27]} />
              {/* Wolf area rocks and dead trees */}
              <Rock position={[3, 0, -27]} scale={0.7} />
              <DeadTree position={[5, 0, -29]} />
              <DeadTree position={[-1, 0, -32]} />
              <Rock position={[1, 0, -33]} scale={0.9} />

              {/* ── Bandit Camp (center-right, z ≈ -30 to -36) ── */}
              <Html position={[-8, 3, -33]} center distanceFactor={20}>
                <div className="bg-orange-950/60 text-orange-200 border border-orange-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                  ⚔️ Bandit Camp
                </div>
              </Html>
              <BanditEnemy position={[-5, 0, -30]} name="Bandit Fighter" />
              <BanditEnemy position={[-10, 0, -33]} name="Bandit Fighter" />
              <BanditEnemy position={[-6, 0, -37]} name="Bandit Fighter" />
              {/* Bandit camp props */}
              <RigidBody type="fixed" position={[-7, 0, -32]}>
                <mesh castShadow position={[0, 0.3, 0]}>
                  <boxGeometry args={[1.5, 0.6, 1]} />
                  <meshToonMaterial color="#78350f" />
                </mesh>
              </RigidBody>
              <Rock position={[-5, 0, -30]} scale={0.5} />
              <Rock position={[-11, 0, -32]} scale={0.7} />

              {/* ── Mage Area (far right, z ≈ -34 to -40) ── */}
              <Html position={[8, 3, -37]} center distanceFactor={20}>
                <div className="bg-purple-950/60 text-purple-200 border border-purple-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                  🔮 Arcane Grounds
                </div>
              </Html>
              <MageEnemy position={[7, 0, -34]} name="Arcane Mage" />
              <MageEnemy position={[11, 0, -37]} name="Arcane Mage" />
              <MageEnemy position={[5, 0, -40]} name="Arcane Mage" />
              {/* Mage area rocks and mystical elements */}
              <Rock position={[7, 0, -33]} scale={1.0} />
              <Rock position={[11, 0, -35]} scale={0.8} />
              <DeadTree position={[9, 0, -38]} />
              {/* Mystical crystal */}
              <RigidBody type="fixed">
                <mesh position={[8, 0.8, -35]} castShadow>
                  <octahedronGeometry args={[0.4, 0]} />
                  <meshToonMaterial color="#a855f7" emissive="#7c3aed" emissiveIntensity={2} transparent opacity={0.8} />
                </mesh>
              </RigidBody>

              {/* Enemy zone environment dressing */}
              {[
                [-13, -26], [13, -28], [-12, -35], [14, -33],
                [-14, -38], [12, -40], [-8, -40], [8, -42],
              ].map(([x, z], i) => (
                <Rock key={`erock-${i}`} position={[x, 0, z]} scale={0.5 + (i % 3) * 0.2} />
              ))}
              {[
                [-15, -30], [15, -32], [-10, -42], [10, -44],
              ].map(([x, z], i) => (
                <DeadTree key={`etree-${i}`} position={[x, 0, z]} />
              ))}

              {/* ═══════════════════════════════════════════════════════
                  E3 — WILDERNESS REDISTRIBUTION (fixed seed 42)
                  Existing prefabs only (Tree, Rock). Deterministic; computed
                  once at import. Named zones above are untouched.
                  ═══════════════════════════════════════════════════════ */}
              {WILDERNESS_TREES.map(([x, z], i) => (
                <Tree key={`wtree-${i}`} position={[x, 0, z]} />
              ))}
              {WILDERNESS_ROCKS.map(([x, z], i) => (
                <Rock key={`wrock-${i}`} position={[x, 0, z]} />
              ))}

              {/* Target Dummy — in village for training */}
              <EnemyDummy position={[0, 0, -7]} name="Training Dummy" color="#ef4444" />

              {/* ═══════════════════════════════════════════════════════
                  TRIAL ARENA — Accessible from the east side
                  ═══════════════════════════════════════════════════════ */}
              <EncounterArea />

              {/* Floor */}
              <RigidBody type="fixed" colliders={false}>
                <CuboidCollider args={[50, 0.5, 50]} position={[0, -0.5, 0]} />
                <mesh position={[0, -0.5, 0]} receiveShadow>
                  <boxGeometry args={[100, 1, 100]} />
                  <meshToonMaterial color="#4ade80" />
                </mesh>
              </RigidBody>

              {/* Walls/Boundaries */}
              <RigidBody type="fixed" position={[0, 0, -50]}>
                <mesh receiveShadow>
                  <boxGeometry args={[100, 10, 1]} />
                  <meshToonMaterial color="#1e293b" />
                </mesh>
              </RigidBody>
              {/* M2D4 #1 — the +z boundary is split around the gap that leads
                  to the world-side dungeon door at [30, 0, 60]. */}
              <RigidBody type="fixed" position={[-11.5, 0, 50]}>
                <mesh receiveShadow>
                  <boxGeometry args={[77, 10, 1]} />
                  <meshToonMaterial color="#1e293b" />
                </mesh>
              </RigidBody>
              <RigidBody type="fixed" position={[41.5, 0, 50]}>
                <mesh receiveShadow>
                  <boxGeometry args={[17, 10, 1]} />
                  <meshToonMaterial color="#1e293b" />
                </mesh>
              </RigidBody>
              <RigidBody type="fixed" position={[-50, 0, 0]}>
                <mesh receiveShadow>
                  <boxGeometry args={[1, 10, 100]} />
                  <meshToonMaterial color="#1e293b" />
                </mesh>
              </RigidBody>
              <RigidBody type="fixed" position={[50, 0, 0]}>
                <mesh receiveShadow>
                  <boxGeometry args={[1, 10, 100]} />
                  <meshToonMaterial color="#1e293b" />
                </mesh>
              </RigidBody>

              {/* ── HOUSE INTERIOR (separate space, rendered only while
                  occupied — never alongside the exterior world) ── */}
              {houseInterior === 'village_house_1' && (
                <group>
                  <InteriorTeleporter target={[40, 1, 40]} />
                  {/* Floor + walls of the small interior room */}
                  <RigidBody type="fixed" colliders={false}>
                    <CuboidCollider args={[4, 0.5, 4]} position={[40, -0.5, 40]} />
                  </RigidBody>
                  <mesh position={[40, 0.01, 40]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                    <planeGeometry args={[8, 8]} />
                    <meshToonMaterial color="#8a6b4a" />
                  </mesh>
                  {([
                    [[40, 2, 36.05], [8, 4, 0.1]],
                    [[40, 2, 43.95], [8, 4, 0.1]],
                    [[36.05, 2, 40], [0.1, 4, 8]],
                  ] as const).map(([pos, size], i) => (
                    <RigidBody key={`hwall-${i}`} type="fixed">
                      <mesh position={pos as unknown as [number, number, number]} castShadow receiveShadow>
                        <boxGeometry args={size as unknown as [number, number, number]} />
                        <meshToonMaterial color="#a16207" />
                      </mesh>
                    </RigidBody>
                  ))}
                  {/* South wall with a doorway gap; exiting through it leaves */}
                  <RigidBody type="fixed">
                    <mesh position={[38, 2, 43.9]} castShadow receiveShadow>
                      <boxGeometry args={[4, 4, 0.1]} />
                      <meshToonMaterial color="#a16207" />
                    </mesh>
                  </RigidBody>
                  <ExitDoorZone exitPos={[42, 0, 43.4]} />
                  {/* Ceiling/roof boundary (P2.2): visually closes the room; no
                      collider needed — the player cannot jump out of bounds. */}
                  <mesh position={[40, 4.05, 40]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
                    <planeGeometry args={[8, 8]} />
                    <meshToonMaterial color="#5a3d22" side={THREE.DoubleSide} />
                  </mesh>
                  {/* Interior light source (P2.2) */}
                  <pointLight position={[40, 3.4, 40]} intensity={18} distance={12} color="#ffd9a0" castShadow={false} />
                  <mesh position={[40, 3.7, 40]}>
                    <sphereGeometry args={[0.12, 8, 8]} />
                    <meshToonMaterial color="#ffe9c4" emissive="#ffd9a0" emissiveIntensity={2} />
                  </mesh>
                  {/* Functional-looking static props (P2.2): bed, table, chair,
                      storage chest — grouped geometry, low-spec primitives. */}
                  <RigidBody type="fixed">
                    {/* Bed: frame + mattress + pillow */}
                    <group position={[36.8, 0, 37.6]}>
                      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
                        <boxGeometry args={[1.1, 0.5, 2.2]} />
                        <meshToonMaterial color="#5a3d22" />
                      </mesh>
                      <mesh position={[0, 0.58, 0.1]} castShadow>
                        <boxGeometry args={[1, 0.16, 2]} />
                        <meshToonMaterial color="#9ca3af" />
                      </mesh>
                      <mesh position={[0, 0.7, -0.75]} castShadow>
                        <boxGeometry args={[0.7, 0.14, 0.4]} />
                        <meshToonMaterial color="#e5e7eb" />
                      </mesh>
                    </group>
                  </RigidBody>
                  <RigidBody type="fixed">
                    {/* Table: top + four legs */}
                    <group position={[41.8, 0, 38.2]}>
                      <mesh position={[0, 0.72, 0]} castShadow receiveShadow>
                        <boxGeometry args={[1.3, 0.08, 0.8]} />
                        <meshToonMaterial color="#6b4a2a" />
                      </mesh>
                      {[[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]].map(([lx, lz], i) => (
                        <mesh key={i} position={[lx, 0.36, lz]} castShadow>
                          <boxGeometry args={[0.08, 0.72, 0.08]} />
                          <meshToonMaterial color="#5a3d22" />
                        </mesh>
                      ))}
                    </group>
                  </RigidBody>
                  <RigidBody type="fixed">
                    {/* Chair: seat + backrest + legs */}
                    <group position={[41.2, 0, 39.3]} rotation={[0, -0.6, 0]}>
                      <mesh position={[0, 0.45, 0]} castShadow>
                        <boxGeometry args={[0.45, 0.06, 0.45]} />
                        <meshToonMaterial color="#7c5a33" />
                      </mesh>
                      <mesh position={[0, 0.75, -0.2]} castShadow>
                        <boxGeometry args={[0.45, 0.55, 0.06]} />
                        <meshToonMaterial color="#7c5a33" />
                      </mesh>
                      {[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([lx, lz], i) => (
                        <mesh key={i} position={[lx, 0.22, lz]} castShadow>
                          <boxGeometry args={[0.06, 0.45, 0.06]} />
                          <meshToonMaterial color="#5a3d22" />
                        </mesh>
                      ))}
                    </group>
                  </RigidBody>
                  <RigidBody type="fixed">
                    {/* Storage chest: body + lid + latch */}
                    <group position={[43.2, 0, 37.2]}>
                      <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
                        <boxGeometry args={[0.9, 0.7, 0.6]} />
                        <meshToonMaterial color="#4a3220" />
                      </mesh>
                      <mesh position={[0, 0.73, 0]} castShadow>
                        <boxGeometry args={[0.95, 0.1, 0.65]} />
                        <meshToonMaterial color="#3b2718" />
                      </mesh>
                      <mesh position={[0, 0.55, 0.32]}>
                        <boxGeometry args={[0.1, 0.14, 0.04]} />
                        <meshToonMaterial color="#d68a31" />
                      </mesh>
                    </group>
                  </RigidBody>
                </group>
              )}
            </Physics>
          </Suspense>
          {/* F7 — E4 §6 post-processing. Sibling of the scene contents, inside
              the same Canvas: it wraps the frame, it does not replace any
              scene content. Never mounted in the menu / loading / credits
              phases, which render outside GameScene entirely. */}
          <PostProcessing />
        </Canvas>
      </KeyboardControls>
      )}
      {/* M2D4 #1 — dungeon fade (0 → 1 → 0 over 3 s). Separate element from the
          bossroom loading overlay below; both sit outside the Canvas. */}
      <div
        className="fixed inset-0 z-[120] pointer-events-none bg-black"
        style={{ opacity: dungeonFade, transition: `opacity ${dungeonFade > 0 ? 0.5 : 2.3}s linear` }}
        aria-hidden="true"
      />
      {/* M2D4 #1 — bossroom loading overlay (placeholder 5 s). */}
      {dungeonLoading && (
        <div className="fixed inset-0 z-[130] flex flex-col items-center justify-center bg-black/90 text-white">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          <p className="mt-4 text-sm uppercase tracking-widest">Loading…</p>
        </div>
      )}
    </div>
  );
}
