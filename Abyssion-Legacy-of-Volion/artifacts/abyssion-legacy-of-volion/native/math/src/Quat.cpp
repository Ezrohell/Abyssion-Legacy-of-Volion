#include <math/Quat.hpp>

namespace abyssion { namespace math {

namespace detail {

// Hand-rolled scalar sine and arccosine: the wasm32-freestanding target is
// compiled without a C++ standard library, so std::sin and std::acos are
// unavailable. sin_scalar reuses the double-precision series already in
// Scalar.hpp; acos_scalar reduces the domain with the half-angle identity
// acos(x) = 2 * asin(sqrt((1 - x) / 2)) so the series argument stays small.
inline Scalar sin_scalar(Scalar x)
{
    return static_cast<Scalar>(sincos(static_cast<double>(x)).s);
}

// asin(y) = y + y^3/6 + 3y^5/40 + ... for |y| <= 0.5; each term follows from
// the previous one by the ratio (2n - 1)^2 / (2n * (2n + 1)) * y^2.
inline Scalar asin_series(Scalar y)
{
    const Scalar y2 = y * y;
    Scalar sum = y;
    Scalar term = y;
    for (int n = 1; n <= 12; ++n) {
        const Scalar k = static_cast<Scalar>(n);
        term = term * y2 * ((2.0f * k - 1.0f) * (2.0f * k - 1.0f)) /
               ((2.0f * k) * (2.0f * k + 1.0f));
        sum += term;
    }
    return sum;
}

// The slerp call site clamps its argument to [-1, 1], so the domain is closed.
inline Scalar acos_scalar(Scalar x)
{
    if (x < 0.0f) {
        return pi - acos_scalar(-x);
    }
    if (x <= 0.5f) {
        return half_pi - asin_series(x);
    }
    return 2.0f * asin_series(sqrt_scalar((1.0f - x) * 0.5f));
}

} // namespace detail

Scalar length(Quat q)
{
    return detail::sqrt_scalar(length_squared(q));
}

Quat normalize(Quat q)
{
    const Scalar len = length(q);
    if (len < epsilon) {
        return quat_identity();
    }
    return Quat{q.x / len, q.y / len, q.z / len, q.w / len};
}

Quat slerp(Quat a, Quat b, Scalar t)
{
    Scalar d = dot(a, b);
    if (d < 0.0f) {
        // Negating b selects the shorter of the two arcs between a and b.
        b = -b;
        d = -d;
    }
    if (d > 1.0f - epsilon) {
        // Nearly identical orientations: the spherical form below is
        // numerically unstable here, so interpolate linearly and
        // renormalise.
        return normalize(a * (1.0f - t) + b * t);
    }
    const Scalar theta = detail::acos_scalar(clamp(d, -1.0f, 1.0f));
    const Scalar sine = detail::sin_scalar(theta);
    const Scalar wa = detail::sin_scalar((1.0f - t) * theta) / sine;
    const Scalar wb = detail::sin_scalar(t * theta) / sine;
    return a * wa + b * wb;
}

}}
