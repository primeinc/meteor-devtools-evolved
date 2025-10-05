import React, { useState } from 'react'
import { observer } from 'mobx-react-lite'
import {
  Button,
  Card,
  Classes,
  Collapse,
  Icon,
  NonIdealState,
  Tab,
  Tabs,
} from '@blueprintjs/core'
import { useStore } from '../../../Stores/PanelStore'
import MinimongoNavigator from './MinimongoNavigator'
import MinimongoContainer from './MinimongoContainer'
import MinimongoQueryView from './MinimongoQueryView' // Import the new component

const Minimongo = observer(() => {
  const { minimongoStore } = useStore()
  const { currentCollection, selectedCollection } = minimongoStore
  const [activeTab, setActiveTab] = useState('documents')

  if (!selectedCollection) {
    return (
      <NonIdealState
        icon='database'
        title='No collection selected'
        description='Select a collection from the list to view its documents and queries.'
      />
    )
  }

  if (!currentCollection) {
    return (
      <NonIdealState
        icon='error'
        title='Collection not found'
        description={`The selected collection "${selectedCollection}" could not be found.`}
      />
    )
  }

  return (
    <div className='flex h-full flex-col'>
      <MinimongoNavigator />
      <div className='flex-grow overflow-auto p-2'>
        <Tabs
          id='MinimongoTabs'
          selectedTabId={activeTab}
          onChange={(tabId: string) => setActiveTab(tabId)}
        >
          <Tab
            id='documents'
            title='Documents'
            panel={<MinimongoContainer collection={currentCollection} />}
          />
          <Tab
            id='queries'
            title={
              <>
                Queries & Schema{' '}
                <Icon icon='flame' className='text-gold-500 ml-2' />
              </>
            }
            panel={<MinimongoQueryView collectionStore={currentCollection} />}
          />
        </Tabs>
      </div>
    </div>
  )
})

export default Minimongo
