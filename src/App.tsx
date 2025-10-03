console.log('=== METEOR DEVTOOLS: App.tsx loaded ===')

import { FocusStyleManager } from '@blueprintjs/core'
import React from 'react'
import { render } from 'react-dom'
import { Options } from './Pages/Options'
import { Panel } from './Pages/Panel'
import { Popup } from './Pages/Popup'

import './Styles/Tailwind.css'
import './Styles/App.scss'

console.log('=== METEOR DEVTOOLS: Imports complete ===')

FocusStyleManager.onlyShowFocusOnTabs()

const panelElement = document.getElementById('panel')
const optionsElement = document.getElementById('options')
const popupElement = document.getElementById('popup')

console.log('=== METEOR DEVTOOLS: Elements found ===', {
  panel: !!panelElement,
  options: !!optionsElement,
  popup: !!popupElement
})

// Error boundary component for visible errors
const ErrorDisplay = ({ error }: { error: Error }) => (
  <div style={{
    padding: '20px',
    background: '#ff4444',
    color: 'white',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap'
  }}>
    <h2>Panel Failed to Load</h2>
    <p>{error.toString()}</p>
    <pre>{error.stack}</pre>
  </div>
)

// Wrap panel rendering in try-catch
if (panelElement) {
  console.log('=== METEOR DEVTOOLS: Rendering Panel ===')
  try {
    render(<Panel />, panelElement)
    console.log('=== METEOR DEVTOOLS: Panel rendered successfully ===')
  } catch (error) {
    console.error('=== METEOR DEVTOOLS: Failed to render panel ===', error)
    render(<ErrorDisplay error={error as Error} />, panelElement)
  }
} else if (document.body && window.location.href.includes('devtools-panel.html')) {
  // If we're on the panel page but no element found, show error
  document.body.innerHTML = `
    <div style="padding:20px;background:orange;color:black;font-family:monospace">
      <h2>Panel element not found!</h2>
      <p>Looking for element with id="panel"</p>
      <p>Current body HTML: ${document.body.innerHTML}</p>
    </div>
  `
}

optionsElement && render(<Options />, optionsElement)
popupElement && render(<Popup />, popupElement)
