#ifndef BABSION_NATIVE_APP_LOOP_H
#define BABSION_NATIVE_APP_LOOP_H

#include <SDL3/SDL.h>
#include "app/display.h"

namespace abyssion { namespace app {

// Returns 0 on clean shutdown, non-zero on an SDL failure.
int run_loop(Display &display);

} } // namespace abyssion::app

#endif
