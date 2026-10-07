#!/bin/sh
# Cross-compile abyssion_math to a WebAssembly module with the project-local
# Zig 0.13.0 toolchain.
#
# Target and flags proved at STEP 1 of M2W1D2 #2:
#   --target=wasm32-freestanding   required by the ticket
#   -O2                            required by the ticket
#   -Wl,--no-entry                 this clang has no bare --no-entry driver
#                                  option, and a freestanding module has no
#                                  _start to call
#   -Wl,--export=<name>            the named exports a JS
#                                  WebAssembly.instantiate call needs;
#                                  -shared/-fPIC is rejected on this target
#                                  with "dynamic linking unavailable on the
#                                  specified target"
#
# Only abyssion_math is cross-compiled here: SDL, stb, and Dear ImGui are not
# linked into this module, and the native CMake build is untouched.

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
native_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
out_dir="$script_dir/out"
zig_cxx="$native_dir/toolchain/bin/zig-cxx"

mkdir -p "$out_dir"

exec "$zig_cxx" \
    --target=wasm32-freestanding \
    -O2 \
    -std=c++17 \
    -Wl,--no-entry \
    -Wl,--export=abyssion_vec3_length \
    -Wl,--export=abyssion_dot_quat_axis_z \
    -I "$native_dir/math/include" \
    "$native_dir/math/src/Vec2.cpp" \
    "$native_dir/math/src/Mat4.cpp" \
    "$native_dir/math/src/Quat.cpp" \
    "$script_dir/exports.cpp" \
    -o "$out_dir/abyssion_math.wasm"
