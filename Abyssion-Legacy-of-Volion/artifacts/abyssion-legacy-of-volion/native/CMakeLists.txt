cmake_minimum_required(VERSION 3.22)

# Project-local Zig toolchain: pinned 0.17.0, extracted at
# native/toolchain/zig-0.17.0/. The wrapper scripts invoke it as `zig cc` and
# `zig c++`; they are selected before project() so CMake adopts them as
# the C and C++ compilers.
set(CMAKE_C_COMPILER "${CMAKE_CURRENT_SOURCE_DIR}/toolchain/bin/zig-cc")
set(CMAKE_CXX_COMPILER "${CMAKE_CURRENT_SOURCE_DIR}/toolchain/bin/zig-cxx")

project(abyssion_native LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# --- SDL 3.4.18 (M2D6 #2) ----------------------------------------------------
# Vendored in source form at third_party/SDL/ from the official release asset
# SDL3-3.4.18.tar.gz (release-3.4.18), sha256
# 9c75cf16330322c217dedd2e0609f1124f1b54b8633e763467b4684d0f4334a3.
# It is built from source by the same project-local Zig wrappers: no
# FetchContent, no ExternalProject, no download at configure time.
# Static-only and headless: this skeleton proves the toolchain and the link
# path, it does not open a window and does not create a renderer.
# The option names below are exactly the ones the vendored CMakeLists.txt
# declares (lines 397-401): SDL_SHARED and SDL_STATIC via
# cmake_dependent_option, SDL_TEST_LIBRARY via option, SDL_TESTS via
# dep_option. SDL 3.4.18 still declares no bare SDL_TEST option, so that
# name is not set here, and the 3.4.x SDL_X11_XTEST option is switched off
# separately below.
set(SDL_SHARED OFF CACHE BOOL "" FORCE)
set(SDL_STATIC ON CACHE BOOL "" FORCE)
set(SDL_TEST_LIBRARY OFF CACHE BOOL "" FORCE)
set(SDL_TESTS OFF CACHE BOOL "" FORCE)
# SDL_WAYLAND is switched off for this environment only: SDL 3.4.18's Wayland
# backend needs libwayland >= 1.22 / wayland-protocols >= 1.33 headers
# (WL_POINTER_AXIS_RELATIVE_DIRECTION_*, WL_SURFACE_PREFERRED_BUFFER_SCALE_*),
# while this host ships libwayland 1.20.0 and older wayland-protocols. This
# skeleton is headless and never opens a window, so the backend is not built.
# Option name proven present in the vendored CMakeLists.txt, line 355
# (dep_option SDL_WAYLAND "Use Wayland video driver" ${UNIX_SYS} "SDL_VIDEO" OFF).
set(SDL_WAYLAND OFF CACHE BOOL "" FORCE)

# SDL_X11_XTEST is switched off for this environment only: SDL 3.4.x added
# the option with a default of ON, and its guard requires
# X11/extensions/XTest.h which this host lacks (only the runtime library
# libXtst.so.6 is present). This skeleton is headless and never opens a
# window, so the X11 test extension is not needed.
# Option name proven present in the vendored CMakeLists.txt, line 350
# (dep_option(SDL_X11_XTEST "Enable XTest support" ON SDL_X11 OFF)).
set(SDL_X11_XTEST OFF CACHE BOOL "" FORCE)
add_subdirectory(third_party/SDL SDL-build)

# --- SDL_Mixer 3.2.4 (M2W1D2 #2) ---------------------------------------------
# Vendored in source form at third_party/SDL_mixer/ from the official release
# asset SDL3_mixer-3.2.4.tar.gz (tag release-3.2.4), sha256
# 182a07c745375e113dc740d43964ff21b0be29f29f59876c4dbc4db3d32f6901, extracted
# with the top-level directory stripped. It is built from source by the same
# project-local Zig wrappers as SDL and Dear ImGui: no FetchContent, no
# ExternalProject, no download at configure time, and no external codec
# library. Every option name below is declared in the vendored
# third_party/SDL_mixer/CMakeLists.txt.
# Only the decoders implemented in SDL_mixer itself stay enabled: WAVE, AIFF,
# VOC, AU, and the bundled timidity MIDI output. Every external codec backend
# (MP3, FLAC, Ogg Vorbis, Opus, MOD, WavPack, GME) and every external MIDI
# synth is forced off, together with the vendored-dependency path, the tests,
# the examples, and the install targets.
# BUILD_SHARED_LIBS is forced off so the vendored CMakeLists.txt builds its
# static target SDL3_mixer-static instead of SDL3_mixer-shared; a shared build
# would look for SDL3::SDL3-shared, which this static-only SDL tree does not
# provide.
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(SDLMIXER_INSTALL OFF CACHE BOOL "" FORCE)
set(SDLMIXER_TESTS OFF CACHE BOOL "" FORCE)
set(SDLMIXER_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SDLMIXER_VENDORED OFF CACHE BOOL "" FORCE)
set(SDLMIXER_MP3 OFF CACHE BOOL "" FORCE)
set(SDLMIXER_FLAC OFF CACHE BOOL "" FORCE)
set(SDLMIXER_MOD OFF CACHE BOOL "" FORCE)
set(SDLMIXER_OPUS OFF CACHE BOOL "" FORCE)
set(SDLMIXER_VORBIS_STB OFF CACHE BOOL "" FORCE)
set(SDLMIXER_VORBIS_VORBISFILE OFF CACHE BOOL "" FORCE)
set(SDLMIXER_VORBIS_TREMOR OFF CACHE BOOL "" FORCE)
set(SDLMIXER_WAVPACK OFF CACHE BOOL "" FORCE)
set(SDLMIXER_GME OFF CACHE BOOL "" FORCE)
set(SDLMIXER_MIDI_FLUIDSYNTH OFF CACHE BOOL "" FORCE)
add_subdirectory(third_party/SDL_mixer SDL_mixer-build)

# abyssion_mixer: the project-local name for the vendored mixer.
# The vendored CMakeLists.txt already compiles and configures exactly one
# static library, SDL3_mixer-static, carrying its per-codec DECODER_* compile
# definitions, its private include directories, and its public include
# directory. This target therefore wraps that archive instead of recompiling
# the same sources into a second one, re-exports the mixer include directory,
# and carries SDL3::SDL3-static.
add_library(abyssion_mixer INTERFACE)
target_include_directories(abyssion_mixer INTERFACE
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/SDL_mixer/include)
target_link_libraries(abyssion_mixer INTERFACE SDL3_mixer-static SDL3::SDL3-static)

# --- stb headers (M2W1D1 #1) -------------------------------------------------
# Header-only vendored sources at third_party/stb/: stb_image.h (v2.30) and
# stb_truetype.h (v1.26), downloaded once from the official nothings/stb raw
# URLs and byte-identical to upstream at the pinned commits, never patched.
# A single C implementation translation unit (third_party/stb/stb_impl.c)
# defines the two STB_*_IMPLEMENTATION macros and includes both headers; no
# other translation unit compiles them. This target links nothing: no SDL,
# no math, no third-party library.
add_library(abyssion_stb STATIC third_party/stb/stb_impl.c)
target_include_directories(abyssion_stb PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/stb)

# --- Dear ImGui (M2W1D1 #1, imgui vendoring) ---------------------------------
# Vendored at third_party/imgui/ from the official ocornut/imgui repository,
# pinned at commit 4989b4c75491f2908aa3072ed3041245e6f98c09 (the default
# branch HEAD at resolution time, not the docking branch). Ten files: the
# four translation units below plus imgui.h, imconfig.h, imgui_internal.h,
# imstb_rectpack.h, imstb_textedit.h and imstb_truetype.h, all byte-identical to the pinned
# commit and never patched. The .cpp files are listed directly as target
# sources; there is no aggregator translation unit, no imgui_impl_* backend
# source, and no IMGUI_ macro is defined here. This target links nothing:
# no SDL, no stb, no math.
add_library(abyssion_imgui STATIC
    third_party/imgui/imgui.cpp
    third_party/imgui/imgui_draw.cpp
    third_party/imgui/imgui_tables.cpp
    third_party/imgui/imgui_widgets.cpp)

target_include_directories(abyssion_imgui PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/third_party/imgui)

add_executable(abyssion_native
    src/main.cpp
    src/app/display.cpp
    src/app/loop.cpp
    src/app/smoke.cpp)
target_include_directories(abyssion_native PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(abyssion_native PRIVATE SDL3::SDL3-static abyssion_stb abyssion_imgui abyssion_mixer)

# Window and frame loop are now in src/app/*.cpp. The default entry point runs
# the seven-line smoke probe; --window runs the SDL3 window and frame loop. The
# smoke output is preserved byte-for-byte under --smoke.
target_compile_options(abyssion_native PRIVATE -DBABSION_NATIVE_WINDOW=1)

# --- Math library (M2D6 #2 batch 2) -----------------------------------------
# Self-contained C++17 math library: vectors, matrices, quaternions. It links
# nothing and includes nothing from third_party/, so the renderer and physics
# subsystems can use it without pulling SDL in.
add_library(abyssion_math STATIC
    math/src/Vec2.cpp
    math/src/Mat4.cpp
    math/src/Quat.cpp)

target_include_directories(abyssion_math PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/math/include)

add_executable(math_selftest math/tests/selftest.cpp)
target_link_libraries(math_selftest PRIVATE abyssion_math)

enable_testing()
add_test(NAME math_selftest COMMAND math_selftest)