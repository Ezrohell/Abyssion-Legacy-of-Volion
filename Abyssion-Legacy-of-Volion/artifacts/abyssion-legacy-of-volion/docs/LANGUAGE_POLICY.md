# Language Policy

The Abyssion engine is a native C/C++ project. Five languages are approved for
the repository. No high-level language outside this set is permitted, and the
previous JavaScript and TypeScript web pipeline has been removed.

## Approved languages

### C++

Primary implementation language. World, physics, rendering, and gameplay
subsystems are written in C++.

### C

Boundary and third-party integration language. It is used where a stable,
plain ABI is required: vendored libraries, exported symbols, and the seam
between the engine and external code.

### Rust

Memory-safe subsystem implementation language. Rust owns subsystems where
memory safety is worth the second toolchain, rather than being used for
general gameplay code.

### Zig

Compiler and linker, provided as a project-local toolchain under
`native/toolchain/`. Zig does not appear in shipped runtime code; it exists
only to build the C and C++ sources.

### Odin

Approved language, role to be determined at a later session. Odin is part of
the approved set but no subsystem has been assigned to it yet, and no shipped
code uses it at this time.

## Removed languages

### JavaScript

Removed. The project ships a native executable, not a browser application, and
nothing in the approved set is transpiled to JavaScript.

### TypeScript

Removed, together with every transpiled superset of JavaScript. Static typing
is provided by C++ and Rust in the approved set.

### Web frameworks and runtimes

Removed. Any framework, bundler, or runtime that depends on JavaScript or
TypeScript is outside the approved set, so it cannot be reintroduced under a
different name.

### Any other high-level language

Removed. A language that is not one of the five approved languages above is
not approved for future work in this repository.
