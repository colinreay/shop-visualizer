import * as THREE from 'three'

function bufferToBase64(typedArray) {
  const bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function base64ToFloat32(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}

export function downloadScene(state) {
  const items = state.items.map(item => {
    if (item.type === 'stl' && item.stlGeometry) {
      return {
        ...item,
        stlGeometry: undefined,
        stlPositions: bufferToBase64(item.stlGeometry.attributes.position.array),
      }
    }
    return item
  })

  const payload = {
    version: 1,
    items,
    perimeter: state.perimeter,
    walls: state.walls,
    curtains: state.curtains,
    measurements: state.measurements,
    units: state.units,
    wallHeight: state.wallHeight,
    snapEnabled: state.snapEnabled,
  }

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'scene.shopvis'
  a.click()
  URL.revokeObjectURL(url)
}

export function loadSceneFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        const items = data.items.map(item => {
          if (item.type === 'stl' && item.stlPositions) {
            const geometry = new THREE.BufferGeometry()
            geometry.setAttribute(
              'position',
              new THREE.BufferAttribute(base64ToFloat32(item.stlPositions), 3)
            )
            geometry.computeVertexNormals()
            const { stlPositions, ...rest } = item
            return { ...rest, stlGeometry: geometry }
          }
          return item
        })
        resolve({
          items,
          perimeter: data.perimeter ?? [],
          walls: data.walls ?? [],
          curtains: data.curtains ?? [],
          measurements: data.measurements ?? [],
          units: data.units ?? 'm',
          wallHeight: data.wallHeight ?? 3.5,
          snapEnabled: data.snapEnabled ?? true,
        })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
