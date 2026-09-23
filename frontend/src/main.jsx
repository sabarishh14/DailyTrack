import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Ensure we're using HTTPS in production
if (window.location.protocol !== 'https:' && import.meta.env.MODE === 'production') {
  window.location.protocol = 'https:'
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
      <App />
  </React.StrictMode>,
)