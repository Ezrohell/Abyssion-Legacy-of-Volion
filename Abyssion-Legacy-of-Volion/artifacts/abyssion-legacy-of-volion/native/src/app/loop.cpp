#include "app/loop.h"
#include <cstdio>

namespace abyssion { namespace app {

int run_loop(Display &display) {
    bool quit = false;
    int64_t prev_counter = SDL_GetPerformanceCounter();

    while (!quit) {
        SDL_Event event;
        while (SDL_PollEvent(&event)) {
            if (event.type == SDL_EVENT_QUIT) {
                quit = true;
            } else if (event.type == SDL_EVENT_KEY_DOWN) {
                if (event.key.scancode == SDL_SCANCODE_ESCAPE) {
                    quit = true;
                }
            }
        }

        if (!quit) {
            const int64_t now = SDL_GetPerformanceCounter();
            const int64_t freq = SDL_GetPerformanceFrequency();
            float delta = 0.0f;
            if (freq > 0) {
                delta = static_cast<float>(now - prev_counter) /
                        static_cast<float>(freq);
            }
            prev_counter = now;

            (void)delta;

            SDL_SetRenderDrawColor(display.renderer, 31, 31, 31, 255);
            if (SDL_RenderClear(display.renderer) == false) {
                std::fprintf(stderr, "SDL_RenderClear failed: %s\n", SDL_GetError());
                quit = true;
                continue;
            }
            if (SDL_RenderPresent(display.renderer) == false) {
                std::fprintf(stderr, "SDL_RenderPresent failed: %s\n", SDL_GetError());
                quit = true;
                continue;
            }
        }
    }

    return 0;
}

} } // namespace abyssion::app
