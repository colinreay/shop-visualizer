import { useState } from 'react'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { useStore } from '../store'

const loader = new STLLoader()

function loadSTL(file) {
  const url = URL.createObjectURL(file)
  loader.load(url, (geometry) => {
    URL.revokeObjectURL(url)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox
    const size = new THREE.Vector3()
    box.getSize(size)

    geometry.translate(
      -(box.min.x + size.x / 2),
      -box.min.y,
      -(box.min.z + size.z / 2)
    )

    // Auto-scale: assume mm if largest dimension > 500 units
    const maxDim = Math.max(size.x, size.y, size.z)
    const scale = maxDim > 500 ? 0.001 : maxDim < 0.01 ? 100 : 1
    const label = file.name.replace(/\.stl$/i, '')

    useStore.getState().addItem({
      type: 'stl',
      label,
      w: size.x * scale,
      d: size.z * scale,
      h: size.y * scale,
      color: '#78909C',
      stlGeometry: geometry,
      stlScale: scale,
    })
  })
}

export function STLDropZone() {
  const [over, setOver] = useState(false)

  return (
    <div
      style={{ ...s.zone, ...(over ? s.over : {}) }}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const file = e.dataTransfer.files[0]
        if (file?.name.toLowerCase().endsWith('.stl')) loadSTL(file)
      }}
      onClick={() => {
        const inp = document.createElement('input')
        inp.type = 'file'
        inp.accept = '.stl'
        inp.onchange = (e) => { if (e.target.files[0]) loadSTL(e.target.files[0]) }
        inp.click()
      }}
    >
      {over ? '⬇ Drop STL here' : '⊕ Import STL file'}
    </div>
  )
}

export function STLMesh({ item }) {
  const { selectedId } = useStore()
  const isSelected = item.id === selectedId
  if (!item.stlGeometry) return null
  return (
    <mesh
      geometry={item.stlGeometry}
      scale={[item.stlScale, item.stlScale, item.stlScale]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={item.color}
        emissive={isSelected ? item.color : '#000'}
        emissiveIntensity={isSelected ? 0.25 : 0}
        roughness={0.55}
        metalness={0.15}
      />
    </mesh>
  )
}

const s = {
  zone: {
    marginTop: 6,
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
