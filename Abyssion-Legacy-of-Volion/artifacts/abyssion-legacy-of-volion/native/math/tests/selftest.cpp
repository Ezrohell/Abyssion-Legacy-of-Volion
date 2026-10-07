#include <math/Math.hpp>

// Keep the assertions live even if a future build configuration defines
// NDEBUG: this file's whole purpose is to execute them.
#ifdef NDEBUG
#undef NDEBUG
#endif

#include <cassert>
#include <cstdio>
#include <cmath>

using namespace abyssion::math;

static bool approx(Vec2 a, Vec2 b)
{
    return approx_equal(a.x, b.x) && approx_equal(a.y, b.y);
}

static bool approx(Vec3 a, Vec3 b)
{
    return approx_equal(a.x, b.x) && approx_equal(a.y, b.y) &&
           approx_equal(a.z, b.z);
}

static bool approx(Vec4 a, Vec4 b)
{
    return approx_equal(a.x, b.x) && approx_equal(a.y, b.y) &&
           approx_equal(a.z, b.z) && approx_equal(a.w, b.w);
}

static bool approx(Quat a, Quat b)
{
    return approx_equal(a.x, b.x) && approx_equal(a.y, b.y) &&
           approx_equal(a.z, b.z) && approx_equal(a.w, b.w);
}

static bool approx(Mat4 a, Mat4 b)
{
    for (int i = 0; i < 16; ++i) {
        if (!approx_equal(a.m[i], b.m[i])) {
            return false;
        }
    }
    return true;
}

int main()
{
    // Vec2: addition, subtraction, scalar multiplication, dot, length.
    const Vec2 v2a{1.0f, 2.0f};
    const Vec2 v2b{3.0f, 4.0f};
    assert(approx(v2a + v2b, Vec2{4.0f, 6.0f}));
    assert(approx(v2b - v2a, Vec2{2.0f, 2.0f}));
    assert(approx(v2a * 2.0f, Vec2{2.0f, 4.0f}));
    assert(approx(2.0f * v2a, Vec2{2.0f, 4.0f}));
    assert(approx_equal(dot(v2a, v2b), 11.0f));
    assert(approx_equal(length(Vec2{3.0f, 4.0f}), 5.0f));

    // Vec3: addition, subtraction, scalar multiplication, dot, length.
    const Vec3 v3a{1.0f, 2.0f, 3.0f};
    const Vec3 v3b{4.0f, 5.0f, 6.0f};
    assert(approx(v3a + v3b, Vec3{5.0f, 7.0f, 9.0f}));
    assert(approx(v3b - v3a, Vec3{3.0f, 3.0f, 3.0f}));
    assert(approx(v3a * 3.0f, Vec3{3.0f, 6.0f, 9.0f}));
    assert(approx_equal(dot(v3a, v3b), 32.0f));
    assert(approx_equal(length(Vec3{3.0f, 4.0f, 0.0f}), 5.0f));

    // Vec4: addition, subtraction, scalar multiplication, dot, length.
    const Vec4 v4a{1.0f, 2.0f, 3.0f, 4.0f};
    const Vec4 v4b{5.0f, 6.0f, 7.0f, 8.0f};
    assert(approx(v4a + v4b, Vec4{6.0f, 8.0f, 10.0f, 12.0f}));
    assert(approx(v4b - v4a, Vec4{4.0f, 4.0f, 4.0f, 4.0f}));
    assert(approx(v4a * 4.0f, Vec4{4.0f, 8.0f, 12.0f, 16.0f}));
    assert(approx_equal(dot(v4a, v4b), 70.0f));
    assert(approx_equal(length(Vec4{1.0f, 2.0f, 2.0f, 4.0f}), 5.0f));

    // Vec3 cross product is anti-commutative.
    const Vec3 cx = cross(v3a, v3b);
    const Vec3 cx_rev = cross(v3b, v3a);
    assert(approx(cx, Vec3{-3.0f, 6.0f, -3.0f}));
    assert(approx(cx_rev, -cx));
    assert(approx(cx + cx_rev, Vec3{0.0f, 0.0f, 0.0f}));

    // normalize produces the expected unit vector.
    assert(approx(normalize(Vec3{3.0f, 4.0f, 0.0f}),
                  Vec3{0.6f, 0.8f, 0.0f}));

    // Mat4 identity times a known Vec4 returns that Vec4.
    const Vec4 v4{1.0f, 2.0f, 3.0f, 4.0f};
    assert(approx(identity() * v4, v4));

    // Mat4 multiplication is associative on a fixed triple.
    const Mat4 ta = translation(Vec3{1.0f, 2.0f, 3.0f});
    const Mat4 ra = rotation_z(0.7f);
    const Mat4 sa = scale(Vec3{2.0f, 2.0f, 2.0f});
    assert(approx((ta * ra) * sa, ta * (ra * sa)));

    // transpose(transpose(M)) equals M.
    const Mat4 m = ta * ra * sa;
    assert(approx(transpose(transpose(m)), m));

    // inverse(M) * M equals the identity for a fixed invertible matrix.
    assert(approx(inverse(m) * m, identity()));
    assert(approx(m * inverse(m), identity()));

    // determinant(identity()) is 1.
    assert(approx_equal(determinant(identity()), 1.0f));

    // Quat identity rotates any vector to itself.
    const Vec3 probe{1.0f, 2.0f, 3.0f};
    assert(approx(rotate(quat_identity(), probe), probe));

    // from_axis_angle({0, 0, 1}, pi / 2) rotates {1, 0, 0} to {0, 1, 0}.
    const Quat quarter_turn =
        from_axis_angle(Vec3{0.0f, 0.0f, 1.0f}, pi / 2.0f);
    assert(approx(rotate(quarter_turn, Vec3{1.0f, 0.0f, 0.0f}),
                  Vec3{0.0f, 1.0f, 0.0f}));

    // to_mat4 and rotate agree for the same rotation.
    const Quat q = from_axis_angle(Vec3{0.0f, 0.0f, 1.0f}, 0.7f);
    const Vec4 via_matrix = to_mat4(q) * from_xyz_w(probe, 0.0f);
    assert(approx(xyz(via_matrix), rotate(q, probe)));

    // slerp halfway between opposite-ish rotations is unit length.
    const Quat halfway = slerp(quat_identity(),
                               from_axis_angle(Vec3{0.0f, 0.0f, 1.0f}, pi),
                               0.5f);
    assert(approx_equal(length(halfway), 1.0f));

    std::printf("math selftest passed\n");
    return 0;
}
