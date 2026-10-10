#include "app/input.h"

namespace abyssion { namespace app {

void processEvents(InputState &state) {
    SDL_Event event;
    while (SDL_PollEvent(&event)) {
        switch (event.type) {
        case SDL_EVENT_QUIT:
            state.quitRequested = true;
            break;
        case SDL_EVENT_KEY_DOWN:
            if (event.key.scancode < SDL_SCANCODE_COUNT) {
                state.keys[event.key.scancode] = true;
            }
            break;
        case SDL_EVENT_KEY_UP:
            if (event.key.scancode < SDL_SCANCODE_COUNT) {
                state.keys[event.key.scancode] = false;
            }
            break;
        case SDL_EVENT_MOUSE_BUTTON_DOWN:
            if (event.button.button >= 1 && event.button.button <= 8) {
                state.mouseButtons[event.button.button - 1] = true;
            }
            break;
        case SDL_EVENT_MOUSE_BUTTON_UP:
            if (event.button.button >= 1 && event.button.button <= 8) {
                state.mouseButtons[event.button.button - 1] = false;
            }
            break;
        case SDL_EVENT_MOUSE_MOTION:
            state.mouseX = event.motion.x;
            state.mouseY = event.motion.y;
            break;
        default:
            break;
        }
    }
}

bool isKeyPressed(const InputState &state, SDL_Scancode scancode) {
    return scancode < SDL_SCANCODE_COUNT && state.keys[scancode];
}

bool isKeyJustPressed(const InputState &state, const InputState &prev,
                      SDL_Scancode scancode) {
    return isKeyPressed(state, scancode) && !isKeyPressed(prev, scancode);
}

} } // namespace abyssion::app
