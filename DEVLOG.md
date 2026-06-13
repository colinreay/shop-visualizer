# Shop Visualizer — Development Log

A 3D machine shop layout tool built with React, Vite, and React Three Fiber. Runs entirely in the browser — no backend required.

---

## What It Does

- Draw a shop perimeter by entering X/Z coordinates — walls and a shaped floor render instantly
- Add interior walls and curtains (semi-transparent dividers) the same way
- Place and drag equipment items around the floor in 3D
- Rotate selected items with a slicer-style Y-axis gizmo (or the sidebar slider)
- Edit item label, color, dimensions (W/D/H) freely — no pre-defined types
- Measure distances between any two floor points
- Import STL files — auto-scaled and placed as draggable items
- Full light-mode UI throughout

---

## Tech Stack

| Layer | Library | Why |
|---|---|---|
| Bundler | Vite + React | Fast HMR, zero config |
| 3D rendering | `@react-three/fiber` (R3F) | React bindings for Three.js |
| 3D helpers | `@react-three/drei` | OrbitControls, TransformControls, Html, Grid, GizmoHelper |
| State | `zustand` | Simple global store, no boilerplate |
| STL loading | `three/examples/jsm/loaders/STLLoader` | Built into Three.js, no extra deps |

---

## Project Structure

```
src/
  store.js                  # Zustand store — all app state
  itemRefs.js               # Module-level Map: item id → THREE.Group ref
  App.jsx                   # Root layout (sidebar + viewport)
  components/
    Sidebar.jsx             # Light-mode sidebar: equipment, walls, measure
    Viewport.jsx            # Canvas, lighting, toolbar, rotate gizmo
    ShopItem.jsx            # Draggable 3D box for each equipment item
    ShopWalls.jsx           # Wall/perimeter/curtain rendering + measure display
    PointsEditor.jsx        # Reusable [X, Z] coordinate list editor
    STLImport.jsx           # Drop zone + STLMesh renderer
```

---

## Key Technical Decisions

### Wall Angle Bug (Critical Fix)

The original wall segment code used `Math.atan2(dx, dz)` to orient box geometry along a wall direction. This was 90° wrong.

**Why it was wrong:** Three.js `Ry(θ)` maps local X → `(cosθ, 0, −sinθ)` in world space. To align a box's length axis (local X) with wall direction vector `(dx, 0, dz)`:

```
cosθ = dx/L
−sinθ = dz/L  →  sinθ = −dz/L
θ = atan2(−dz, dx)          ← correct
θ = atan2(dx, dz)           ← was 90° wrong
```

**Fix:** `const angle = Math.atan2(-dz, dx)` in `WallSegment`.

**Corner posts:** Even with the correct angle, wall segments leave small gaps at corners (the box endpoints don't perfectly mitre). Fixed by rendering a `WALL_THICKNESS × WALL_HEIGHT × WALL_THICKNESS` column cap at every node point.

### Drag vs OrbitControls Conflict

Standard problem with R3F: dragging items competes with OrbitControls for pointer events.

**Solution:**
- Items capture the pointer on `pointerdown` via `gl.domElement.setPointerCapture(e.pointerId)`
- Simultaneously set `controls.enabled = false` (OrbitControls has `makeDefault` so `useThree(s => s.controls)` returns it)
- Re-enable on `pointerup`
- Items also call `e.stopPropagation()` so clicks don't fall through to the canvas

### Imperative Position Sync (Avoiding React/Three.js Fight)

When TransformControls or drag is active, React re-renders would try to reset the Three.js object's position back to the stored value — causing jitter.

**Solution:** Don't put `position` or `rotation` as JSX props on the group. Instead, use `useLayoutEffect` to imperatively set them:

```js
useLayoutEffect(() => {
  if (!groupRef.current || isTransforming) return
  groupRef.current.position.set(item.position[0], item.h / 2, item.position[2])
  groupRef.current.rotation.set(0, (item.rotation * Math.PI) / 180, 0)
}, [item.position[0], item.position[2], item.rotation, item.h, isTransforming])
```

During drag/rotate: `isTransforming = true` → layout effect skips → Three.js object is moved directly → store is updated. After transform ends: `isTransforming = false` → effect re-runs → syncs store → no-op since values match.

### Global Item Ref Map

The `RotateGizmo` in Viewport needs to attach `TransformControls` to a specific item's `THREE.Group`, but the group lives inside `ShopItem`. Rather than prop-drilling refs through the component tree, a module-level `Map` is used:

```js
// itemRefs.js
export const itemRefs = new Map() // id → React ref (THREE.Group)
```

Each `ShopItem` registers itself on mount and deregisters on unmount. The gizmo reads from the map using `selectedId`.

### Perimeter Floor Shape

The shop floor exactly follows the perimeter polygon using `THREE.Shape`:

```js
const shape = new THREE.Shape()
shape.moveTo(points[0][0], points[0][1]) // treating Z as Y in shape space
for (const [x, z] of points.slice(1)) shape.lineTo(x, z)
shape.closePath()
// mesh rotated -π/2 on X maps shape XY → world XZ
<mesh rotation={[-Math.PI / 2, 0, 0]}>
  <shapeGeometry args={[shape]} />
```

### STL Import Auto-Scaling

STL files can be in any unit (mm, cm, inches). Auto-scale heuristic:
- If the largest dimension > 500 units → assume millimeters → scale × 0.001
- If the largest dimension < 0.01 → scale × 100
- Otherwise → treat as meters, scale × 1

---

## Store Shape

```js
{
  // Equipment
  items: [{ id, label, position:[x,0,z], rotation, w, d, h, color, ...stlFields }],
  selectedId: null,

  // Transform
  transformMode: 'translate' | 'rotate',
  isTransforming: false,
  snapEnabled: true,

  // Layout geometry (all points are [x, z] pairs)
  perimeter: [[x,z], ...],          // closed polygon → walls + floor
  walls: [[[x,z],...], ...],        // array of polylines
  curtains: [[[x,z],...], ...],     // rendered semi-transparent

  // Measurements
  measurements: [{ id, p1:[x,z], p2:[x,z] }],

  // Edit mode
  editMode: 'select' | 'measure',
}
```

---

## Controls

| Action | How |
|---|---|
| Orbit camera | Left-drag on empty floor |
| Pan | Right-drag or middle-drag |
| Zoom | Scroll wheel |
| Select item | Click it |
| Move item | Click + drag (Move mode) |
| Rotate item | Switch to Rotate mode (R), drag the Y-axis arc |
| Deselect | Click empty floor |
| Move mode | `T` key or toolbar button |
| Rotate mode | `R` key or toolbar button |
| Measure mode | `M` key or toolbar button → click two floor points |
| Snap 0.25m grid | Toolbar toggle |

---

## Known Gotchas

- **Vite dev server restart needed after stale HMR errors.** If you change exports (rename or remove an export), the browser module cache gets stuck. Kill the `node.exe` process and restart `npm run dev`.
- **TransformControls and OrbitControls must not coexist on the same pointer event.** Always disable OrbitControls during gizmo interaction.
- **THREE.Shape uses XY not XZ.** When building perimeter shapes, the mesh must be rotated `-π/2` on X so the shape's Y axis maps to world Z.
- **Rotation gizmo needs a `key={selectedId}` prop.** Without it, TransformControls doesn't detach/reattach when a different item is selected.
- **STL geometry must be translated to sit on y=0 before import.** `geometry.translate(-(cx), -box.min.y, -(cz))` centers it and floors it.

---

## Running Locally

```bash
cd "Shop Visualizer"
npm run dev
# Open http://localhost:5173
```

## Building for Static Hosting (Netlify / Vercel)

```bash
npm run build
# Output in dist/ — drag and drop to netlify.com
```
