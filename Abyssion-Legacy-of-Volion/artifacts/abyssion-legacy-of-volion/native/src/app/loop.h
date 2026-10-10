#ifndef BABSION_NATIVE_APP_LOOP_H
#define BABSION_NATIVE_APP_LOOP_H

#include <SDL3/SDL.h>
#include "app/display.h"

namespace abyssion { namespace app {

// Returns 0 on clean shutdown, non-zero on an SDL failure.
// max_seconds > 0 limits the run to that many seconds and then returns 0
// without waiting for a quit event; 0 runs until close or escape.
// Keyboard and mouse state is sampled through the input subsystem each
// frame; escape or a quit request ends the run.
// dump_path non-null captures the presented frame with SDL_RenderReadPixels,
// writes it with SDL_SaveBMP, and returns 0 after that single frame.
int run_loop(Display &display, double max_seconds = 0.0, const char *dump_path = nullptr);

} } // namespace abyssion::app

#endif
