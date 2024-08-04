import './App.css'
import { CubeUtil } from './utils/CubeUtil';

import { Tldraw } from 'tldraw'
import './index.css'

const CustomShapes = [CubeUtil]

function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
        <Tldraw shapeUtils={CustomShapes} onMount={(editor) => {
            editor.createShapes([{ type: 'cube'}])
        }}/>
    </div>
  )
}

export default App;
