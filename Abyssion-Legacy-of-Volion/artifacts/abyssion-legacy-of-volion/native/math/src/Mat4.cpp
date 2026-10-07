#include <math/Mat4.hpp>

namespace abyssion { namespace math {

constexpr Scalar determinant(Mat4 m)
{
    // Cofactor expansion along row 0, with each 3x3 minor expanded
    // along its own first row.
    Scalar det = 0.0f;
    for (int c0 = 0; c0 < 4; ++c0) {
        int col[3] = {0, 0, 0};
        int n = 0;
        for (int c = 0; c < 4; ++c) {
            if (c != c0) {
                col[n] = c;
                ++n;
            }
        }
        const Scalar a00 = m.m[col[0] * 4 + 1];
        const Scalar a01 = m.m[col[1] * 4 + 1];
        const Scalar a02 = m.m[col[2] * 4 + 1];
        const Scalar a10 = m.m[col[0] * 4 + 2];
        const Scalar a11 = m.m[col[1] * 4 + 2];
        const Scalar a12 = m.m[col[2] * 4 + 2];
        const Scalar a20 = m.m[col[0] * 4 + 3];
        const Scalar a21 = m.m[col[1] * 4 + 3];
        const Scalar a22 = m.m[col[2] * 4 + 3];
        const Scalar minor = a00 * (a11 * a22 - a12 * a21) -
                             a01 * (a10 * a22 - a12 * a20) +
                             a02 * (a10 * a21 - a11 * a20);
        det += (c0 % 2 == 0 ? minor : -minor) * m.m[c0 * 4 + 0];
    }
    return det;
}

Mat4 inverse(Mat4 m)
{
    // Standard cofactor method: entry (r, c) of the inverse is the
    // cofactor of (c, r) divided by the determinant, and each cofactor
    // is a signed 3x3 minor expanded along its first row.
    const Scalar det = determinant(m);
    const Scalar mag = det < 0.0f ? -det : det;
    if (mag < epsilon) {
        return zero();
    }

    Mat4 result = zero();
    for (int r = 0; r < 4; ++r) {
        for (int c = 0; c < 4; ++c) {
            // Minor of m with row c and column r removed.
            int rows[3] = {0, 0, 0};
            int cols[3] = {0, 0, 0};
            int nr = 0;
            int nc = 0;
            for (int k = 0; k < 4; ++k) {
                if (k != c) {
                    rows[nr] = k;
                    ++nr;
                }
                if (k != r) {
                    cols[nc] = k;
                    ++nc;
                }
            }
            const Scalar a00 = m.m[cols[0] * 4 + rows[0]];
            const Scalar a01 = m.m[cols[1] * 4 + rows[0]];
            const Scalar a02 = m.m[cols[2] * 4 + rows[0]];
            const Scalar a10 = m.m[cols[0] * 4 + rows[1]];
            const Scalar a11 = m.m[cols[1] * 4 + rows[1]];
            const Scalar a12 = m.m[cols[2] * 4 + rows[1]];
            const Scalar a20 = m.m[cols[0] * 4 + rows[2]];
            const Scalar a21 = m.m[cols[1] * 4 + rows[2]];
            const Scalar a22 = m.m[cols[2] * 4 + rows[2]];
            const Scalar minor = a00 * (a11 * a22 - a12 * a21) -
                                 a01 * (a10 * a22 - a12 * a20) +
                                 a02 * (a10 * a21 - a11 * a20);
            const Scalar cofactor = ((r + c) % 2 == 0) ? minor : -minor;
            result.m[c * 4 + r] = cofactor / det;
        }
    }
    return result;
}

Mat4 look_at(Vec3 eye, Vec3 center, Vec3 up)
{
    // Right-handed view matrix: the camera looks down its local -z.
    const Vec3 forward = normalize(center - eye);
    const Vec3 right = normalize(cross(forward, up));
    const Vec3 true_up = cross(right, forward);

    Mat4 result = identity();
    result.m[0] = right.x;
    result.m[1] = true_up.x;
    result.m[2] = -forward.x;
    result.m[4] = right.y;
    result.m[5] = true_up.y;
    result.m[6] = -forward.y;
    result.m[8] = right.z;
    result.m[9] = true_up.z;
    result.m[10] = -forward.z;
    result.m[12] = -dot(right, eye);
    result.m[13] = -dot(true_up, eye);
    result.m[14] = dot(forward, eye);
    return result;
}

}}
