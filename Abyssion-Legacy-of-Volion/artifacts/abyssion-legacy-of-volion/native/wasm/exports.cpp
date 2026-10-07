// Abyssion math wasm exports.
//
// Two extern "C" wrappers over the abyssion_math static library so a browser
// can call the library across a plain scalar ABI: nothing but floats crosses
// the module boundary, so there is no struct, pointer, allocation, or global
// state to marshal.
//
// Only the two math headers this file needs are included: Vec3.hpp supplies
// Vec3 and length(), Quat.hpp supplies from_axis_angle() and rotate().

#include <math/Quat.hpp>
#include <math/Vec3.hpp>

extern "C" float abyssion_vec3_length(float x, float y, float z)
{
    return abyssion::math::length(abyssion::math::Vec3{x, y, z});
}

extern "C" float abyssion_dot_quat_axis_z(float angle_radians, float vx,
                                          float vy, float vz)
{
    const abyssion::math::Quat q = abyssion::math::from_axis_angle(
        abyssion::math::Vec3{0.0f, 0.0f, 1.0f}, angle_radians);
    const abyssion::math::Vec3 rotated =
        abyssion::math::rotate(q, abyssion::math::Vec3{vx, vy, vz});
    return rotated.y;
}
