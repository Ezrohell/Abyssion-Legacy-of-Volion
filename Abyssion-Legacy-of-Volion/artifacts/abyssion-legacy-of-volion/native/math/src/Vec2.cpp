#include <math/Vec2.hpp>
#include <math/Vec3.hpp>

namespace abyssion { namespace math {

Scalar length(Vec2 v)
{
    return detail::sqrt_scalar(length_squared(v));
}

Vec2 normalize(Vec2 v)
{
    const Scalar len = length(v);
    if (len < epsilon) {
        return Vec2{0.0f, 0.0f};
    }
    return Vec2{v.x / len, v.y / len};
}

}}
