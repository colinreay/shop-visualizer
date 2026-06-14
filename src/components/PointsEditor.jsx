// Reusable [x, y] coordinate list editor used by the wall/perimeter editors
// (App convention: XY = ground plane, Z = up)

export default function PointsEditor({ points, onChange, unit = 'm', step = '0.5' }) {
  function update(i, axis, raw) {
    const val = raw === '' ? 0 : parseFloat(raw)
    const next = points.map((p, j) =>
      j === i ? (axis === 0 ? [val, p[1]] : [p[0], val]) : p
    )
    onChange(next)
  }

  function addPoint() {
    const last = points[points.length - 1] ?? [0, 0]
    onChange([...points, [last[0], last[1] + 2]])
  }

  function removePoint(i) {
    onChange(points.filter((_, j) => j !== i))
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.hCell}>X ({unit})</span>
        <span style={s.hCell}>Y ({unit})</span>
        <span style={{ width: 24 }} />
      </div>
      {points.map((pt, i) => (
        <div key={i} style={s.row}>
          <input
            type="number"
            step={step}
            style={s.inp}
            value={pt[0]}
            onChange={(e) => update(i, 0, e.target.value)}
          />
          <input
            type="number"
            step={step}
            style={s.inp}
            value={pt[1]}
            onChange={(e) => update(i, 1, e.target.value)}
          />
          <button style={s.del} onClick={() => removePoint(i)}>✕</button>
        </div>
      ))}
      <button style={s.add} onClick={addPoint}>+ Add Point</button>
    </div>
  )
}

const s = {
  wrap: { fontSize: 12 },
  header: { display: 'flex', gap: 4, marginBottom: 2, paddingLeft: 2 },
  hCell: { flex: 1, color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' },
  inp: {
    flex: 1,
    padding: '3px 6px',
    border: '1px solid #d0d5dd',
    borderRadius: 4,
    fontSize: 12,
    background: '#fff',
    color: '#1a1a2e',
    outline: 'none',
  },
  del: {
    width: 24,
    height: 24,
    border: 'none',
    borderRadius: 4,
    background: '#fee2e2',
    color: '#dc2626',
    cursor: 'pointer',
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  add: {
    marginTop: 4,
    padding: '4px 8px',
    border: '1px dashed #93c5fd',
    borderRadius: 4,
    background: '#eff6ff',
    color: '#2563eb',
    fontSize: 11,
    cursor: 'pointer',
    width: '100%',
  },
}
