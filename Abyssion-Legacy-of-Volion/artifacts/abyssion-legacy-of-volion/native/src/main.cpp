#include <SDL3/SDL.h>
#include <cstdio>
#include <cstdlib>
#include <string>

#include "app/display.h"
#include "app/loop.h"
#include "app/smoke.h"

int main(int argc, char **argv) {
    SDL_Init(0);

#ifdef BABSION_NATIVE_WINDOW
    bool window_mode = false;
    int preview_seconds = 0;
    const char *dump_path = nullptr;
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
        if (argv[i] == std::string("--preview")) {
            if (i + 1 >= argc) {
                std::fprintf(stderr,
                             "Abyssion native skeleton: --preview needs a "
                             "number of seconds\n");
                SDL_Quit();
                return 1;
            }
            preview_seconds = std::atoi(argv[i + 1]);
            if (preview_seconds <= 0) {
                std::fprintf(stderr,
                             "Abyssion native skeleton: --preview seconds "
                             "must be positive\n");
                SDL_Quit();
                return 1;
            }
            window_mode = true;
            break;
        }
        if (argv[i] == std::string("--dump")) {
            if (i + 1 >= argc) {
                std::fprintf(stderr,
                             "Abyssion native skeleton: --dump needs a file "
                             "path\n");
                SDL_Quit();
                return 1;
            }
            dump_path = argv[i + 1];
            window_mode = true;
            break;
        }
    }

    if (window_mode) {
        abyssion::app::Display display =
            abyssion::app::make_display(1280, 720, SDL_WINDOW_RESIZABLE);
        if (display.window == nullptr || display.renderer == nullptr) {
            SDL_Quit();
            return 1;
        }
        const int loop_exit =
            abyssion::app::run_loop(display, preview_seconds, dump_path);
        abyssion::app::destroy_display(display);
        SDL_Quit();
        return loop_exit;
    }

    std::fprintf(stderr,
                 "Abyssion native skeleton: use --smoke, --window, "
                 "--preview <seconds> or --dump <path>\n");
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
