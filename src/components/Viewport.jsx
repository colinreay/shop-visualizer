import { Canvas, useThree } from '@react-three/fiber'
import {
  OrbitControls, Environment, GizmoHelper,
  GizmoViewport, Html, TransformControls,
} from '@react-three/drei'
import { Suspense, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import * as THREE from 'three'
import { useStore } from '../store'
import { itemRefs } from '../itemRefs'
import ShopItem from './ShopItem'
import ShopWalls, { MeasureDisplay, MeasurePainter } from './ShopWalls'
// WallPainter removed — walls are now defined via coordinate editor in the sidebar
import { STLMesh } from './STLImport'

// Z-up world: ground is the world XY plane, +Z is vertical. Iso view from the
// +X / -Y / +Z octant looking at the origin.
const HOME_POS = [14, -14, 12]
const UP = [0, 0, 1]

// Watches cameraResetTick and snaps camera back to the default isometric position
function CameraResetter() {
  const { cameraResetTick } = useStore()
  const { camera, controls } = useThree()
  const prevTick = useRef(0)

  useEffect(() => {
    if (cameraResetTick === prevTick.current) return
    prevTick.current = cameraResetTick
    camera.up.set(...UP)
    camera.position.set(...HOME_POS)
    if (controls) {
      controls.target.set(0, 0, 0)
      controls.update()
    }
  }, [cameraResetTick, camera, controls])

  return null
}

function Floor() {
  const fineGrid = useMemo(() => new THREE.GridHelper(200, 200, '#b0bac6', '#b0bac6'), [])
  const coarseGrid = useMemo(() => new THREE.GridHelper(200, 40, '#7a8795', '#7a8795'), [])
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#c4cad4" roughness={0.95} />
      </mesh>
      <primitive object={fineGrid} position={[0, 0, 0]} />
      <primitive object={coarseGrid} position={[0, 0.001, 0]} />
    </>
  )
}

function ItemLabels({ items, selectedId }) {
  return items.map((item) => (
    <Html
      key={item.id}
      position={[item.position[0], item.h + 0.3, item.position[2]]}
      center
      style={{
        pointerEvents: 'none',
        color: item.id === selectedId ? '#1d4ed8' : '#374151',
        fontSize: 11,
        fontWeight: 600,
        background: 'rgba(255,255,255,0.88)',
        padding: '2px 7px',
        borderRadius: 3,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        border: item.id === selectedId ? '1px solid #93c5fd' : '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      }}
    >
      {item.label}
    </Html>
  ))
}

function RotateGizmo() {
  const { selectedId, items, updateItem, setIsTransforming } = useStore()
  const controls = useThree((s) => s.controls)
  const selected = items.find((i) => i.id === selectedId)
  if (!selected) return null
  const ref = itemRefs.get(selected.id)
  if (!ref?.current) return null

  return (
    <TransformControls
      key={selected.id}
      object={ref.current}
      mode="rotate"
      space="local"
      showX={false}
      showZ={false}
      rotationSnap={Math.PI / 12}
      onMouseDown={() => { setIsTransforming(true); if (controls) controls.enabled = false }}
      onMouseUp={() => { if (controls) controls.enabled = true; setIsTransforming(false) }}
      onChange={() => {
        if (!ref.current) return
        const deg = (((ref.current.rotation.y * 180) / Math.PI) % 360 + 360) % 360
        updateItem(selected.id, { rotation: deg })
      }}
    />
  )
}

// Keeps R3F's internal size in sync with the canvas after flex-driven resizes
// (sidebar drag). The actual offscreen-gizmo bug was the Viewport flex item lacking
// `min-width: 0` — with `min-width: auto` it wouldn't shrink below the canvas's
// explicit pixel width, so the container never resized. That's fixed on the Viewport
// div below. This sizer is the belt-and-suspenders half: R3F's ResizeObserver fires
// async, so this runs synchronously via useLayoutEffect to kill per-frame lag mid-drag.
function ViewportSizer() {
  const sidebarWidth = useStore((s) => s.sidebarWidth)
  const { gl, setSize } = useThree()
  useLayoutEffect(() => {
    // Measure the R3F wrapper div (parentElement), NOT the canvas itself.
    // Three.js sets an explicit px width on the canvas via gl.setSize(), so
    // canvas.getBoundingClientRect() returns the stale old size after a
    // sidebar-driven flex layout change. The parent div has width:100% and
    // correctly reflects the new container dimensions.
    const container = gl.domElement.parentElement
    if (!container) return
    const { width, height } = container.getBoundingClientRect()
    if (width > 0 && height > 0) setSize(width, height)
  }, [sidebarWidth, gl, setSize])
  return null
}

// Re-enables OrbitControls if a pointercancel (e.g. file dialog opening) escapes ShopItem
function ControlsSafetyNet() {
  const { controls } = useThree()
  useEffect(() => {
    function onCancel() { if (controls) controls.enabled = true }
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('blur', onCancel)
    return () => {
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('blur', onCancel)
    }
  }, [controls])
  return null
}

function SceneContents() {
  const { items, selectedId, selectItem, transformMode, editMode } = useStore()

  return (
    <>
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>

      {/* All scene geometry is authored Y-up, then rotated +90° about X so that
          authored vertical (Y) becomes world +Z. This makes the world genuinely
          Z-up (ground = world XY plane) without rewriting every position/rotation.
          Lights live inside the group so their direction rotates with the scene.
          Pointer interactions (item drag, measure) raycast in WORLD space and map
          back to authored floor coords: authored_x = world.x, authored_z = -world.y. */}
      <group rotation={[Math.PI / 2, 0, 0]}>
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[15, 25, 10]}
          intensity={1.4}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={100}
          shadow-camera-left={-30}
          shadow-camera-right={30}
          shadow-camera-top={30}
          shadow-camera-bottom={-30}
        />
        <hemisphereLight skyColor="#ddeeff" groundColor="#aabbcc" intensity={0.4} />

        <Floor />

        <ShopWalls />
        <MeasureDisplay />
        <MeasurePainter />

        {items.map((item) =>
          item.type === 'stl' ? (
            <ShopItem key={item.id} item={item}><STLMesh item={item} /></ShopItem>
          ) : (
            <ShopItem key={item.id} item={item} />
          )
        )}

        <ItemLabels items={items} selectedId={selectedId} />
      </group>

      {transformMode === 'rotate' && <RotateGizmo />}

      <CameraResetter />
      <ControlsSafetyNet />
      <ViewportSizer />

      <OrbitControls
        makeDefault
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2.05}
        panSpeed={1}
        rotateSpeed={0.6}
        zoomSpeed={1.2}
      />

      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport axisColors={['#ef4444', '#22c55e', '#3b82f6']} labelColor="#1a1a2e" />
      </GizmoHelper>
    </>
  )
}

function Toolbar() {
  const { transformMode, setTransformMode, snapEnabled, setSnapEnabled, selectedId, editMode, setEditMode, triggerCameraReset } = useStore()

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT') return
      if (e.key === 't' || e.key === 'T') { setTransformMode('translate'); setEditMode('select') }
      if (e.key === 'r' || e.key === 'R') { setTransformMode('rotate'); setEditMode('select') }
      if (e.key === 'm' || e.key === 'M') setEditMode(editMode === 'measure' ? 'select' : 'measure')
      if (e.key === 'Escape') { setTransformMode('translate'); setEditMode('select') }
      if (e.key === 'Home') triggerCameraReset()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // triggerCameraReset/setTransformMode/setEditMode are stable Zustand refs, not reactive
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode])

  const isMeasure = editMode === 'measure'

  return (
    <div style={ts.bar}>
      <button
        style={{ ...ts.btn, ...(transformMode === 'translate' && !isMeasure ? ts.active : {}) }}
        onClick={() => { setTransformMode('translate'); setEditMode('select') }}
        title="Move (T)"
      >
        ↖ Move <Kbd>T</Kbd>
      </button>
      <button
        style={{ ...ts.btn, ...(transformMode === 'rotate' && !isMeasure ? ts.active : {}), ...(!selectedId ? ts.dim : {}) }}
        onClick={() => { if (selectedId) { setTransformMode('rotate'); setEditMode('select') } }}
        title="Rotate selected (R)"
      >
        ↻ Rotate <Kbd>R</Kbd>
      </button>
      <div style={ts.divider} />
      <button
        style={{ ...ts.btn, ...(isMeasure ? ts.activeMeasure : {}) }}
        onClick={() => setEditMode(isMeasure ? 'select' : 'measure')}
        title="Measure distance (M)"
      >
        ⟷ Measure <Kbd>M</Kbd>
      </button>
      <div style={ts.divider} />
      <button
        style={{ ...ts.btn, ...(snapEnabled ? ts.active : {}) }}
        onClick={() => setSnapEnabled(!snapEnabled)}
        title="Grid snap 0.25m"
      >
        ⊞ Snap
      </button>
      <div style={ts.divider} />
      <button
        style={ts.btn}
        onClick={triggerCameraReset}
        title="Reset view (Home)"
      >
        ⌂ Home
      </button>
      {isMeasure && (
        <span style={ts.hint}>Click two points on the floor</span>
      )}
    </div>
  )
}

function Kbd({ children }) {
  return <span style={ts.kbd}>{children}</span>
}

export default function Viewport() {
  const { selectItem } = useStore()

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', background: '#e8edf3' }}>
      <Toolbar />
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: HOME_POS, up: UP, fov: 50, near: 0.1, far: 500 }}
        style={{ width: '100%', height: '100%' }}
        onPointerMissed={() => selectItem(null)}
      >
        <SceneContents />
      </Canvas>
    </div>
  )
}

const ts = {
  bar: {
    position: 'absolute',
    top: 12,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    background: 'rgba(255,255,255,0.95)',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: '5px 10px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    backdropFilter: 'blur(8px)',
  },
  btn: {
    background: 'transparent',
    color: '#374151',
    border: '1px solid transparent',
    borderRadius: 6,
    padding: '5px 11px',
    fontSize: 12,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontWeight: 500,
  },
  active: {
    background: '#eff6ff',
    color: '#2563eb',
    border: '1px solid #bfdbfe',
  },
  activeMeasure: {
    background: '#fef2f2',
    color: '#dc2626',
    border: '1px solid #fca5a5',
  },
  dim: { opacity: 0.4, cursor: 'default' },
  divider: { width: 1, height: 20, background: '#e2e8f0', margin: '0 2px' },
  kbd: {
    background: '#f1f5f9',
    border: '1px solid #e2e8f0',
    borderRadius: 3,
    padding: '0 4px',
    fontSize: 10,
    fontFamily: 'monospace',
    color: '#64748b',
  },
  hint: {
    fontSize: 11,
    color: '#dc2626',
    fontStyle: 'italic',
    marginLeft: 6,
  },
}
