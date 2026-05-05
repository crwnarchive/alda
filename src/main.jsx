import React from 'react'
import ReactDOM from 'react-dom/client'
import ALDA from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ALDA />
  </React.StrictMode>,
)

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}
