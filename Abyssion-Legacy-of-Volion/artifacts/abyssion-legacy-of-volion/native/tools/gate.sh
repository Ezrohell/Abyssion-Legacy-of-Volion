#!/bin/sh
# Minimal native gate for the Abyssion repository. Runs the native
# configure, build, smoke, math_selftest, and ctest chain from a single
# entry point so a CI hook or a developer can gate a change without
# remembering each command. Exits non-zero on the first failure.

set -eu

cd "$(dirname "$0")/.."

LOG_DIR="build"
LOG="$LOG_DIR/gate.log"
mkdir -p "$LOG_DIR"

run() {
    step="$1"
    shift
    echo "=== $step ===" | tee -a "$LOG"
    # POSIX sh has no pipefail, so piping the step command to tee would mask
    # its exit status (dash reports tee's status, which is always 0). Stage
    # the step output in a file so the real status survives, then replay it
    # to the console and the log.
    tf="$LOG_DIR/.gate-step.log"
    if "$@" > "$tf" 2>&1; then
        status=0
    else
        status=$?
    fi
    cat "$tf" | tee -a "$LOG"
    rm -f "$tf"
    if [ "$status" -ne 0 ]; then
        echo "GATE FAILED at $step (exit $status)" | tee -a "$LOG"
        exit "$status"
    fi
}

: > "$LOG"

run cmake-configure cmake -S . -B build -G Ninja
run cmake-build     cmake --build build -j 4
run smoke           ./build/abyssion_native --smoke
run math-selftest   ./build/math_selftest
run ctest           ctest --test-dir build --output-on-failure

echo "GATE PASSED"
