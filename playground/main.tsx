import './kit.css'
import { enUS, setDefaultMessages } from '@shikiform/react'
import { english } from './language'
import { createRoot } from 'react-dom/client'
import { App } from './App'

if (english) setDefaultMessages(enUS)

createRoot(document.getElementById('root')!).render(<App />)
