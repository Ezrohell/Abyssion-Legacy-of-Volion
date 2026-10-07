#pragma once

// Abyssion math library: scalar type, constants, and the small
// constexpr primitives shared by every other header. C++17 only, no
// third-party includes, no <numbers>, no <bit>, no <span>.

namespace abyssion { namespace math {

using Scalar = float;

constexpr Scalar pi = 3.14159265358979323846f;
constexpr Scalar two_pi = 6.28318530717958647692f;
constexpr Scalar half_pi = 1.57079632679489661923f;
constexpr Scalar epsilon = 1.0e-6f;

constexpr Scalar radians(Scalar degrees)
{
    return degrees * (pi / 180.0f);
}

constexpr Scalar degrees(Scalar radians_value)
{
    return radians_value * (180.0f / pi);
}

constexpr Scalar clamp(Scalar v, Scalar lo, Scalar hi)
{
    return v < lo ? lo : (v > hi ? hi : v);
}

constexpr Scalar lerp(Scalar a, Scalar b, Scalar t)
{
    return a + (b - a) * t;
}

constexpr bool approx_equal(Scalar a, Scalar b, Scalar eps = epsilon)
{
    const Scalar diff = a - b;
    return (diff < 0.0f ? -diff : diff) <= eps;
}

namespace detail {

// C++17 keeps <cmath> out of constant expressions: std::sin, std::cos,
// and std::tan are not constexpr, so the rotation and projection
// builders in Mat4.hpp and Quat.hpp cannot call them. The helpers below
// evaluate the sine and cosine series in double precision and fold at
// compile time for literal arguments. Input angles are expected in the
// modest range game code uses; the reduction stays accurate there to
// the full float mantissa.

struct SinCos
{
    double s;
    double c;
};

constexpr double pi_d = 3.14159265358979323846;
constexpr double half_pi_d = 1.57079632679489661923;

constexpr double sin_series(double x)
{
    // x - x^3/3! + x^5/5! - ... converges quickly for |x| <= pi/4.
    const double x2 = x * x;
    double sum = 0.0;
    double term = x;
    for (int n = 1; n <= 8; ++n) {
        sum += term;
        term = -term * x2 / static_cast<double>((2 * n) * (2 * n + 1));
    }
    return sum;
}

constexpr double cos_series(double x)
{
    // 1 - x^2/2! + x^4/4! - ... converges quickly for |x| <= pi/4.
    const double x2 = x * x;
    double sum = 0.0;
    double term = 1.0;
    for (int n = 1; n <= 8; ++n) {
        sum += term;
        term = -term * x2 / static_cast<double>((2 * n - 1) * (2 * n));
    }
    return sum;
}

constexpr SinCos sincos(double x)
{
    // Round x to the nearest multiple of pi/2, evaluate the series on
    // the remaining [-pi/4, pi/4] remainder, and select the quadrant.
    double scaled = x / half_pi_d;
    // Bound the turn count far below the long long range so the cast
    // below cannot overflow; inputs past this bound are already far
    // outside the range where the series approximation is meaningful.
    const double bound = 9.0e15;
    if (scaled > bound) {
        scaled = bound;
    } else if (scaled < -bound) {
        scaled = -bound;
    }
    const long long k =
        scaled >= 0.0 ? static_cast<long long>(scaled + 0.5)
                      : -static_cast<long long>(-scaled + 0.5);
    const double r = x - static_cast<double>(k) * half_pi_d;
    const double sr = sin_series(r);
    const double cr = cos_series(r);
    int q = static_cast<int>(k % 4);
    if (q < 0) {
        q += 4;
    }
    SinCos result = {0.0, 0.0};
    if (q == 0) {
        result.s = sr;
        result.c = cr;
    } else if (q == 1) {
        result.s = cr;
        result.c = -sr;
    } else if (q == 2) {
        result.s = -sr;
        result.c = -cr;
    } else {
        result.s = -cr;
        result.c = sr;
    }
    return result;
}

} // namespace detail

}}
