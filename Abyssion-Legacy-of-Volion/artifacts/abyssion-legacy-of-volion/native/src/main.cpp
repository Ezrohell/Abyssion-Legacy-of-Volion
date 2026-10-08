#include <SDL3/SDL.h>
#include <cstdio>
#include <string>

#include <stb_image.h>
#include <stb_truetype.h>
#include <imgui.h>

#include <SDL3_mixer/SDL_mixer.h>

#ifdef BABSION_NATIVE_WINDOW
#include <SDL3/SDL_render.h>
#include <SDL3/SDL_keyboard.h>

static int run_game_loop() {
    constexpr int window_width = 1280;
    constexpr int window_height = 720;
    constexpr SDL_WindowFlags window_flags = SDL_WINDOW_RESIZABLE;

    SDL_Window *window =
        SDL_CreateWindow("Abyssion: Legacy of Volion", window_width,
                         window_height, window_flags);
    if (window == nullptr) {
        std::fprintf(stderr, "SDL_CreateWindow failed: %s\n",
                      SDL_GetError());
        return 1;
    }

    SDL_Renderer *renderer =
        SDL_CreateRenderer(window, nullptr);
    if (renderer == nullptr) {
        std::fprintf(stderr, "SDL_CreateRenderer failed: %s\n",
                      SDL_GetError());
        SDL_DestroyWindow(window);
        return 1;
    }

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

            SDL_SetRenderDrawColor(renderer, 31, 31, 31, 255);
            if (SDL_RenderClear(renderer) == false) {
                std::fprintf(stderr, "SDL_RenderClear failed: %s\n",
                              SDL_GetError());
                quit = true;
                continue;
            }
            if (SDL_RenderPresent(renderer) == false) {
                std::fprintf(stderr, "SDL_RenderPresent failed: %s\n",
                              SDL_GetError());
                quit = true;
                continue;
            }
        }
    }

    SDL_DestroyRenderer(renderer);
    SDL_DestroyWindow(window);
    SDL_Quit();
    return 0;
}
#endif

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
            // SDL 3.2.0 has no SDL_version struct: SDL_GetVersion() returns the
            // linked library version as an int, decoded with SDL's own macros.
            const int version = SDL_GetVersion();

            // Tiny 2x2, 24-bit BMP embedded as a static byte array, 70 bytes total:
            // a 14-byte BITMAPFILEHEADER, a 40-byte BITMAPINFOHEADER, and a 16-byte
            // pixel payload. Smallest correct header for this size: biWidth=2,
            // biHeight=2, biPlanes=1, biBitCount=24, biCompression=0, biSizeImage=16.
            // The pixel payload holds four RGB triplets stored as BGR (BMP byte order)
            // with each row padded to a 4-byte boundary (6 data bytes + 2 pad bytes).
            // Both left-column pixels share one color, so the first decoded pixel
            // matches the first triplet regardless of the BMP row order.
            constexpr unsigned char bmp[70] = {
                // BITMAPFILEHEADER (14 bytes)
                0x42, 0x4D,             // bfType = 'BM'
                0x46, 0x00, 0x00, 0x00, // bfSize = 70
                0x00, 0x00,             // bfReserved1 = 0
                0x00, 0x00,             // bfReserved2 = 0
                0x36, 0x00, 0x00, 0x00, // bfOffBits = 54
                // BITMAPINFOHEADER (40 bytes)
                0x28, 0x00, 0x00, 0x00, // biSize = 40
                0x02, 0x00, 0x00, 0x00, // biWidth = 2
                0x02, 0x00, 0x00, 0x00, // biHeight = 2
                0x01, 0x00,             // biPlanes = 1
                0x18, 0x00,             // biBitCount = 24
                0x00, 0x00, 0x00, 0x00, // biCompression = 0 (BI_RGB)
                0x10, 0x00, 0x00, 0x00, // biSizeImage = 16
                0x00, 0x00, 0x00, 0x00, // biXPelsPerMeter = 0
                0x00, 0x00, 0x00, 0x00, // biYPelsPerMeter = 0
                0x00, 0x00, 0x00, 0x00, // biClrUsed = 0
                0x00, 0x00, 0x00, 0x00, // biClrImportant = 0
                // Pixel payload (16 bytes): BGR triplets, two per row.
                0x33, 0x22, 0x11, 0x66, 0x55, 0x44, 0x00, 0x00, // row 0
                0x33, 0x22, 0x11, 0x99, 0x88, 0x77, 0x00, 0x00, // row 1
            };
            static_assert(sizeof(bmp) == 70, "embedded BMP must be exactly 70 bytes");

            // First RGB triplet defined above, read back as R, G, B.
            constexpr unsigned char first_red = 0x11;
            constexpr unsigned char first_green = 0x22;
            constexpr unsigned char first_blue = 0x33;

            std::printf("Abyssion native skeleton\n");
            std::printf("SDL version %d.%d.%d\n",
                        SDL_VERSIONNUM_MAJOR(version),
                        SDL_VERSIONNUM_MINOR(version),
                        SDL_VERSIONNUM_MICRO(version));

            int width = 0;
            int height = 0;
            int channels = 0;
            unsigned char *pixels = stbi_load_from_memory(
                bmp, (int)sizeof(bmp), &width, &height, &channels, 3);
            if (pixels == nullptr) {
                std::printf("stb_image decode failed\n");
                SDL_Quit();
                return 1;
            }

            if (pixels[0] != first_red || pixels[1] != first_green ||
                pixels[2] != first_blue) {
                std::printf("stb_image first pixel mismatch\n");
                stbi_image_free(pixels);
                SDL_Quit();
                return 1;
            }
            stbi_image_free(pixels);

            std::printf("stb_image decoded %dx%dx%d\n", width, height, channels);

            // A non-null buffer that is not a valid font drives the deterministic
            // upstream failure path: stbtt__isfont reads the first four bytes, the
            // ttcf tag check fails, and the offset lookup returns -1. A null buffer
            // is not used because stb_truetype v1.26 dereferences it unconditionally.
            constexpr unsigned char not_a_font[4] = {0x00, 0x00, 0x00, 0x00};
            static_assert(sizeof(not_a_font) == 4, "non-font probe must be 4 bytes");

            const int font_offset = stbtt_GetFontOffsetForIndex(not_a_font, 0);
            if (font_offset != -1) {
                std::printf("stb_truetype non-font offset mismatch\n");
                SDL_Quit();
                return 1;
            }

            std::printf("stb_truetype non-font offset %d\n", font_offset);

            // Headless Dear ImGui probe: one frame built entirely in memory. No
            // backend is initialised, no window or GPU device exists, and the default
            // font atlas is built by the core library on first use.
            IMGUI_CHECKVERSION();
            ImGui::CreateContext();
            ImGuiIO &io = ImGui::GetIO();
            io.BackendFlags |= ImGuiBackendFlags_RendererHasTextures;
            io.DisplaySize = ImVec2(1280.0f, 720.0f);
            io.DeltaTime = 1.0f / 60.0f;
            ImGui::NewFrame();
            ImGui::Begin("abyssion_headless_probe");
            ImGui::Text("Abyssion ImGui headless probe");
            ImGui::End();
            ImGui::Render();
            ImGui::NewFrame();
            ImGui::Begin("abyssion_headless_probe");
            ImGui::Text("Abyssion ImGui headless probe");
            ImGui::End();
            ImGui::Render();
            ImDrawData *draw_data = ImGui::GetDrawData();
            const int reported_vertices = draw_data->TotalVtxCount;
            const int reported_indices = draw_data->TotalIdxCount;
            int measured_vertices = 0;
            int measured_indices = 0;
            for (int list_index = 0; list_index < draw_data->CmdListsCount;
                 ++list_index) {
                const ImDrawList *cmd_list = draw_data->CmdLists[list_index];
                measured_vertices += cmd_list->VtxBuffer.Size;
                measured_indices += cmd_list->IdxBuffer.Size;
            }
            ImGui::DestroyContext();

            if (measured_vertices <= 0) {
                std::printf("imgui frame vertex count not positive\n");
                SDL_Quit();
                return 1;
            }
            if (measured_indices <= 0) {
                std::printf("imgui frame index count not positive\n");
                SDL_Quit();
                return 1;
            }

            std::printf("imgui frame vertices %d indices %d\n", measured_vertices,
                        measured_indices);
            std::printf("imgui version %d\n", IMGUI_VERSION_NUM);

            // Headless SDL_Mixer probe: the library is initialised, its version is
            // queried, and it is shut down again. No audio subsystem is opened, no
            // audio device, mixer, audio, or track object is created, and no audio
            // file is read.
            const int mixer_init = MIX_Init();
            if (mixer_init == 0) {
                std::printf("SDL_mixer init failed: %s\n", SDL_GetError());
                SDL_Quit();
                return 1;
            }
            // SDL 3 removed the SDL_version struct, so SDL_MIXER_VERSION is no longer
            // a struct-filling macro: it is the encoded integer built by SDL_VERSIONNUM
            // from the three version components the mixer header declares.
            const int mixer_header = SDL_VERSIONNUM(SDL_MIXER_MAJOR_VERSION,
                                                    SDL_MIXER_MINOR_VERSION,
                                                    SDL_MIXER_MICRO_VERSION);
            const int mixer_linked = MIX_Version();
            MIX_Quit();

            std::printf("SDL_mixer header %d linked %d\n", mixer_header, mixer_linked);

            SDL_Quit();
            return 0;
        }
    }

    if (window_mode) {
        return run_game_loop();
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
