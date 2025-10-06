import React from 'react'
import { Meteor } from 'meteor/meteor'
import { createRoot } from 'react-dom/client'
import { App } from '../imports/ui/App'

import '../imports/api/links'
import '../imports/api/random'

Meteor.startup(() => {
  const root = createRoot(document.getElementById('react-target'))
  root.render(<App />)
})
