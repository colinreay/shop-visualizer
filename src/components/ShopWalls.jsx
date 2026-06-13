import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useStore } from '../store'

const WALL_HEIGHT = 3.5
const WALL_THICKNESS = 0.15

// One wall segment between two XZ points.
// Three.js Ry(θ) maps local X → (cosθ, 0, −sinθ) in world space.
// To align the box's length-axis (local X) with wall direction (dx, 0, dz):
//   cosθ = dx/L,  −sinθ = dz/L  →  θ = atan2(−dz, dx)
function WallSegment({ p1, p2, isCurtain, isPerimeter }) {
  const dx = p2[0] - p1[0]
  const dz = p2[1] - p1[1]
  const length = Math.sqrt(dx * dx + dz * dz)
  if (length < 0.01) return null
  const angle = Math.atan2(-dz, dx)
  const cx = (p1[0] + p2[0]) / 2
  const cz = (p1[1] + p2[1]) / 2

  if (isCurtain) {
    return (
      <mesh position={[cx, WALL_HEIGHT / 2, cz]} rotation={[0, angle, 0]}>
        <planeGeometry args={[length, WALL_HEIGHT]} />
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
    <mesh position={[cx, WALL_HEIGHT / 2, cz]} rotation={[0, angle, 0]} castShadow receiveShadow>
      <boxGeometry args={[length, WALL_HEIGHT, WALL_THICKNESS]} />
      <meshStandardMaterial
        color={isPerimeter ? '#8899bb' : '#aab5c8'}
        roughness={0.7}
        metalness={0.05}
      />
    </mesh>
  )
}

// Square column cap at each node — fills corner gaps where two segments meet
function WallPost({ x, z, isPerimeter }) {
  return (
    <mesh position={[x, WALL_HEIGHT / 2, z]} castShadow>
      <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS]} />
      <meshStandardMaterial
        color={isPerimeter ? '#7788aa' : '#99aabb'}
        roughness={0.7}
        metalness={0.05}
      />
    </mesh>
  )
}

// A continuous wall path through multiple nodes — renders segments + corner posts
function WallPath({ points, isCurtain, isPerimeter, closed }) {
  if (!points || points.length < 2) return null

  const allPoints = closed && points.length > 2
    ? [...points, points[0]]
    : points

  return (
    <>
      {/* Segments between consecutive nodes */}
      {allPoints.slice(0, -1).map((p, i) => (
        <WallSegment key={i} p1={p} p2={allPoints[i + 1]} isCurtain={isCurtain} isPerimeter={isPerimeter} />
      ))}
      {/* Corner post at every node (seals gaps, fills mitre) — skip for curtains */}
      {!isCurtain && points.map(([x, z], i) => (
        <WallPost key={i} x={x} z={z} isPerimeter={isPerimeter} />
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

const M_TO_FT = 3.28084

// Measurement lines + labels
export function MeasureDisplay() {
  const { measurements, units } = useStore()
  return (
    <>
      {measurements.map((m) => {
        const [x1, z1] = m.p1
        const [x2, z2] = m.p2
        const distM = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2)
        const dist = units === 'ft' ? distM * M_TO_FT : distM
        const label = `${dist.toFixed(2)} ${units}`
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
              <mesh key={i} position={[x, 0.1, z]}>
                <sphereGeometry args={[0.07, 8, 8]} />
                <meshBasicMaterial color="#e53935" />
              </mesh>
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
// or null if nothing is close enough.
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
    const hw = item.w / 2, hd = item.d / 2

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

// Click handler for the measure tool — invisible floor hit plane
export function MeasurePainter() {
  const { editMode, addMeasurement, items } = useStore()
  const phase = useMemo(() => ({ current: 0, p1: null }), [])
  const [snapIndicator, setSnapIndicator] = useState(null)
  const [firstPoint, setFirstPoint] = useState(null)

  if (editMode !== 'measure') return null

  function resolve(x, z) {
    return snapToItemFace(x, z, items) ?? [+x.toFixed(2), +z.toFixed(2)]
  }

  function onPointerMove(e) {
    const { x, z } = e.point
    setSnapIndicator(snapToItemFace(x, z, items))
  }

  function onClick(e) {
    e.stopPropagation()
    const pt = resolve(e.point.x, e.point.z)
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

  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        onClick={onClick}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setSnapIndicator(null)}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial visible={false} side={THREE.DoubleSide} />
      </mesh>
      {snapIndicator && (
        <mesh position={[snapIndicator[0], 0.14, snapIndicator[1]]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshBasicMaterial color="#e53935" />
        </mesh>
      )}
      {firstPoint && (
        <mesh position={[firstPoint[0], 0.14, firstPoint[1]]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshBasicMaterial color="#e53935" />
        </mesh>
      )}
    </>
  )
}

export default function ShopWalls() {
  const { perimeter, walls, curtains } = useStore()

  return (
    <>
      {perimeter.length >= 3 && (
        <>
          <PerimeterFloor points={perimeter} />
          <WallPath points={perimeter} isPerimeter closed />
        </>
      )}
      {walls.map((pts, i) => (
        <WallPath key={i} points={pts} />
      ))}
      {curtains.map((pts, i) => (
        <WallPath key={i} points={pts} isCurtain />
      ))}
    </>
  )
}
