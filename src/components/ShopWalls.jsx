import { useMemo, useState, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useStore } from '../store'

const _tmp = new THREE.Vector3()

// Sphere that auto-scales to stay a constant apparent size as camera moves
function ScaledSphere({ position, color, opacity = 1 }) {
  const meshRef = useRef()
  const { camera } = useThree()
  useFrame(() => {
    if (!meshRef.current) return
    // Use the mesh's world position — it lives under the Z-up root group, so its
    // authored coords differ from world. getWorldPosition is transform-agnostic.
    meshRef.current.getWorldPosition(_tmp)
    const d = camera.position.distanceTo(_tmp)
    meshRef.current.scale.setScalar(Math.max(0.02, d * 0.005))
  })
  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[1, 10, 10]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} />
    </mesh>
  )
}

const WALL_THICKNESS = 0.15

// One wall segment between two XZ points.
// Three.js Ry(θ) maps local X → (cosθ, 0, −sinθ) in world space.
// To align the box's length-axis (local X) with wall direction (dx, 0, dz):
//   cosθ = dx/L,  −sinθ = dz/L  →  θ = atan2(−dz, dx)
function WallSegment({ p1, p2, isCurtain, isPerimeter, wallHeight }) {
  const dx = p2[0] - p1[0]
  const dz = p2[1] - p1[1]
  const length = Math.sqrt(dx * dx + dz * dz)
  if (length < 0.01) return null
  const angle = Math.atan2(-dz, dx)
  const cx = (p1[0] + p2[0]) / 2
  const cz = (p1[1] + p2[1]) / 2

  if (isCurtain) {
    return (
      <mesh position={[cx, wallHeight / 2, cz]} rotation={[0, angle, 0]}>
        <planeGeometry args={[length, wallHeight]} />
        <meshStandardMaterial
          color="#60a5fa"
          transparent
          opacity={0.22}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    )
  }

  return (
    <mesh position={[cx, wallHeight / 2, cz]} rotation={[0, angle, 0]} castShadow receiveShadow>
      <boxGeometry args={[length, wallHeight, WALL_THICKNESS]} />
      <meshStandardMaterial
        color={isPerimeter ? '#8899bb' : '#aab5c8'}
        roughness={0.7}
        metalness={0.05}
      />
    </mesh>
  )
}

function WallPost({ x, z, isPerimeter, wallHeight }) {
  return (
    <mesh position={[x, wallHeight / 2, z]} castShadow>
      <boxGeometry args={[WALL_THICKNESS, wallHeight, WALL_THICKNESS]} />
      <meshStandardMaterial
        color={isPerimeter ? '#7788aa' : '#99aabb'}
        roughness={0.7}
        metalness={0.05}
      />
    </mesh>
  )
}

// A continuous wall path through multiple nodes — renders segments + corner posts
function WallPath({ points, isCurtain, isPerimeter, closed, wallHeight }) {
  if (!points || points.length < 2) return null

  const allPoints = closed && points.length > 2
    ? [...points, points[0]]
    : points

  return (
    <>
      {allPoints.slice(0, -1).map((p, i) => (
        <WallSegment key={i} p1={p} p2={allPoints[i + 1]} isCurtain={isCurtain} isPerimeter={isPerimeter} wallHeight={wallHeight} />
      ))}
      {!isCurtain && points.map(([x, z], i) => (
        <WallPost key={i} x={x} z={z} isPerimeter={isPerimeter} wallHeight={wallHeight} />
      ))}
    </>
  )
}

// Filled floor polygon that exactly matches the perimeter shape
function PerimeterFloor({ points }) {
  const shape = useMemo(() => {
    if (points.length < 3) return null
    const s = new THREE.Shape()
    s.moveTo(points[0][0], points[0][1])
    for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1])
    s.closePath()
    return s
  }, [points])

  if (!shape) return null

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#ccc8c0" roughness={0.95} />
    </mesh>
  )
}

const UNIT_FACTORS = { m: 1, ft: 3.28084, mm: 1000, in: 39.3701 }

// Measurement lines + labels
export function MeasureDisplay() {
  const { measurements, units } = useStore()
  return (
    <>
      {measurements.map((m) => {
        const [x1, z1] = m.p1
        const [x2, z2] = m.p2
        const distM = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2)
        const dist = distM * (UNIT_FACTORS[units] ?? 1)
        const label = `${dist.toFixed(units === 'mm' ? 0 : 2)} ${units}`
        const mx = (x1 + x2) / 2
        const mz = (z1 + z2) / 2
        const positions = new Float32Array([x1, 0.08, z1, x2, 0.08, z2])

        return (
          <group key={m.id}>
            <line>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
              </bufferGeometry>
              <lineBasicMaterial color="#e53935" linewidth={2} />
            </line>
            {[[x1, z1], [x2, z2]].map(([x, z], i) => (
              <ScaledSphere key={i} position={[x, 0.08, z]} color="#e53935" />
            ))}
            <Html position={[mx, 0.3, mz]} center>
              <div style={{
                background: '#fff',
                border: '1px solid #e53935',
                borderRadius: 4,
                padding: '2px 7px',
                fontSize: 12,
                fontWeight: 700,
                color: '#c62828',
                whiteSpace: 'nowrap',
                boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                pointerEvents: 'none',
              }}>
                {label}
              </div>
            </Html>
          </group>
        )
      })}
    </>
  )
}

const SNAP_THRESHOLD = 0.5

// Returns the nearest point on any item's XZ bounding box face within threshold,
// or null if nothing is close enough. Accounts for STL userScale.
function snapToItemFace(cx, cz, items) {
  let best = null
  let bestDist = SNAP_THRESHOLD

  for (const item of items) {
    const ix = item.position[0], iz = item.position[2]
    const r = (item.rotation * Math.PI) / 180
    const cosN = Math.cos(-r), sinN = Math.sin(-r)
    // Cursor in item-local XZ space
    const lx = cosN * (cx - ix) - sinN * (cz - iz)
    const lz = sinN * (cx - ix) + cosN * (cz - iz)
    const sc = item.type === 'stl' ? (item.userScale ?? 1) : 1
    const hw = (item.w * sc) / 2, hd = (item.d * sc) / 2

    let nx, nz
    if (Math.abs(lx) <= hw && Math.abs(lz) <= hd) {
      // Cursor projects inside the box — push to nearest face
      const gaps = [hw - lx, hw + lx, hd - lz, hd + lz]
      const min = Math.min(...gaps)
      if (gaps[0] === min)      { nx = hw;  nz = lz }
      else if (gaps[1] === min) { nx = -hw; nz = lz }
      else if (gaps[2] === min) { nx = lx;  nz = hd }
      else                      { nx = lx;  nz = -hd }
    } else {
      // Nearest point on box boundary
      nx = Math.max(-hw, Math.min(hw, lx))
      nz = Math.max(-hd, Math.min(hd, lz))
    }

    // Back to world space
    const cosR = Math.cos(r), sinR = Math.sin(r)
    const wx = cosR * nx - sinR * nz + ix
    const wz = sinR * nx + cosR * nz + iz
    const dist = Math.sqrt((cx - wx) ** 2 + (cz - wz) ** 2)
    if (dist < bestDist) {
      bestDist = dist
      best = [+wx.toFixed(3), +wz.toFixed(3)]
    }
  }
  return best
}

const CLICK_MAX_MS = 250
const CLICK_MAX_PX2 = 64 // 8px radius

// Click handler for the measure tool — invisible floor hit plane
export function MeasurePainter() {
  const { editMode, addMeasurement, items, snapEnabled } = useStore()
  const phase = useMemo(() => ({ current: 0, p1: null }), [])
  const [previewPoint, setPreviewPoint] = useState(null)
  const [isSnapped, setIsSnapped] = useState(false)
  const [firstPoint, setFirstPoint] = useState(null)
  const downTime = useRef(null)
  const downPos = useRef(null)
  const lastResolved = useRef(null)

  if (editMode !== 'measure') return null

  function resolve(x, z) {
    const snapped = snapEnabled ? snapToItemFace(x, z, items) : null
    return { pt: snapped ?? [+x.toFixed(2), +z.toFixed(2)], snapped: !!snapped }
  }

  function onPointerMove(e) {
    e.stopPropagation()
    // e.point is world-space; map to authored floor coords (Z-up world: authored_z = -world.y)
    const x = e.point.x
    const z = -e.point.y
    const { pt, snapped } = resolve(x, z)
    lastResolved.current = pt
    setPreviewPoint(pt)
    setIsSnapped(snapped)
  }

  function onPointerDown(e) {
    if (e.button !== 0) return
    downTime.current = performance.now()
    downPos.current = { x: e.clientX, y: e.clientY }
  }

  function onPointerUp(e) {
    if (e.button !== 0 || downTime.current === null) return
    const dt = performance.now() - downTime.current
    const dx = e.clientX - downPos.current.x
    const dy = e.clientY - downPos.current.y
    downTime.current = null
    downPos.current = null
    if (dt > CLICK_MAX_MS || dx * dx + dy * dy > CLICK_MAX_PX2) return
    if (!lastResolved.current) return
    e.stopPropagation()
    const pt = lastResolved.current
    if (phase.current === 0) {
      phase.p1 = pt
      phase.current = 1
      setFirstPoint(pt)
    } else {
      addMeasurement(phase.p1, pt)
      phase.current = 0
      phase.p1 = null
      setFirstPoint(null)
    }
  }

  const previewLinePositions = firstPoint && previewPoint
    ? new Float32Array([firstPoint[0], 0.08, firstPoint[1], previewPoint[0], 0.08, previewPoint[1]])
    : null

  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerMove={onPointerMove}
        onPointerLeave={() => { setPreviewPoint(null); setIsSnapped(false) }}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Live cursor preview — blue when snapped to face, red otherwise */}
      {previewPoint && (
        <ScaledSphere
          position={[previewPoint[0], 0.08, previewPoint[1]]}
          color={isSnapped ? '#2563eb' : '#e53935'}
          opacity={0.55}
        />
      )}

      {/* Placed first point */}
      {firstPoint && (
        <ScaledSphere position={[firstPoint[0], 0.08, firstPoint[1]]} color="#e53935" />
      )}

      {/* Dashed preview line from first point to cursor */}
      {previewLinePositions && (
        <line>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[previewLinePositions, 3]} />
          </bufferGeometry>
          <lineBasicMaterial color="#e53935" transparent opacity={0.45} />
        </line>
      )}
    </>
  )
}

export default function ShopWalls() {
  const { perimeter, walls, curtains, wallHeight } = useStore()

  return (
    <>
      {perimeter.length >= 3 && (
        <>
          <PerimeterFloor points={perimeter} />
          <WallPath points={perimeter} isPerimeter closed wallHeight={wallHeight} />
        </>
      )}
      {walls.map((pts, i) => (
        <WallPath key={i} points={pts} wallHeight={wallHeight} />
      ))}
      {curtains.map((pts, i) => (
        <WallPath key={i} points={pts} isCurtain wallHeight={wallHeight} />
      ))}
    </>
  )
}
