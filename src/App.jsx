import Sidebar from './components/Sidebar'
import Viewport from './components/Viewport'

function App() {
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      <Sidebar />
      <Viewport />
    </div>
  )
}

export default App
