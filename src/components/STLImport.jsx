import { useState } from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { useStore } from '../store'

const loader = new STLLoader()

const UNIT_SCALES = { mm: 0.001, cm: 0.01, in: 0.0254, m: 1 }

function loadSTL(file, unit) {
  const url = URL.createObjectURL(file)
  loader.load(url, (geometry) => {
    URL.revokeObjectURL(url)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    const size = new THREE.Vector3()
    box.getSize(size)

    // Center on XZ, floor on Y
    geometry.translate(
      -(box.min.x + size.x / 2),
      -box.min.y,
      -(box.min.z + size.z / 2)
    )
    geometry.computeVertexNormals()

    let scale
    if (unit === 'auto') {
      const maxDim = Math.max(size.x, size.y, size.z)
      scale = maxDim > 500 ? 0.001 : maxDim < 0.01 ? 100 : 1
    } else {
      scale = UNIT_SCALES[unit] ?? 1
    }

    const label = file.name.replace(/\.stl$/i, '')
    const store = useStore.getState()
    store.addItem({
      type: 'stl',
      label,
      w: size.x * scale,
      d: size.z * scale,
      h: size.y * scale,
      color: '#78909C',
      stlGeometry: geometry,
      stlScale: scale,
      userScale: 1,
    })
  })
}

export function STLDropZone() {
  const [over, setOver] = useState(false)
  const [unit, setUnit] = useState('mm')

  function handleFile(file) {
    if (file?.name.toLowerCase().endsWith('.stl')) loadSTL(file, unit)
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div style={s.unitRow}>
        <span style={s.unitLabel}>STL units:</span>
        <select
          style={s.unitSelect}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="mm">mm</option>
          <option value="cm">cm</option>
          <option value="in">inches</option>
          <option value="m">meters</option>
          <option value="auto">auto-detect</option>
        </select>
      </div>
      <div
        style={{ ...s.zone, ...(over ? s.over : {}) }}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handleFile(e.dataTransfer.files[0]) }}
        onClick={() => {
          const inp = document.createElement('input')
          inp.type = 'file'
          inp.accept = '.stl'
          inp.onchange = (e) => handleFile(e.target.files[0])
          inp.click()
        }}
      >
        {over ? '⬇ Drop STL here' : '⊕ Import STL file'}
      </div>
    </div>
  )
}

// Applies a rotation to align the clicked face normal to the ground (-Y),
// then recenters the geometry and updates the item dimensions.
function applyFaceDown(item, faceNormal, updateItem) {
  const geom = item.stlGeometry.clone()
  const q = new THREE.Quaternion().setFromUnitVectors(
    faceNormal.clone().normalize(),
    new THREE.Vector3(0, -1, 0)
  )
  geom.applyQuaternion(q)
  geom.computeBoundingBox()
  const box = geom.boundingBox
  const size = new THREE.Vector3()
  box.getSize(size)
  geom.translate(-(box.min.x + size.x / 2), -box.min.y, -(box.min.z + size.z / 2))
  geom.computeVertexNormals()
  const sc = item.stlScale
  updateItem(item.id, {
    stlGeometry: geom,
    w: size.x * sc,
    d: size.z * sc,
    h: size.y * sc,
    rotation: 0,
  })
}

export function STLMesh({ item }) {
  const { selectedId, updateItem, faceSelectId, setFaceSelectId } = useStore()
  const isSelected = item.id === selectedId
  const isFaceSelect = item.id === faceSelectId
  if (!item.stlGeometry) return null

  const sc = item.stlScale * (item.userScale ?? 1)

  return (
    <mesh
      geometry={item.stlGeometry}
      scale={[sc, sc, sc]}
      castShadow
      receiveShadow
      onClick={(e) => {
        if (!isFaceSelect) return
        e.stopPropagation()
        applyFaceDown(item, e.face.normal, updateItem)
        setFaceSelectId(null)
      }}
    >
      <meshStandardMaterial
        color={item.color}
        emissive={isFaceSelect ? '#ff6600' : isSelected ? item.color : '#000'}
        emissiveIntensity={isFaceSelect ? 0.4 : isSelected ? 0.25 : 0}
        roughness={0.55}
        metalness={0.15}
      />
    </mesh>
  )
}

const s = {
  unitRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  unitLabel: {
    fontSize: 11,
    color: '#6b7280',
    flexShrink: 0,
  },
  unitSelect: {
    flex: 1,
    padding: '3px 6px',
    border: '1px solid #d1d5db',
    borderRadius: 5,
    fontSize: 11,
    color: '#1a1a2e',
    background: '#fff',
    cursor: 'pointer',
  },
  zone: {
    padding: '8px',
    border: '1px dashed #93c5fd',
    borderRadius: 6,
    fontSize: 12,
    color: '#2563eb',
    cursor: 'pointer',
    textAlign: 'center',
    background: '#f0f7ff',
    transition: 'all 0.15s',
  },
  over: {
    borderColor: '#2563eb',
    background: '#dbeafe',
  },
}
