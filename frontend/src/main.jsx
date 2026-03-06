import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// Import your publishable key from environment variables
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Clerk Publishable Key - check VITE_CLERK_PUBLISHABLE_KEY environment variable")
}

// Ensure we're using HTTPS in production
if (window.location.protocol !== 'https:' && import.meta.env.MODE === 'production') {
  window.location.protocol = 'https:'
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
      <App />
  </React.StrictMode>,
)