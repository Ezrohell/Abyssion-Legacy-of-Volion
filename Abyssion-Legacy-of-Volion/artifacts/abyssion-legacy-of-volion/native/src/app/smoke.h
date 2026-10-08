#ifndef BABSION_NATIVE_APP_SMOKE_H
#define BABSION_NATIVE_APP_SMOKE_H

namespace abyssion { namespace app {

// Returns 0 on success, non-zero on failure. Must print the same seven-line
// output as the pre-refactor binary when invoked via --smoke.
int run_smoke();

} } // namespace abyssion::app

#endif
