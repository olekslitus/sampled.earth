"use client"
/* oxlint-disable react/immutability -- the mesh and its uniforms are updated imperatively inside the r3f frame loop. */

import { useMemo, useRef } from "react"
import * as THREE from "three"
import { useFrame } from "@react-three/fiber"

import { bodyRotation } from "@/lib/space/solar"
import { spaceTexture } from "./materials"
import type { SpaceView } from "./view"

const MOON_RADIUS = 1737.4 / 6371

/**
 * The Moon in the globe's own (Earth-fixed) scene, so it is where it really is in the sky as
 * seen from the globe, lit by the Sun, with its near side towards us.
 */
export function Moon({ view }: { view: SpaceView }) {
  const mesh = useRef<THREE.Mesh>(null)
  const scratch = useMemo(() => ({ toEarth: new THREE.Matrix4(), rot: new THREE.Matrix4(), v: new THREE.Vector3(), lastSpin: NaN }), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { map: { value: spaceTexture("/space/planets/moon.webp") }, sunDir: { value: new THREE.Vector3(1, 0, 0) } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying vec3 vNormal;
          void main() {
            vUv = uv;
            vNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D map;
          uniform vec3 sunDir;
          varying vec2 vUv;
          varying vec3 vNormal;
          void main() {
            float light = max(dot(normalize(vNormal), sunDir), 0.0);
            vec3 c = texture2D(map, vUv).rgb * (0.025 + 1.1 * light);
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )

  useFrame(({ camera }) => {
    const m = mesh.current
    if (!m) return
    const { toEarth, rot, v } = scratch
    toEarth.copy(view.earthToSky).invert()
    const p = view.bodies.Moon
    m.position.set(p[0]!, p[1]!, p[2]!).applyMatrix4(toEarth)
    if (!(Math.abs(view.time - scratch.lastSpin) < 60_000)) {
      scratch.lastSpin = view.time
      bodyRotation("Moon", view.time, rot)
    }
    m.quaternion.setFromRotationMatrix(rot.clone().premultiply(toEarth))
    const s = view.bodies.Sun
    v.set(s[0]!, s[1]!, s[2]!).applyMatrix4(toEarth).sub(m.position).normalize()
    material.uniforms.sunDir!.value.copy(v)
    // the globe ignores depth, so draw the Moon after it only when it is in front
    const inFront = camera.position.distanceTo(m.position) < camera.position.length() - 1
    m.renderOrder = inFront ? 20 : -1
  })

  return (
    <mesh ref={mesh} material={material} scale={MOON_RADIUS}>
      <sphereGeometry args={[1, 64, 32]} />
    </mesh>
  )
}
