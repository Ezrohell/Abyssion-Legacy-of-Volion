#include "app/render.h"

#include <cstdio>

namespace abyssion { namespace app {

Renderer::Renderer(SDL_Renderer *sdlRenderer) : sdlRenderer_(sdlRenderer) {}

Renderer::~Renderer() {
    for (SDL_Texture *texture : textures_) {
        SDL_DestroyTexture(texture);
    }
    textures_.clear();
}

SDL_Texture *Renderer::loadTexture(const char *path) {
    SDL_Surface *surface = SDL_LoadSurface(path);
    if (surface == nullptr) {
        std::fprintf(stderr, "SDL_LoadSurface failed for %s: %s\n", path,
                     SDL_GetError());
        return nullptr;
    }
    SDL_Texture *texture = nullptr;
    if (sdlRenderer_ != nullptr) {
        texture = SDL_CreateTextureFromSurface(sdlRenderer_, surface);
    }
    SDL_DestroySurface(surface);
    if (texture == nullptr) {
        std::fprintf(stderr, "SDL_CreateTextureFromSurface failed for %s: %s\n",
                     path, SDL_GetError());
        return nullptr;
    }
    textures_.push_back(texture);
    return texture;
}

void Renderer::begin() {
    sprites_.clear();
    SDL_SetRenderDrawColor(sdlRenderer_, 31, 31, 31, 255);
    if (SDL_RenderClear(sdlRenderer_) == false) {
        std::fprintf(stderr, "SDL_RenderClear failed: %s\n", SDL_GetError());
    }
}

void Renderer::draw(const Sprite &sprite) { sprites_.push_back(sprite); }

void Renderer::end() {
    for (const Sprite &sprite : sprites_) {
        if (sprite.texture != nullptr) {
            if (SDL_RenderTextureRotated(sdlRenderer_, sprite.texture,
                                         &sprite.src, &sprite.dst,
                                         sprite.angle, &sprite.center,
                                         sprite.flip) == false) {
                std::fprintf(stderr, "SDL_RenderTextureRotated failed: %s\n",
                             SDL_GetError());
            }
        } else {
            // Magenta placeholder so a failed texture load is still visible.
            SDL_SetRenderDrawColor(sdlRenderer_, 255, 0, 255, 255);
            if (SDL_RenderFillRect(sdlRenderer_, &sprite.dst) == false) {
                std::fprintf(stderr, "SDL_RenderFillRect failed: %s\n",
                             SDL_GetError());
            }
        }
    }
    if (SDL_RenderPresent(sdlRenderer_) == false) {
        std::fprintf(stderr, "SDL_RenderPresent failed: %s\n",
                     SDL_GetError());
    }
}

} } // namespace abyssion::app
