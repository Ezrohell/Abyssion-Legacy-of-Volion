#include "app/display.h"
#include <cstdio>

namespace abyssion { namespace app {

Display make_display(int width, int height, Uint64 flags) {
    Display d;
    d.window = SDL_CreateWindow("Abyssion: Legacy of Volion", width, height, flags);
    if (d.window == nullptr) {
        std::fprintf(stderr, "SDL_CreateWindow failed: %s\n", SDL_GetError());
        return d;
    }
    d.renderer = SDL_CreateRenderer(d.window, nullptr);
    if (d.renderer == nullptr) {
        std::fprintf(stderr, "SDL_CreateRenderer failed: %s\n", SDL_GetError());
        SDL_DestroyWindow(d.window);
        d.window = nullptr;
    }
    return d;
}

void destroy_display(Display &display) {
    if (display.renderer != nullptr) {
        SDL_DestroyRenderer(display.renderer);
        display.renderer = nullptr;
    }
    if (display.window != nullptr) {
        SDL_DestroyWindow(display.window);
        display.window = nullptr;
    }
}

} } // namespace abyssion::app
