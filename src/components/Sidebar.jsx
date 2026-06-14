import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { STLDropZone } from './STLImport'
import PointsEditor from './PointsEditor'

// Collapsible section wrapper
function Section({ title, defaultOpen = true, children, action }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={s.section}>
      <div style={s.sectionHeader} onClick={() => setOpen(!open)}>
        <span style={s.sectionTitle}>{title}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {action}
          <span style={s.chevron}>{open ? '▾' : '▸'}</span>
        </div>
      </div>
      {open && <div style={s.sectionBody}>{children}</div>}
    </div>
  )
}

const UNIT_FACTORS = { m: 1, ft: 3.28084, mm: 1000, in: 39.3701 }
const UNIT_DECIMALS = { m: 3, ft: 3, mm: 1, in: 2 }
const DIM_STEP     = { m: '0.1', ft: '0.1', mm: '10', in: '0.25' }
const POS_STEP     = { m: '0.25', ft: '0.5', mm: '25', in: '0.5' }

export default function Sidebar() {
  const {
    items, selectedId, selectItem, removeItem, updateItem, addItem,
    perimeter, setPerimeter,
    walls, addWall, setWall, removeWall,
    curtains, addCurtain, setCurtain, removeCurtain,
    clearLayout,
    measurements, clearMeasurements,
    editMode, setEditMode,
    units, setUnits,
    wallHeight, setWallHeight,
    faceSelectId, setFaceSelectId,
  } = useStore()

  const selected = items.find((i) => i.id === selectedId)

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const resizing = useRef(false)
  const resizeStart = useRef({ x: 0, w: 260 })
  useEffect(() => {
    function onMove(e) {
      if (!resizing.current) return
      const w = Math.max(180, Math.min(520, resizeStart.current.w + e.clientX - resizeStart.current.x))
      setSidebarWidth(w)
    }
    function onUp() { resizing.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const factor  = UNIT_FACTORS[units] ?? 1
  const dec     = UNIT_DECIMALS[units] ?? 3
  const toDisp  = (m) => +(m * factor).toFixed(dec)
  const toM     = (v) => v / factor
  const u       = units
  const dispPts = (pts) => pts.map(([x, z]) => [toDisp(x), toDisp(z)])
  const mPts    = (pts) => pts.map(([x, z]) => [toM(x), toM(z)])

  function handlePosChange(axis, raw) {
    if (!selected) return
    const val = toM(raw === '' ? 0 : parseFloat(raw))
    const pos = [...selected.position]
    pos[axis === 'x' ? 0 : 2] = val
    updateItem(selected.id, { position: pos })
  }

  function handleDimChange(dim, raw) {
    if (!selected) return
    const val = Math.max(toM(0.05), toM(parseFloat(raw) || 0.05))
    updateItem(selected.id, { [dim]: val })
  }

  return (
    <div style={{ ...s.sidebar, width: sidebarWidth }}>
      {/* Drag handle on right edge */}
      <div
        style={s.resizeHandle}
        onMouseDown={(e) => {
          resizing.current = true
          resizeStart.current = { x: e.clientX, w: sidebarWidth }
          e.preventDefault()
        }}
      />
      {/* Header */}
      <div style={s.header}>
        <div style={s.logo}>⬡</div>
        <div style={{ flex: 1 }}>
          <div style={s.appName}>Shop Visualizer</div>
          <div style={s.appSub}>Machine shop layout tool</div>
        </div>
        <div style={s.unitToggle}>
          {['m', 'ft', 'mm', 'in'].map((unit) => (
            <button
              key={unit}
              style={{ ...s.unitBtn, ...(units === unit ? s.unitBtnActive : {}) }}
              onClick={() => setUnits(unit)}
            >
              {unit}
            </button>
          ))}
        </div>
      </div>

      <div style={s.scroll}>

        {/* Equipment */}
        <Section title="Equipment">
          <button style={s.addItemBtn} onClick={() => addItem()}>
            + Add Item
          </button>
          <div style={s.hint}>Click to add a generic box. Edit properties below.</div>
          <STLDropZone />
        </Section>

        {/* Selected item properties */}
        {selected && (
          <Section title={selected.label || 'Selected Item'} defaultOpen>
            <div style={s.propGrid}>
              <label style={s.propRow}>
                <span style={s.propLabel}>Label</span>
                <input
                  style={{ ...s.inp, flex: 1 }}
                  value={selected.label}
                  onChange={(e) => updateItem(selected.id, { label: e.target.value })}
                />
              </label>

              <label style={s.propRow}>
                <span style={s.propLabel}>Color</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
                  <input
                    type="color"
                    style={s.colorPicker}
                    value={selected.color}
                    onChange={(e) => updateItem(selected.id, { color: e.target.value })}
                  />
                  <span style={{ fontSize: 11, color: '#666' }}>{selected.color}</span>
                </div>
              </label>

              {selected.type !== 'stl' && (
                <div style={s.dimRow}>
                  {[['w', 'W'], ['d', 'D'], ['h', 'H']].map(([key, label]) => (
                    <label key={key} style={{ flex: 1 }}>
                      <div style={s.dimLabel}>{label} ({u})</div>
                      <input
                        type="number"
                        step={DIM_STEP[units]}
                        min={toDisp(0.001)}
                        style={s.inp}
                        value={toDisp(selected[key])}
                        onChange={(e) => handleDimChange(key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              )}

              <div style={s.twoCol}>
                <label style={{ flex: 1 }}>
                  <div style={s.dimLabel}>X ({u})</div>
                  <input
                    type="number"
                    step={POS_STEP[units]}
                    style={s.inp}
                    value={toDisp(selected.position[0])}
                    onChange={(e) => handlePosChange('x', e.target.value)}
                  />
                </label>
                <label style={{ flex: 1 }}>
                  <div style={s.dimLabel}>Y ({u})</div>
                  <input
                    type="number"
                    step={POS_STEP[units]}
                    style={s.inp}
                    value={toDisp(selected.position[2])}
                    onChange={(e) => handlePosChange('z', e.target.value)}
                  />
                </label>
              </div>

              <label style={s.propRow}>
                <span style={s.propLabel}>Rotation</span>
                <div style={{ flex: 1 }}>
                  <input
                    type="number"
                    step="5"
                    style={{ ...s.inp, marginBottom: 4 }}
                    value={+selected.rotation.toFixed(1)}
                    onChange={(e) => updateItem(selected.id, { rotation: parseFloat(e.target.value) || 0 })}
                  />
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="5"
                    style={{ width: '100%' }}
                    value={selected.rotation}
                    onChange={(e) => updateItem(selected.id, { rotation: parseFloat(e.target.value) })}
                  />
                </div>
              </label>
            </div>

            {selected.type === 'stl' && (
              <>
                <div style={s.dimRow}>
                  <label style={{ flex: 1 }}>
                    <div style={s.dimLabel}>Scale ×</div>
                    <input
                      type="number"
                      step="0.1"
                      min="0.01"
                      style={s.inp}
                      value={+(selected.userScale ?? 1).toFixed(3)}
                      onChange={(e) => {
                        const v = Math.max(0.001, parseFloat(e.target.value) || 1)
                        updateItem(selected.id, { userScale: v })
                      }}
                    />
                  </label>
                  <label style={{ flex: 1 }}>
                    <div style={s.dimLabel}>Size ({u})</div>
                    <input
                      style={{ ...s.inp, color: '#9ca3af' }}
                      readOnly
                      value={`${toDisp(selected.w * (selected.userScale ?? 1)).toFixed(2)} × ${toDisp(selected.d * (selected.userScale ?? 1)).toFixed(2)} × ${toDisp(selected.h * (selected.userScale ?? 1)).toFixed(2)}`}
                    />
                  </label>
                </div>
                <button
                  style={{
                    ...s.addItemBtn,
                    marginTop: 4,
                    background: faceSelectId === selected.id ? '#ea580c' : undefined,
                    color: faceSelectId === selected.id ? '#fff' : undefined,
                    borderColor: faceSelectId === selected.id ? '#ea580c' : undefined,
                  }}
                  onClick={() => setFaceSelectId(faceSelectId === selected.id ? null : selected.id)}
                >
                  {faceSelectId === selected.id ? '◉ Click a face to set ground…' : '▣ Set Face Down'}
                </button>
              </>
            )}

            <button style={s.deleteBtn} onClick={() => removeItem(selected.id)}>
              Delete Item
            </button>
          </Section>
        )}

        {/* Perimeter */}
        <Section title="Shop Perimeter" defaultOpen={false}
          action={
            perimeter.length > 0 && (
              <button style={s.clearBtn} onClick={() => setPerimeter([])}>Clear</button>
            )
          }
        >
          <div style={s.hint}>
            Define the outer walls of your shop. Points close automatically to form a polygon.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, marginTop: 6 }}>
            <span style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>Z height ({u})</span>
            <input
              type="number"
              step={DIM_STEP[units]}
              min={toDisp(0.5)}
              style={{ ...s.inp, width: 80 }}
              value={toDisp(wallHeight)}
              onChange={(e) => {
                const v = toM(parseFloat(e.target.value) || 3.5)
                setWallHeight(Math.max(0.5, v))
              }}
            />
          </div>
          <PointsEditor
            points={dispPts(perimeter)}
            onChange={(pts) => setPerimeter(mPts(pts))}
            unit={u}
            step={POS_STEP[units]}
          />
          {perimeter.length < 3 && (
            <div style={s.hintWarn}>Need at least 3 points to draw walls & floor.</div>
          )}
        </Section>

        {/* Interior Walls */}
        <Section title="Interior Walls" defaultOpen={false}
          action={
            <button style={s.addSmallBtn} onClick={addWall}>+ Wall</button>
          }
        >
          {walls.length === 0 && (
            <div style={s.hint}>No interior walls yet. Click "+ Wall" to add one.</div>
          )}
          {walls.map((pts, i) => (
            <div key={i} style={s.wallCard}>
              <div style={s.wallCardHeader}>
                <span style={s.wallCardTitle}>Wall {i + 1}</span>
                <button style={s.iconBtn} onClick={() => removeWall(i)}>✕</button>
              </div>
              <PointsEditor points={dispPts(pts)} onChange={(next) => setWall(i, mPts(next))} unit={u} step={POS_STEP[units]} />
            </div>
          ))}
        </Section>

        {/* Curtains */}
        <Section title="Curtains / Dividers" defaultOpen={false}
          action={
            <button style={s.addSmallBtn} onClick={addCurtain}>+ Curtain</button>
          }
        >
          {curtains.length === 0 && (
            <div style={s.hint}>No curtains yet. Click "+ Curtain" to add one.</div>
          )}
          {curtains.map((pts, i) => (
            <div key={i} style={s.wallCard}>
              <div style={s.wallCardHeader}>
                <span style={s.wallCardTitle}>Curtain {i + 1}</span>
                <button style={s.iconBtn} onClick={() => removeCurtain(i)}>✕</button>
              </div>
              <PointsEditor points={dispPts(pts)} onChange={(next) => setCurtain(i, mPts(next))} unit={u} step={POS_STEP[units]} />
            </div>
          ))}
        </Section>

        {/* Measuring tool */}
        <Section title="Measure" defaultOpen={false}>
          <button
            style={{
              ...s.addItemBtn,
              background: editMode === 'measure' ? '#2563eb' : undefined,
              color: editMode === 'measure' ? '#fff' : undefined,
            }}
            onClick={() => setEditMode(editMode === 'measure' ? 'select' : 'measure')}
          >
            {editMode === 'measure' ? '◉ Measuring… (click 2 pts)' : '⟷ Start Measuring'}
          </button>
          {measurements.length > 0 && (
            <>
              <div style={{ marginTop: 8 }}>
                {measurements.map((m) => {
                  const dx = m.p2[0] - m.p1[0]
                  const dz = m.p2[1] - m.p1[1]
                  const dist = Math.sqrt(dx * dx + dz * dz)
                  return (
                    <div key={m.id} style={s.measureRow}>
                      <span style={{ color: '#666', fontSize: 11 }}>
                        ({toDisp(m.p1[0]).toFixed(1)}, {toDisp(m.p1[1]).toFixed(1)}) → ({toDisp(m.p2[0]).toFixed(1)}, {toDisp(m.p2[1]).toFixed(1)})
                      </span>
                      <strong style={{ color: '#1a1a2e' }}>{toDisp(dist).toFixed(2)} {u}</strong>
                    </div>
                  )
                })}
              </div>
              <button style={{ ...s.clearBtn, marginTop: 6, width: '100%' }} onClick={clearMeasurements}>
                Clear Measurements
              </button>
            </>
          )}
        </Section>

        {/* Items list */}
        {items.length > 0 && (
          <Section title={`Items (${items.length})`} defaultOpen>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  ...s.listItem,
                  background: item.id === selectedId ? '#eff6ff' : 'transparent',
                  borderColor: item.id === selectedId ? '#bfdbfe' : 'transparent',
                }}
                onClick={() => selectItem(item.id)}
              >
                <span style={{ ...s.colorDot, background: item.color }} />
                <span style={{ flex: 1, fontSize: 12, color: '#1a1a2e' }}>{item.label}</span>
                <span style={{ fontSize: 10, color: '#999' }}>
                  {toDisp(item.w)}×{toDisp(item.d)}×{toDisp(item.h)}{u}
                </span>
              </div>
            ))}
          </Section>
        )}

      </div>
    </div>
  )
}

const s = {
  sidebar: {
    background: '#f8f9fb',
    borderRight: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    fontFamily: 'system-ui, sans-serif',
    position: 'relative',
  },
  resizeHandle: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 5,
    height: '100%',
    cursor: 'col-resize',
    zIndex: 10,
    background: 'transparent',
    transition: 'background 0.15s',
  },
  header: {
    padding: '14px 16px',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: '#fff',
    flexShrink: 0,
  },
  unitToggle: {
    display: 'flex',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    overflow: 'hidden',
    flexShrink: 0,
  },
  unitBtn: {
    padding: '4px 9px',
    fontSize: 11,
    fontWeight: 600,
    border: 'none',
    background: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
  },
  unitBtnActive: {
    background: '#2563eb',
    color: '#fff',
  },
  logo: {
    fontSize: 22,
    color: '#2563eb',
    lineHeight: 1,
  },
  appName: { fontSize: 14, fontWeight: 700, color: '#1a1a2e' },
  appSub: { fontSize: 11, color: '#888', marginTop: 1 },
  scroll: {
    flex: 1,
    overflowY: 'auto',
  },
  section: {
    borderBottom: '1px solid #e2e8f0',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '9px 14px',
    cursor: 'pointer',
    userSelect: 'none',
    background: '#fff',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chevron: { fontSize: 12, color: '#9ca3af' },
  sectionBody: { padding: '10px 14px 12px' },
  addItemBtn: {
    width: '100%',
    padding: '8px',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 6,
    color: '#2563eb',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  hint: { fontSize: 11, color: '#9ca3af', marginTop: 6, lineHeight: 1.5 },
  hintWarn: { fontSize: 11, color: '#d97706', marginTop: 6 },
  propGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  propRow: { display: 'flex', alignItems: 'center', gap: 8 },
  propLabel: { fontSize: 11, color: '#6b7280', width: 52, flexShrink: 0 },
  dimRow: { display: 'flex', gap: 6 },
  twoCol: { display: 'flex', gap: 6 },
  dimLabel: { fontSize: 10, color: '#9ca3af', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 },
  inp: {
    width: '100%',
    padding: '4px 7px',
    border: '1px solid #d1d5db',
    borderRadius: 5,
    fontSize: 12,
    color: '#1a1a2e',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  },
  colorPicker: {
    width: 32,
    height: 28,
    border: '1px solid #d1d5db',
    borderRadius: 4,
    padding: 2,
    cursor: 'pointer',
    background: 'none',
  },
  deleteBtn: {
    marginTop: 10,
    width: '100%',
    padding: '6px',
    background: '#fee2e2',
    border: '1px solid #fca5a5',
    borderRadius: 5,
    color: '#dc2626',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  clearBtn: {
    padding: '3px 8px',
    background: '#fee2e2',
    border: '1px solid #fca5a5',
    borderRadius: 4,
    color: '#dc2626',
    fontSize: 11,
    cursor: 'pointer',
  },
  addSmallBtn: {
    padding: '3px 8px',
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 4,
    color: '#2563eb',
    fontSize: 11,
    cursor: 'pointer',
  },
  wallCard: {
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    padding: '8px 10px',
    marginBottom: 8,
    background: '#fff',
  },
  wallCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  wallCardTitle: { fontSize: 11, fontWeight: 600, color: '#374151' },
  iconBtn: {
    border: 'none',
    background: '#fee2e2',
    color: '#dc2626',
    borderRadius: 3,
    padding: '1px 5px',
    cursor: 'pointer',
    fontSize: 11,
  },
  measureRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
    borderBottom: '1px solid #f0f0f0',
    gap: 8,
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 8px',
    borderRadius: 5,
    cursor: 'pointer',
    border: '1px solid transparent',
    marginBottom: 2,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    flexShrink: 0,
    border: '1px solid rgba(0,0,0,0.1)',
  },
}
