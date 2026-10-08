#ifndef BABSION_NATIVE_APP_DISPLAY_H
#define BABSION_NATIVE_APP_DISPLAY_H

#include <SDL3/SDL.h>
#include <SDL3/SDL_render.h>

namespace abyssion { namespace app {

struct Display {
    SDL_Window *window = nullptr;
    SDL_Renderer *renderer = nullptr;
};

Display make_display(int width, int height, Uint64 flags);
void destroy_display(Display &display);

} } // namespace abyssion::app

#endif
