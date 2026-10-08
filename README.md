# Abyssion: Legacy of Volion

> **Status: native-only.** The JavaScript/TypeScript web pipeline has been removed. The
> project is now a native application: C/C++ implementation, C at the ABI boundary, Rust for
> memory-safe subsystems, and a project-local Zig toolchain under
> `Abyssion-Legacy-of-Volion/artifacts/abyssion-legacy-of-volion/native/toolchain/`, which also
> carries the project-local Odin toolchain. The removed web sources are archived outside the
> repository at `/home/daytona/archives/abyssion-web-2026-10-07/`. The authoritative language
> policy is
> `Abyssion-Legacy-of-Volion/artifacts/abyssion-legacy-of-volion/docs/LANGUAGE_POLICY.md`.

An indie action RPG in active development. The retired browser build was a vertical slice
(Village Haven, the Dangerous Territory enemy band, the trial arena, six weapons — iron sword,
dual daggers, M1887, crossbow, water staff, resonance core — a Fighter/Mage archetype system
with five skills per weapon, checkpoints and respawn, loot drops, quests and dialogue, an
in-game HUD editor, a 30-real-minute day cycle with zone-based fog, and ambient wildlife).
That implementation used React, React Three Fiber and Rapier, with the world, characters,
weapons, enemies and HUD assembled entirely from procedural Three.js primitives — no imported
models, no skinned meshes, no animation clips, so every pose and every swing was a per-frame
transform write. A single Zustand store was the authoritative gameplay state and carried the
save/global-settings contract. This section is kept only as a historical migration reference.

The project is now native-only. See `native/` for the C++/SDL prototype and CMake build output.
The removed web sources are archived outside the repository at
`/home/daytona/archives/abyssion-web-2026-10-07/`.

## Repository layout

The git root is the **outer** directory; the workspace is the **inner** directory; the
running app is the **artifact**.

```
<repo root>                                        ← OUTER (git root)
├── README.md                                      ← this file
├── LICENSE                                        ← MIT License
└── Abyssion-Legacy-of-Volion/                     ← INNER (workspace root)
    ├── package.json                               ← workspace scripts, preinstall guard
    ├── pnpm-workspace.yaml / pnpm-lock.yaml
    ├── tsconfig.base.json / tsconfig.json
    ├── attached_assets/                           ← task briefs and pasted brief attachments
    ├── native/                                    ← C++/SDL prototype + CMake build output
    │   └── toolchain/                             ← project-local Zig + Odin toolchain
    ├── scripts/                                   ← workspace utility package
    ├── tmp/
    ├── lib/                                       ← shared workspace packages
    │   ├── api-spec/
    │   ├── api-client-react/
    │   ├── api-zod/
    │   └── db/
    └── artifacts/abyssion-legacy-of-volion/       ← ARTIFACT (the native app)
        ├── docs/
        │   ├── art-spec.md                        ← the locked art direction
        │   └── LANGUAGE_POLICY.md                 ← authoritative language policy
        └── src/
            ├── components/game/                   ← gameplay and scene (retired)
            │   └── enemies/                       ← BaseEnemy + six enemy types
            └── lib/                               ← store, content and tuning data
```

`native/` and `attached_assets/` are not part of the web build. Nothing in `src/` imports from
either of them.

## Prerequisites

- **Node.js 20.19+ or 22.12+** — required by Vite 7, which this workspace pins.
- **pnpm** — the workspace requires it. A `preinstall` guard in the inner `package.json` aborts
  the install with `Use pnpm instead` if it is run by npm or yarn. There is no `engines` field,
  so any current pnpm release works (the workspace was last run on pnpm 10 and Node 22).

### Why not npm

The artifact's `package.json` depends on `"@workspace/api-client-react": "workspace:*"`, a pnpm
workspace protocol specifier that npm cannot resolve. `npm install` in the artifact directory
fails; use pnpm from the inner (workspace) root.

## Install

From the inner workspace root:

```bash
cd Abyssion-Legacy-of-Volion
pnpm install
```

## Develop

`vite.config.ts` **hard-requires both `PORT` and `BASE_PATH`** and throws
(`PORT environment variable is required but was not provided.` /
`BASE_PATH environment variable is required but was not provided.`) if either is missing — this
applies to `dev`, `build` and `preview` alike, because the values are read when the config is
loaded. The dev server binds `0.0.0.0` and uses `strictPort`, so the port must be free.

From the inner workspace root:

```bash
cd Abyssion-Legacy-of-Volion/artifacts/abyssion-legacy-of-volion
PORT=3000 BASE_PATH=/ pnpm run dev
```

That runs `vite --config vite.config.ts --host 0.0.0.0`. `BASE_PATH` becomes the app's `base`,
so serve it at the path you passed (`BASE_PATH=/` → `http://localhost:3000/`).

## Build

Still requires both environment variables:

```bash
cd Abyssion-Legacy-of-Volion/artifacts/abyssion-legacy-of-volion
PORT=3000 BASE_PATH=/ pnpm run build
```

That runs `vite build --config vite.config.ts` and writes static output to
`artifacts/abyssion-legacy-of-volion/dist/public`. `pnpm run serve` serves that output with
`vite preview` (same two variables, same `0.0.0.0` binding).

## Typecheck

Per artifact:

```bash
cd Abyssion-Legacy-of-Volion/artifacts/abyssion-legacy-of-volion
pnpm run typecheck          # tsc -p tsconfig.json --noEmit
```

Across the whole workspace, including the `lib/` packages:

```bash
cd Abyssion-Legacy-of-Volion
pnpm run typecheck          # tsc --build for lib/, then per-artifact typecheck
pnpm run build              # typecheck, then every workspace package build
```

## Where the art spec lives

`Abyssion-Legacy-of-Volion/artifacts/abyssion-legacy-of-volion/docs/art-spec.md`

It is the locked, authoritative art direction ("Pixelated Semi-Stylized"): the cel/toon shader
model and its three tone bands, the 2 px outline rule, the 96×96 px texture cap, the 16-colour
palette, the two permitted post-process effects, the per-zone mood table, the sky rule, the
material swap plan, the performance budget and the non-goals. Art implementation work reads it
instead of re-deciding; it is only superseded by a new spec session.

## Where the game code lives

`Abyssion-Legacy-of-Volion/artifacts/abyssion-legacy-of-volion/src`

- Gameplay and scene components: `src/components/game/`
- Enemy implementations: `src/components/game/enemies/`
- Game state, content and tuning data: `src/lib/`
- UI primitives (shadcn/ui): `src/components/ui/` *(retired)*

## Language policy

The authoritative language policy lives at
`Abyssion-Legacy-of-Volion/artifacts/abyssion-legacy-of-volion/docs/LANGUAGE_POLICY.md`. It
defines the current polyglot contract: C/C++ for the implementation, C at the ABI boundary,
Rust for memory-safe subsystems, and project-local Zig and Odin toolchains under
`native/toolchain/`.

## License
MIT License. See [`LICENSE`](LICENSE) for details.

## Contact for Feature Request
Whatsapp: https://wa.me/+6282229753236
Tiktok: Ezrobyte
