#pragma once

#include <math/Scalar.hpp>

namespace abyssion { namespace math {

struct Vec2
{
    Scalar x;
    Scalar y;
};

constexpr Vec2 operator+(Vec2 a, Vec2 b)
{
    return Vec2{a.x + b.x, a.y + b.y};
}

constexpr Vec2 operator-(Vec2 a, Vec2 b)
{
    return Vec2{a.x - b.x, a.y - b.y};
}

constexpr Vec2 operator*(Vec2 v, Scalar s)
{
    return Vec2{v.x * s, v.y * s};
}

constexpr Vec2 operator*(Scalar s, Vec2 v)
{
    return Vec2{v.x * s, v.y * s};
}

constexpr Vec2 operator/(Vec2 v, Scalar s)
{
    return Vec2{v.x / s, v.y / s};
}

constexpr Vec2 operator-(Vec2 v)
{
    return Vec2{-v.x, -v.y};
}

constexpr Vec2& operator+=(Vec2& a, Vec2 b)
{
    a.x += b.x;
    a.y += b.y;
    return a;
}

constexpr Vec2& operator-=(Vec2& a, Vec2 b)
{
    a.x -= b.x;
    a.y -= b.y;
    return a;
}

constexpr Vec2& operator*=(Vec2& v, Scalar s)
{
    v.x *= s;
    v.y *= s;
    return v;
}

constexpr bool operator==(Vec2 a, Vec2 b)
{
    return a.x == b.x && a.y == b.y;
}

constexpr bool operator!=(Vec2 a, Vec2 b)
{
    return !(a == b);
}

constexpr Scalar dot(Vec2 a, Vec2 b)
{
    return a.x * b.x + a.y * b.y;
}

constexpr Scalar length_squared(Vec2 v)
{
    return dot(v, v);
}

constexpr Vec2 lerp(Vec2 a, Vec2 b, Scalar t)
{
    return Vec2{a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t};
}

// std::sqrt is not constexpr in C++17, so length and normalize are
// declared here and defined in src/Vec2.cpp.
Scalar length(Vec2 v);

// Returns Vec2{0, 0} when the input length is below epsilon.
Vec2 normalize(Vec2 v);

}}
