#ifndef BABSION_NATIVE_APP_RENDER_H
#define BABSION_NATIVE_APP_RENDER_H

#include <SDL3/SDL.h>
#include <vector>

namespace abyssion { namespace app {

// One textured quad: source rectangle, destination rectangle, rotation in
// degrees, the rotation centre relative to the destination rectangle's
// top-left corner, and SDL's flip mode.
struct Sprite {
    SDL_Texture *texture = nullptr;
    SDL_FRect src{};
    SDL_FRect dst{};
    float angle = 0.0f;
    SDL_FPoint center{};
    SDL_FlipMode flip = SDL_FLIP_NONE;
};

// Immediate-style wrapper around one SDL_Renderer. The frame loop owns a
// single instance: begin() starts a frame, draw() queues sprites, end()
// renders the queue in order and presents. Textures returned by
// loadTexture() are owned by the renderer and destroyed with it. A sprite
// whose texture is null is drawn as the magenta placeholder rectangle, so a
// missing asset still produces a visible frame.
class Renderer {
public:
    explicit Renderer(SDL_Renderer *sdlRenderer);
    ~Renderer();

    Renderer(const Renderer &) = delete;
    Renderer &operator=(const Renderer &) = delete;

    // Loads a BMP or PNG through SDL_LoadSurface and uploads it with
    // SDL_CreateTextureFromSurface. Returns null on failure (logged).
    SDL_Texture *loadTexture(const char *path);

    void begin();
    void draw(const Sprite &sprite);
    void end();

private:
    SDL_Renderer *sdlRenderer_ = nullptr;
    std::vector<SDL_Texture *> textures_;
    std::vector<Sprite> sprites_;
};

} } // namespace abyssion::app

#endif
