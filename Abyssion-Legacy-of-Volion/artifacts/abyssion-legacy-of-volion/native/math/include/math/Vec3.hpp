#pragma once

#include <math/Scalar.hpp>

namespace abyssion { namespace math {

namespace detail {

// Hand-rolled scalar square root: the wasm32-freestanding target is compiled
// without a C++ standard library, so std::sqrt is unavailable. The value is
// scaled into [0.25, 4) by powers of four, refined with Newton-Raphson, then
// scaled back, which keeps the iteration count independent of the magnitude.
inline Scalar sqrt_scalar(Scalar value)
{
    if (value != value) {
        return value; // NaN propagates, as sqrt(NaN) does
    }
    if (value <= 0.0f) {
        return 0.0f; // zero and negative inputs, neither reachable from length
    }
    if (value > 3.402823466e38f) {
        return value; // +infinity, and sqrt(+infinity) is +infinity
    }
    Scalar scaled = value;
    Scalar factor = 1.0f;
    while (scaled >= 4.0f) {
        scaled *= 0.25f;
        factor *= 2.0f;
    }
    while (scaled < 0.25f) {
        scaled *= 4.0f;
        factor *= 0.5f;
    }
    Scalar guess = scaled;
    for (int i = 0; i < 12; ++i) {
        guess = 0.5f * (guess + scaled / guess);
    }
    return guess * factor;
}

} // namespace detail

struct Vec3
{
    Scalar x;
    Scalar y;
    Scalar z;
};

constexpr Vec3 operator+(Vec3 a, Vec3 b)
{
    return Vec3{a.x + b.x, a.y + b.y, a.z + b.z};
}

constexpr Vec3 operator-(Vec3 a, Vec3 b)
{
    return Vec3{a.x - b.x, a.y - b.y, a.z - b.z};
}

constexpr Vec3 operator*(Vec3 v, Scalar s)
{
    return Vec3{v.x * s, v.y * s, v.z * s};
}

constexpr Vec3 operator*(Scalar s, Vec3 v)
{
    return Vec3{v.x * s, v.y * s, v.z * s};
}

constexpr Vec3 operator/(Vec3 v, Scalar s)
{
    return Vec3{v.x / s, v.y / s, v.z / s};
}

constexpr Vec3 operator-(Vec3 v)
{
    return Vec3{-v.x, -v.y, -v.z};
}

constexpr Vec3& operator+=(Vec3& a, Vec3 b)
{
    a.x += b.x;
    a.y += b.y;
    a.z += b.z;
    return a;
}

constexpr Vec3& operator-=(Vec3& a, Vec3 b)
{
    a.x -= b.x;
    a.y -= b.y;
    a.z -= b.z;
    return a;
}

constexpr Vec3& operator*=(Vec3& v, Scalar s)
{
    v.x *= s;
    v.y *= s;
    v.z *= s;
    return v;
}

constexpr bool operator==(Vec3 a, Vec3 b)
{
    return a.x == b.x && a.y == b.y && a.z == b.z;
}

constexpr bool operator!=(Vec3 a, Vec3 b)
{
    return !(a == b);
}

constexpr Scalar dot(Vec3 a, Vec3 b)
{
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

constexpr Scalar length_squared(Vec3 v)
{
    return dot(v, v);
}

constexpr Vec3 cross(Vec3 a, Vec3 b)
{
    return Vec3{a.y * b.z - a.z * b.y,
                a.z * b.x - a.x * b.z,
                a.x * b.y - a.y * b.x};
}

constexpr Vec3 lerp(Vec3 a, Vec3 b, Scalar t)
{
    return Vec3{a.x + (b.x - a.x) * t,
                a.y + (b.y - a.y) * t,
                a.z + (b.z - a.z) * t};
}

// std::sqrt is not constexpr in C++17 and this batch's file scope has no
// Vec3.cpp, so length and normalize stay non-constexpr inline functions.
inline Scalar length(Vec3 v)
{
    return detail::sqrt_scalar(length_squared(v));
}

// Returns Vec3{0, 0, 0} when the input length is below epsilon.
inline Vec3 normalize(Vec3 v)
{
    const Scalar len = length(v);
    if (len < epsilon) {
        return Vec3{0.0f, 0.0f, 0.0f};
    }
    return Vec3{v.x / len, v.y / len, v.z / len};
}

}}
