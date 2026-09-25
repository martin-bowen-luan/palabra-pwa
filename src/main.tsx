import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/source-serif-4/wght.css'
import '@fontsource-variable/noto-sans-sc/wght.css'
import './styles/global.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter basename={import.meta.env.BASE_URL}><App /></BrowserRouter></React.StrictMode>,
)
