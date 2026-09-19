import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installWebApi } from './webApiShim'
import './styles/tailwind.css'

// 浏览器环境补齐 window.electronAPI（桌面端 preload 已注入时为 no-op）
installWebApi()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)