#pragma once

#include <math/Scalar.hpp>
#include <math/Vec3.hpp>

namespace abyssion { namespace math {

struct Vec4
{
    Scalar x;
    Scalar y;
    Scalar z;
    Scalar w;
};

constexpr Vec4 operator+(Vec4 a, Vec4 b)
{
    return Vec4{a.x + b.x, a.y + b.y, a.z + b.z, a.w + b.w};
}

constexpr Vec4 operator-(Vec4 a, Vec4 b)
{
    return Vec4{a.x - b.x, a.y - b.y, a.z - b.z, a.w - b.w};
}

constexpr Vec4 operator*(Vec4 v, Scalar s)
{
    return Vec4{v.x * s, v.y * s, v.z * s, v.w * s};
}

constexpr Vec4 operator*(Scalar s, Vec4 v)
{
    return Vec4{v.x * s, v.y * s, v.z * s, v.w * s};
}

constexpr Vec4 operator/(Vec4 v, Scalar s)
{
    return Vec4{v.x / s, v.y / s, v.z / s, v.w / s};
}

constexpr Vec4 operator-(Vec4 v)
{
    return Vec4{-v.x, -v.y, -v.z, -v.w};
}

constexpr Vec4& operator+=(Vec4& a, Vec4 b)
{
    a.x += b.x;
    a.y += b.y;
    a.z += b.z;
    a.w += b.w;
    return a;
}

constexpr Vec4& operator-=(Vec4& a, Vec4 b)
{
    a.x -= b.x;
    a.y -= b.y;
    a.z -= b.z;
    a.w -= b.w;
    return a;
}

constexpr Vec4& operator*=(Vec4& v, Scalar s)
{
    v.x *= s;
    v.y *= s;
    v.z *= s;
    v.w *= s;
    return v;
}

constexpr bool operator==(Vec4 a, Vec4 b)
{
    return a.x == b.x && a.y == b.y && a.z == b.z && a.w == b.w;
}

constexpr bool operator!=(Vec4 a, Vec4 b)
{
    return !(a == b);
}

constexpr Scalar dot(Vec4 a, Vec4 b)
{
    return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

constexpr Scalar length_squared(Vec4 v)
{
    return dot(v, v);
}

constexpr Vec3 xyz(Vec4 v)
{
    return Vec3{v.x, v.y, v.z};
}

constexpr Vec4 from_xyz_w(Vec3 v, Scalar w)
{
    return Vec4{v.x, v.y, v.z, w};
}

constexpr Vec4 lerp(Vec4 a, Vec4 b, Scalar t)
{
    return Vec4{a.x + (b.x - a.x) * t,
                a.y + (b.y - a.y) * t,
                a.z + (b.z - a.z) * t,
                a.w + (b.w - a.w) * t};
}

// std::sqrt is not constexpr in C++17 and this batch's file scope has no
// Vec4.cpp, so length and normalize stay non-constexpr inline functions.
inline Scalar length(Vec4 v)
{
    return detail::sqrt_scalar(length_squared(v));
}

// Returns Vec4{0, 0, 0, 0} when the input length is below epsilon.
inline Vec4 normalize(Vec4 v)
{
    const Scalar len = length(v);
    if (len < epsilon) {
        return Vec4{0.0f, 0.0f, 0.0f, 0.0f};
    }
    return Vec4{v.x / len, v.y / len, v.z / len, v.w / len};
}

}}
