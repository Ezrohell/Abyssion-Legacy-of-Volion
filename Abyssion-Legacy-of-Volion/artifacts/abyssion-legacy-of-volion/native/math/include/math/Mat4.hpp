#pragma once

#include <math/Scalar.hpp>
#include <math/Vec3.hpp>
#include <math/Vec4.hpp>

namespace abyssion { namespace math {

// Column-major 4x4 matrix: m[c * 4 + r] is column c, row r, matching the
// OpenGL/WebGPU memory layout so the array can be uploaded directly.
struct Mat4
{
    Scalar m[16];
};

constexpr Mat4 identity()
{
    return Mat4{{1.0f, 0.0f, 0.0f, 0.0f,
                 0.0f, 1.0f, 0.0f, 0.0f,
                 0.0f, 0.0f, 1.0f, 0.0f,
                 0.0f, 0.0f, 0.0f, 1.0f}};
}

constexpr Mat4 zero()
{
    return Mat4{{0.0f, 0.0f, 0.0f, 0.0f,
                 0.0f, 0.0f, 0.0f, 0.0f,
                 0.0f, 0.0f, 0.0f, 0.0f,
                 0.0f, 0.0f, 0.0f, 0.0f}};
}

constexpr Mat4 operator*(Mat4 a, Mat4 b)
{
    Mat4 result = zero();
    for (int c = 0; c < 4; ++c) {
        for (int r = 0; r < 4; ++r) {
            Scalar sum = 0.0f;
            for (int k = 0; k < 4; ++k) {
                sum += a.m[k * 4 + r] * b.m[c * 4 + k];
            }
            result.m[c * 4 + r] = sum;
        }
    }
    return result;
}

constexpr Vec4 operator*(Mat4 m, Vec4 v)
{
    return Vec4{
        m.m[0] * v.x + m.m[4] * v.y + m.m[8] * v.z + m.m[12] * v.w,
        m.m[1] * v.x + m.m[5] * v.y + m.m[9] * v.z + m.m[13] * v.w,
        m.m[2] * v.x + m.m[6] * v.y + m.m[10] * v.z + m.m[14] * v.w,
        m.m[3] * v.x + m.m[7] * v.y + m.m[11] * v.z + m.m[15] * v.w};
}

constexpr Mat4& operator*=(Mat4& a, Mat4 b)
{
    a = a * b;
    return a;
}

constexpr Mat4 transpose(Mat4 m)
{
    Mat4 result = zero();
    for (int c = 0; c < 4; ++c) {
        for (int r = 0; r < 4; ++r) {
            result.m[c * 4 + r] = m.m[r * 4 + c];
        }
    }
    return result;
}

// Standard cofactor-method inverse. Returns zero() when the magnitude of
// the determinant is below epsilon, so a singular matrix is detectable
// by testing the result against zero(). Defined in src/Mat4.cpp.
Mat4 inverse(Mat4 m);

// Cofactor expansion. Declared constexpr here and defined in
// src/Mat4.cpp with the other matrix implementations.
constexpr Scalar determinant(Mat4 m);

constexpr Mat4 translation(Vec3 t)
{
    Mat4 result = identity();
    result.m[12] = t.x;
    result.m[13] = t.y;
    result.m[14] = t.z;
    return result;
}

constexpr Mat4 scale(Vec3 s)
{
    Mat4 result = zero();
    result.m[0] = s.x;
    result.m[5] = s.y;
    result.m[10] = s.z;
    result.m[15] = 1.0f;
    return result;
}

constexpr Mat4 rotation_x(Scalar radians_value)
{
    const detail::SinCos sc =
        detail::sincos(static_cast<double>(radians_value));
    const Scalar s = static_cast<Scalar>(sc.s);
    const Scalar c = static_cast<Scalar>(sc.c);
    Mat4 result = identity();
    result.m[5] = c;
    result.m[6] = s;
    result.m[9] = -s;
    result.m[10] = c;
    return result;
}

constexpr Mat4 rotation_y(Scalar radians_value)
{
    const detail::SinCos sc =
        detail::sincos(static_cast<double>(radians_value));
    const Scalar s = static_cast<Scalar>(sc.s);
    const Scalar c = static_cast<Scalar>(sc.c);
    Mat4 result = identity();
    result.m[0] = c;
    result.m[2] = -s;
    result.m[8] = s;
    result.m[10] = c;
    return result;
}

constexpr Mat4 rotation_z(Scalar radians_value)
{
    const detail::SinCos sc =
        detail::sincos(static_cast<double>(radians_value));
    const Scalar s = static_cast<Scalar>(sc.s);
    const Scalar c = static_cast<Scalar>(sc.c);
    Mat4 result = identity();
    result.m[0] = c;
    result.m[1] = s;
    result.m[4] = -s;
    result.m[5] = c;
    return result;
}

// Right-handed perspective projection with the OpenGL/WebGPU clip
// convention: the camera looks down -z and z maps to [-1, 1].
constexpr Mat4 perspective(Scalar fov_y_radians, Scalar aspect,
                           Scalar near_plane, Scalar far_plane)
{
    // cot(fov_y / 2) replaces 1 / tan(fov_y / 2): std::tan is not
    // usable in C++17 constant expressions.
    const detail::SinCos half =
        detail::sincos(static_cast<double>(fov_y_radians) * 0.5);
    const Scalar f = static_cast<Scalar>(half.c / half.s);

    Mat4 result = zero();
    result.m[0] = f / aspect;
    result.m[5] = f;
    result.m[10] = (far_plane + near_plane) / (near_plane - far_plane);
    result.m[11] = -1.0f;
    result.m[14] = (2.0f * far_plane * near_plane) /
                   (near_plane - far_plane);
    return result;
}

// Right-handed orthographic projection with the OpenGL/WebGPU clip
// convention: z maps to [-1, 1].
constexpr Mat4 orthographic(Scalar left, Scalar right, Scalar bottom,
                            Scalar top, Scalar near_plane,
                            Scalar far_plane)
{
    Mat4 result = identity();
    result.m[0] = 2.0f / (right - left);
    result.m[5] = 2.0f / (top - bottom);
    result.m[10] = -2.0f / (far_plane - near_plane);
    result.m[12] = -(right + left) / (right - left);
    result.m[13] = -(top + bottom) / (top - bottom);
    result.m[14] = -(far_plane + near_plane) / (far_plane - near_plane);
    return result;
}

// Right-handed view matrix; up must not be parallel to (center - eye).
// Defined in src/Mat4.cpp.
Mat4 look_at(Vec3 eye, Vec3 center, Vec3 up);

}}
