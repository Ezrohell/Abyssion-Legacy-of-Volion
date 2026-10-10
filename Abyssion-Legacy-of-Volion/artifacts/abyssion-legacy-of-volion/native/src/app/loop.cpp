#include "app/loop.h"

#include <cmath>
#include <cstddef>
#include <cstdio>

#include "app/input.h"
#include "app/render.h"

namespace abyssion { namespace app {

namespace {

// The test sprite lives beside the source tree at native/assets/; resolve it
// relative to the executable (build/abyssion_native) so the window runs from
// any working directory, and fall back to the relative path when SDL cannot
// report the base path. SDL caches the base path internally and keeps
// ownership of it, so the returned pointer must not be freed here.
void spriteAssetPath(char *out, std::size_t out_size) {
    const char *base = SDL_GetBasePath();
    if (base != nullptr) {
        std::snprintf(out, out_size, "%s../assets/test_sprite.png", base);
    } else {
        std::snprintf(out, out_size, "assets/test_sprite.png");
    }
}

} // namespace

int run_loop(Display &display, double max_seconds, const char *dump_path) {
    bool quit = false;
    bool dumped = false;
    int64_t prev_counter = SDL_GetPerformanceCounter();

    // Input: `current` accumulates this frame's events, `previous` holds the
    // completed state of the frame before it so edges can be compared.
    InputState current{};
    InputState previous{};

    // Rendering: one renderer for the whole run; it owns the sprite texture.
    Renderer renderer(display.renderer);
    char sprite_path[512];
    spriteAssetPath(sprite_path, sizeof(sprite_path));
    SDL_Texture *sprite_texture = renderer.loadTexture(sprite_path);

    // Visible content: a 64x64 test sprite drawn centred and rotating
    // clockwise at 90 degrees per second, starting from a 45 degree tilt so
    // a single captured frame already shows it off-axis. This replaces the
    // plain moving rectangle of the previous milestone.
    constexpr float sprite_size = 64.0f;
    constexpr float rotation_speed = 90.0f; // degrees per second
    float angle = 45.0f;

    while (!quit) {
        processEvents(current);

        // A window close (SDL_EVENT_QUIT) or a fresh escape press ends the
        // run. The escape edge is recorded on the snapshot as a quit request
        // too, so both paths end through the same flag.
        if (isKeyJustPressed(current, previous, SDL_SCANCODE_ESCAPE)) {
            current.quitRequested = true;
        }

        if (current.quitRequested) {
            quit = true;
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

            int window_width = 0;
            int window_height = 0;
            if (SDL_GetWindowSizeInPixels(display.window, &window_width,
                                          &window_height) == false) {
                std::fprintf(stderr, "SDL_GetWindowSizeInPixels failed: %s\n",
                             SDL_GetError());
                quit = true;
                continue;
            }

            angle = std::fmod(angle + rotation_speed * delta, 360.0f);

            Sprite sprite;
            sprite.texture = sprite_texture;
            sprite.src = SDL_FRect{0.0f, 0.0f, sprite_size, sprite_size};
            sprite.dst = SDL_FRect{
                0.5f * (static_cast<float>(window_width) - sprite_size),
                0.5f * (static_cast<float>(window_height) - sprite_size),
                sprite_size,
                sprite_size,
            };
            sprite.angle = angle;
            sprite.center = SDL_FPoint{0.5f * sprite_size, 0.5f * sprite_size};
            sprite.flip = SDL_FLIP_NONE;

            renderer.begin();
            renderer.draw(sprite);
            renderer.end();

            // --dump: after the first frame is presented, read the current
            // render target back with SDL_RenderReadPixels, hold it as an
            // SDL_PIXELFORMAT_ARGB8888 surface and write it with SDL_SavePNG,
            // SDL 3.4.18's built-in PNG encoder, so the window is captured
            // without any external screenshot tool or BMP conversion helper.
            // A failed save is logged and the run shuts down normally.
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
                if (SDL_SavePNG(frame, dump_path) == false) {
                    std::fprintf(stderr, "SDL_SavePNG failed: %s\n",
                                 SDL_GetError());
                } else {
                    std::fprintf(stderr,
                                 "Abyssion native: dumped frame to %s\n",
                                 dump_path);
                }
                if (frame != read_back) {
                    SDL_DestroySurface(frame);
                }
                SDL_DestroySurface(read_back);
                dumped = true;
                quit = true;
            }

            previous = current;
        }
    }

    return 0;
}

} } // namespace abyssion::app
