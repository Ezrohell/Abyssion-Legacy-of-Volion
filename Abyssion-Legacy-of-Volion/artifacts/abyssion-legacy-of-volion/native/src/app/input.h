#ifndef BABSION_NATIVE_APP_INPUT_H
#define BABSION_NATIVE_APP_INPUT_H

#include <SDL3/SDL.h>

namespace abyssion { namespace app {

// Per-frame input snapshot. The loop owns two instances: `current` collects
// this frame's SDL events and `previous` holds the completed state of the
// frame before it, so edge queries can compare the two snapshots.
struct InputState {
    bool keys[SDL_SCANCODE_COUNT] = {};
    bool mouseButtons[8] = {};
    float mouseX = 0.0f;
    float mouseY = 0.0f;
    bool quitRequested = false;
};

// Polls every pending SDL event into `state`: key state, the first eight
// mouse buttons, mouse position, and the quit request. Other events are
// consumed and ignored.
void processEvents(InputState &state);

// True while the scancode is held in `state`.
bool isKeyPressed(const InputState &state, SDL_Scancode scancode);

// True only on the frame the scancode transitions from released in `prev`
// to held in `state`.
bool isKeyJustPressed(const InputState &state, const InputState &prev,
                      SDL_Scancode scancode);

} } // namespace abyssion::app

#endif
