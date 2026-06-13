import { create } from 'zustand'

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

let itemCount = 0

export const useStore = create((set, get) => ({
  items: [],
  selectedId: null,

  // Transform
  transformMode: 'translate',
  isTransforming: false,
  snapEnabled: true,
  setTransformMode: (mode) => set({ transformMode: mode }),
  setIsTransforming: (v) => set({ isTransforming: v }),
  setSnapEnabled: (v) => set({ snapEnabled: v }),

  // Layout geometry — points are [x, z] pairs
  perimeter: [],          // [[x,z], ...] closed polygon
  walls: [],              // [[[x,z],...], ...] array of polylines
  curtains: [],           // [[[x,z],...], ...] array of polylines

  setPerimeter: (pts) => set({ perimeter: pts }),
  setWall: (idx, pts) => set((s) => ({ walls: s.walls.map((w, i) => i === idx ? pts : w) })),
  addWall: () => set((s) => ({ walls: [...s.walls, [[0, 0], [5, 0]]] })),
  removeWall: (idx) => set((s) => ({ walls: s.walls.filter((_, i) => i !== idx) })),
  setCurtain: (idx, pts) => set((s) => ({ curtains: s.curtains.map((c, i) => i === idx ? pts : c) })),
  addCurtain: () => set((s) => ({ curtains: [...s.curtains, [[0, 0], [5, 0]]] })),
  removeCurtain: (idx) => set((s) => ({ curtains: s.curtains.filter((_, i) => i !== idx) })),
  clearLayout: () => set({ perimeter: [], walls: [], curtains: [] }),

  // Measurements [{id, p1:[x,z], p2:[x,z]}]
  measurements: [],
  addMeasurement: (p1, p2) => set((s) => ({
    measurements: [...s.measurements, { id: uid(), p1, p2 }],
  })),
  clearMeasurements: () => set({ measurements: [] }),

  // Edit mode for 3D interactions
  editMode: 'select', // 'select' | 'measure'
  setEditMode: (mode) => set({ editMode: mode }),

  // Display units — internal values always stored in meters
  units: 'm', // 'm' | 'ft' | 'mm' | 'in'
  setUnits: (u) => set({ units: u }),

  // Wall height in meters — applies to all perimeter + interior walls
  wallHeight: 3.5,
  setWallHeight: (h) => set({ wallHeight: h }),

  // Camera reset — increment to trigger a reset inside the Canvas
  cameraResetTick: 0,
  triggerCameraReset: () => set((s) => ({ cameraResetTick: s.cameraResetTick + 1, selectedId: null })),

  // Face-select mode — id of the STL item currently awaiting a face click
  faceSelectId: null,
  setFaceSelectId: (id) => set({ faceSelectId: id }),

  addItem: (overrides) => {
    itemCount += 1
    const id = uid()
    const count = get().items.length
    const item = {
      id,
      label: `Item ${itemCount}`,
      position: [count * 3, 0, 0],
      rotation: 0,
      w: 1.0,
      d: 1.0,
      h: 1.0,
      color: '#607D8B',
      ...overrides,
    }
    set((s) => ({ items: [...s.items, item], selectedId: id }))
    return id
  },

  removeItem: (id) =>
    set((s) => ({
      items: s.items.filter((i) => i.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),

  selectItem: (id) => set({ selectedId: id }),

  updateItem: (id, patch) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),
}))
