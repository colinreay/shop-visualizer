import { useRef, useEffect, useLayoutEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { useCursor } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store'
import { itemRefs } from '../itemRefs'

const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const _ray = new THREE.Raycaster()
const _hit = new THREE.Vector3()
const _ndc = new THREE.Vector2()

export default function ShopItem({ item, children }) {
  const { selectedId, selectItem, updateItem, transformMode, isTransforming, setIsTransforming, snapEnabled, editMode } = useStore()
  const isSelected = item.id === selectedId
  const groupRef = useRef()
  const { camera, gl } = useThree()
  const controls = useThree((s) => s.controls)
  const [hovered, setHovered] = useState(false)
  const pointerCaptured = useRef(false)
  const dragging = useRef(false)
  const dragOffset = useRef(new THREE.Vector3())
  const dragStartPx = useRef(null)
  const DRAG_THRESHOLD = 5

  useCursor(hovered)

  // Register this item's group ref in the global map so Viewport can attach TransformControls
  useEffect(() => {
    itemRefs.set(item.id, groupRef)
    return () => itemRefs.delete(item.id)
  }, [item.id])

  // Sync store position/rotation → three.js object imperatively.
  // Skipped while a transform is in progress (drag or rotate gizmo) to avoid fighting.
  useLayoutEffect(() => {
    if (!groupRef.current || isTransforming) return
    groupRef.current.position.set(item.position[0], item.h / 2, item.position[2])
    groupRef.current.rotation.set(0, (item.rotation * Math.PI) / 180, 0)
  }, [item.position[0], item.position[2], item.rotation, item.h, isTransforming])

  function getGroundPoint(clientX, clientY) {
    const rect = gl.domElement.getBoundingClientRect()
    _ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    _ray.setFromCamera(_ndc, camera)
    _ray.ray.intersectPlane(_plane, _hit)
    return _hit.clone()
  }

  function snap(v) {
    return snapEnabled ? Math.round(v / 0.25) * 0.25 : v
  }

  function onPointerDown(e) {
    if (editMode === 'measure') return
    if (e.button !== 0) return
    e.stopPropagation()
    selectItem(item.id)
    if (transformMode !== 'translate') return
    pointerCaptured.current = true
    dragStartPx.current = { x: e.clientX, y: e.clientY }
    if (controls) controls.enabled = false
    gl.domElement.setPointerCapture(e.pointerId)
    const pt = getGroundPoint(e.clientX, e.clientY)
    dragOffset.current.set(pt.x - item.position[0], 0, pt.z - item.position[2])
  }

  function onPointerMove(e) {
    if (!pointerCaptured.current) return
    // Don't commit to drag until pointer moves beyond threshold — prevents
    // accidental drags when the user clicks an item mid-orbit gesture
    if (!dragging.current) {
      const dx = e.clientX - dragStartPx.current.x
      const dz = e.clientY - dragStartPx.current.y
      if (dx * dx + dz * dz < DRAG_THRESHOLD * DRAG_THRESHOLD) return
      dragging.current = true
      setIsTransforming(true)
    }
    const pt = getGroundPoint(e.clientX, e.clientY)
    const x = snap(pt.x - dragOffset.current.x)
    const z = snap(pt.z - dragOffset.current.z)
    if (groupRef.current) groupRef.current.position.set(x, item.h / 2, z)
    updateItem(item.id, { position: [x, 0, z] })
  }

  function onPointerUp(e) {
    if (!pointerCaptured.current) return
    pointerCaptured.current = false
    dragStartPx.current = null
    // Always re-enable controls — even if drag threshold was never exceeded
    if (controls) controls.enabled = true
    if (dragging.current) {
      dragging.current = false
      setIsTransforming(false)
    }
    gl.domElement.releasePointerCapture(e.pointerId)
  }

  return (
    <group ref={groupRef}>
      {children ? (
        // STL or custom child mesh — wrap with interaction handlers
        <group
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerOver={(e) => { if (editMode === 'measure') return; e.stopPropagation(); setHovered(true) }}
          onPointerOut={() => setHovered(false)}
          onClick={(e) => { if (editMode === 'measure') return; e.stopPropagation(); selectItem(item.id) }}
        >
          {children}
        </group>
      ) : (
        <mesh
          castShadow
          receiveShadow
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerOver={(e) => { if (editMode === 'measure') return; e.stopPropagation(); setHovered(true) }}
          onPointerOut={() => setHovered(false)}
          onClick={(e) => { if (editMode === 'measure') return; e.stopPropagation(); selectItem(item.id) }}
        >
          <boxGeometry args={[item.w, item.h, item.d]} />
          <meshStandardMaterial
            color={item.color}
            emissive={isSelected ? item.color : hovered ? item.color : '#000000'}
            emissiveIntensity={isSelected ? 0.25 : hovered ? 0.1 : 0}
            roughness={0.55}
            metalness={0.15}
          />
        </mesh>
      )}

      {isSelected && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(item.w + 0.03, item.h + 0.03, item.d + 0.03)]} />
          <lineBasicMaterial color="#2563eb" />
        </lineSegments>
      )}
    </group>
  )
}
