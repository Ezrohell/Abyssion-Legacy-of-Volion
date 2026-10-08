#include "app/loop.h"
#include <cmath>
#include <cstdio>

namespace abyssion { namespace app {

int run_loop(Display &display, double max_seconds, const char *dump_path) {
    bool quit = false;
    bool dumped = false;
    int64_t prev_counter = SDL_GetPerformanceCounter();

    // Visible content: a filled rectangle that advances across the window at a
    // fixed rate and wraps at the right edge, so two captures taken seconds
    // apart differ. It is drawn on top of the #1f1f1f clear colour.
    constexpr float rect_width = 160.0f;
    constexpr float rect_height = 90.0f;
    constexpr float rect_speed = 240.0f; // pixels per second
    // Start flush with the left edge: draw_x = rect_x - rect_width = 0.
    float rect_x = rect_width;

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

        if (!quit && max_seconds > 0.0) {
            const double elapsed =
                static_cast<double>(SDL_GetTicks()) / 1000.0;
            if (elapsed >= max_seconds) {
                quit = true;
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

            SDL_SetRenderDrawColor(display.renderer, 31, 31, 31, 255);
            if (SDL_RenderClear(display.renderer) == false) {
                std::fprintf(stderr, "SDL_RenderClear failed: %s\n",
                             SDL_GetError());
                quit = true;
                continue;
            }

            int window_width = 0;
            int window_height = 0;
            if (SDL_GetWindowSizeInPixels(display.window, &window_width,
                                          &window_height) == false) {
                std::fprintf(stderr, "SDL_GetWindowSizeInPixels failed: %s\n",
                             SDL_GetError());
                quit = true;
                continue;
            }

            const float travel =
                static_cast<float>(window_width) + rect_width;
            rect_x = std::fmod(rect_x + rect_speed * delta, travel);
            const SDL_FRect rect = {
                rect_x - rect_width,
                0.5f * (static_cast<float>(window_height) - rect_height),
                rect_width,
                rect_height,
            };
            SDL_SetRenderDrawColor(display.renderer, 155, 155, 155, 255);
            if (SDL_RenderFillRect(display.renderer, &rect) == false) {
                std::fprintf(stderr, "SDL_RenderFillRect failed: %s\n",
                             SDL_GetError());
                quit = true;
                continue;
            }

            if (SDL_RenderPresent(display.renderer) == false) {
                std::fprintf(stderr, "SDL_RenderPresent failed: %s\n",
                             SDL_GetError());
                quit = true;
                continue;
            }

            // --dump: after the first frame is presented, read the current
            // render target back with SDL_RenderReadPixels, hold it as an
            // SDL_PIXELFORMAT_ARGB8888 surface and write it with
            // SDL_SaveBMP, so the window is captured without any external
            // screenshot tool. The process then leaves; dump failure
            // returns 1.
            if (dump_path != nullptr && !dumped) {
                SDL_Surface *read_back =
                    SDL_RenderReadPixels(display.renderer, nullptr);
                if (read_back == nullptr) {
                    std::fprintf(stderr, "SDL_RenderReadPixels failed: %s\n",
                                 SDL_GetError());
                    return 1;
                }
                SDL_Surface *frame = read_back;
                if (read_back->format != SDL_PIXELFORMAT_ARGB8888) {
                    frame = SDL_ConvertSurface(read_back,
                                               SDL_PIXELFORMAT_ARGB8888);
                    if (frame == nullptr) {
                        std::fprintf(stderr,
                                     "SDL_ConvertSurface failed: %s\n",
                                     SDL_GetError());
                        SDL_DestroySurface(read_back);
                        return 1;
                    }
                }
                bool dump_ok = true;
                if (SDL_SaveBMP(frame, dump_path) == false) {
                    std::fprintf(stderr, "SDL_SaveBMP failed: %s\n",
                                 SDL_GetError());
                    dump_ok = false;
                } else {
                    std::fprintf(stderr,
                                 "Abyssion native: dumped frame to %s\n",
                                 dump_path);
                }
                if (frame != read_back) {
                    SDL_DestroySurface(frame);
                }
                SDL_DestroySurface(read_back);
                if (dump_ok == false) {
                    return 1;
                }
                dumped = true;
                quit = true;
            }
        }
    }

    return 0;
}

} } // namespace abyssion::app
