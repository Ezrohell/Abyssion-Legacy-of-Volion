#ifndef BABSION_NATIVE_APP_LOOP_H
#define BABSION_NATIVE_APP_LOOP_H

#include <SDL3/SDL.h>
#include "app/display.h"

namespace abyssion { namespace app {

// Returns 0 on clean shutdown, non-zero on an SDL failure.
// max_seconds > 0 limits the run to that many seconds and then returns 0
// without waiting for a quit event; 0 runs until close or escape.
int run_loop(Display &display, double max_seconds = 0.0);

} } // namespace abyssion::app

#endif
