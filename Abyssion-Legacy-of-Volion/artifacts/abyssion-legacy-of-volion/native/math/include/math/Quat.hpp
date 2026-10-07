#pragma once

#include <math/Scalar.hpp>
#include <math/Vec3.hpp>
#include <math/Mat4.hpp>

namespace abyssion { namespace math {

struct Quat
{
    Scalar x;
    Scalar y;
    Scalar z;
    Scalar w;
};

// NOTE: the unit quaternion constructor is named quat_identity() rather
// than identity() because Mat4.hpp already declares identity() in this
// namespace and C++ cannot overload two functions that differ only in
// their return type. The two headers are always included together via
// Math.hpp, so the rename is forced by the language, not a preference.
constexpr Quat quat_identity()
{
    return Quat{0.0f, 0.0f, 0.0f, 1.0f};
}

constexpr Quat operator*(Quat a, Quat b)
{
    return Quat{
        a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
        a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
        a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z};
}

constexpr Quat operator*(Quat q, Scalar s)
{
    return Quat{q.x * s, q.y * s, q.z * s, q.w * s};
}

constexpr Quat operator+(Quat a, Quat b)
{
    return Quat{a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w};
}

constexpr Quat operator-(Quat a, Quat b)
{
    return Quat{a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w};
}

constexpr Quat operator-(Quat q)
{
    return Quat{-q.x, -q.y, -q.z, -q.w};
}

constexpr Quat conjugate(Quat q)
{
    return Quat{-q.x, -q.y, -q.z, q.w};
}

constexpr Scalar dot(Quat a, Quat b)
{
    return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

constexpr Scalar length_squared(Quat q)
{
    return dot(q, q);
}

// std::sqrt is not constexpr in C++17, so length and normalize are
// declared here and defined in src/Quat.cpp.
Scalar length(Quat q);

// Returns quat_identity() when the input length is below epsilon.
Quat normalize(Quat q);

// axis must be unit length. Produces the rotation of radians_value
// about axis in the right-handed sense.
constexpr Quat from_axis_angle(Vec3 axis, Scalar radians_value)
{
    const detail::SinCos half =
        detail::sincos(static_cast<double>(radians_value) * 0.5);
    const Scalar s = static_cast<Scalar>(half.s);
    const Scalar c = static_cast<Scalar>(half.c);
    return Quat{axis.x * s, axis.y * s, axis.z * s, c};
}

// Extrinsic X-Y-Z: the rotation is applied about x, then y, then z, so
// the composed quaternion is qz * qy * qx.
constexpr Quat from_euler_xyz(Scalar rx, Scalar ry, Scalar rz)
{
    const detail::SinCos hx =
        detail::sincos(static_cast<double>(rx) * 0.5);
    const detail::SinCos hy =
        detail::sincos(static_cast<double>(ry) * 0.5);
    const detail::SinCos hz =
        detail::sincos(static_cast<double>(rz) * 0.5);
    const Quat qx{static_cast<Scalar>(hx.s), 0.0f, 0.0f,
                  static_cast<Scalar>(hx.c)};
    const Quat qy{0.0f, static_cast<Scalar>(hy.s), 0.0f,
                  static_cast<Scalar>(hy.c)};
    const Quat qz{0.0f, 0.0f, static_cast<Scalar>(hz.s),
                  static_cast<Scalar>(hz.c)};
    return qz * qy * qx;
}

// Optimised rotation of v by unit quaternion q:
// v + 2 * cross(q.xyz, cross(q.xyz, v) + q.w * v).
constexpr Vec3 rotate(Quat q, Vec3 v)
{
    const Vec3 axis{q.x, q.y, q.z};
    const Vec3 inner = cross(axis, v) + v * q.w;
    return v + cross(axis, inner) * 2.0f;
}

// Rotation matrix equivalent to rotate(), for multiplying through the
// Mat4 pipeline.
constexpr Mat4 to_mat4(Quat q)
{
    const Scalar xx = q.x * q.x;
    const Scalar yy = q.y * q.y;
    const Scalar zz = q.z * q.z;
    const Scalar xy = q.x * q.y;
    const Scalar xz = q.x * q.z;
    const Scalar yz = q.y * q.z;
    const Scalar xw = q.x * q.w;
    const Scalar yw = q.y * q.w;
    const Scalar zw = q.z * q.w;

    Mat4 result = identity();
    result.m[0] = 1.0f - 2.0f * (yy + zz);
    result.m[1] = 2.0f * (xy + zw);
    result.m[2] = 2.0f * (xz - yw);

    result.m[4] = 2.0f * (xy - zw);
    result.m[5] = 1.0f - 2.0f * (xx + zz);
    result.m[6] = 2.0f * (yz + xw);

    result.m[8] = 2.0f * (xz + yw);
    result.m[9] = 2.0f * (yz - xw);
    result.m[10] = 1.0f - 2.0f * (xx + yy);
    return result;
}

// Spherical linear interpolation along the shortest arc; falls back to
// normalised linear interpolation when |dot(a, b)| > 1 - epsilon.
// Defined in src/Quat.cpp.
Quat slerp(Quat a, Quat b, Scalar t);

}}
