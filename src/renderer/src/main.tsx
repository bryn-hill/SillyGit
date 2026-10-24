import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

window.addEventListener('error', (e) => {
  console.error('[uncaught]', e.message, e.error?.stack ?? '')
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandled-rejection]', e.reason)
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
