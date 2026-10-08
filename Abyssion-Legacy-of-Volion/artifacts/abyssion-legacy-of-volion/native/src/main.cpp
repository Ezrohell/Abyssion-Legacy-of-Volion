#include <SDL3/SDL.h>
#include <cstdio>
#include <string>

#include "app/display.h"
#include "app/loop.h"
#include "app/smoke.h"

int main(int argc, char **argv) {
    SDL_Init(0);

#ifdef BABSION_NATIVE_WINDOW
    bool window_mode = false;
    for (int i = 1; i < argc; ++i) {
        if (argv[i] == std::string("--window")) {
            window_mode = true;
            break;
        }
        if (argv[i] == std::string("--smoke")) {
            const int exit_code = abyssion::app::run_smoke();
            SDL_Quit();
            return exit_code;
        }
    }

    if (window_mode) {
        abyssion::app::Display display =
            abyssion::app::make_display(1280, 720, SDL_WINDOW_RESIZABLE);
        if (display.window == nullptr || display.renderer == nullptr) {
            SDL_Quit();
            return 1;
        }
        const int loop_exit = abyssion::app::run_loop(display);
        abyssion::app::destroy_display(display);
        SDL_Quit();
        return loop_exit;
    }

    std::fprintf(stderr,
                 "Abyssion native skeleton: use --smoke or --window\n");
    SDL_Quit();
    return 1;
#else
    if (argc > 1) {
        std::fprintf(stderr,
                      "Abyssion native skeleton: unknown argument\n");
        SDL_Quit();
        return 1;
    }

    std::fprintf(stderr,
                 "Abyssion native skeleton: no window support compiled in\n");
    SDL_Quit();
    return 1;
#endif
}
