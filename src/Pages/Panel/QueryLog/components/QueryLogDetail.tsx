import React, { FunctionComponent, useState, useCallback, useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import styled from 'styled-components'
import {
  Button,
  Tag,
  Tooltip,
  Checkbox,
  RadioGroup,
  Radio,
  Callout,
} from '@blueprintjs/core'
import { IconNames } from '@blueprintjs/icons'
import { MinimongoMethodLog } from '@/Stores/Panel/MinimongoStore/types'
import { minimongoCorrelator } from '@/Services/MinimongoDDPCorrelator'
import { usePanelStore } from '@/Stores/PanelStore'
import { PanelPage } from '@/Constants'

interface Props {
  log: MinimongoMethodLog | null
  onClose: () => void
}

const DetailContainer = styled.div`
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 450px;
  background: #1e2936;
  border-left: 1px solid #4a5568;
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.3);
`

const DetailHeader = styled.div`
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: #2d3748;
  border-bottom: 1px solid #4a5568;

  .title {
    flex: 1;
    font-weight: 600;
    color: #e2e8f0;
    font-size: 14px;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: #a0aec0;
    cursor: pointer;
    padding: 4px;

    &:hover {
      color: #e2e8f0;
    }
  }
`

const DetailContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px;

  .section {
    margin-bottom: 20px;

    h3 {
      font-size: 12px;
      font-weight: 600;
      color: #a0aec0;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
  }

  .code-block {
    background: #2d3748;
    border: 1px solid #4a5568;
    border-radius: 4px;
    padding: 8px;
    font-family: monospace;
    font-size: 11px;
    color: #e2e8f0;
    overflow-x: auto;
    white-space: pre;
  }

  .stack-trace {
    background: #2d3748;
    border: 1px solid #4a5568;
    border-radius: 4px;
    padding: 8px;
    font-family: monospace;
    font-size: 10px;
    color: #cbd5e0;
    overflow-x: auto;
    max-height: 200px;

    .stack-line {
      cursor: pointer;
      padding: 2px 0;

      &:hover {
        background: #394b59;
      }

      .file-link {
        color: #63b3ed;
        text-decoration: underline;
      }
    }
  }

  .copy-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;

    label {
      display: flex;
      align-items: center;
      font-size: 12px;
      color: #e2e8f0;
      cursor: pointer;

      input {
        margin-right: 8px;
      }
    }
  }

  .copy-preview {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 4px;
    padding: 12px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 11px;
    color: #c9d1d9;
    overflow-x: auto;
    max-height: 300px;
    white-space: pre;
    margin-top: 12px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;

    .stat {
      background: #2d3748;
      border: 1px solid #4a5568;
      border-radius: 4px;
      padding: 8px;

      .label {
        font-size: 10px;
        color: #a0aec0;
        text-transform: uppercase;
      }

      .value {
        font-size: 14px;
        color: #e2e8f0;
        font-weight: 600;
        margin-top: 4px;
      }
    }
  }
`

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return (
    date.toTimeString().split(' ')[0] +
    '.' +
    date.getMilliseconds().toString().padStart(3, '0')
  )
}

const generateConsoleScript = (
  log: MinimongoMethodLog,
  includeDisplay: boolean,
) => {
  const query = `${log.collectionName}.${log.method}(${JSON.stringify(
    log.selector || {},
  )}${log.options ? ', ' + JSON.stringify(log.options) : ''})${
    log.method === 'find' ? '.fetch()' : ''
  }`

  if (!includeDisplay) {
    return query
  }

  const collName = log.collectionName
  const methodName = log.method

  return `(() => {
  const r = ${query};
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;top:10px;right:10px;max-width:400px;background:white;border:2px solid #4299e1;padding:16px;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:9999;';
  d.innerHTML = '<h3>Results (${collName}.${methodName})</h3><pre style="max-height:400px;overflow:auto">' + JSON.stringify(r, null, 2) + '</pre><button onclick="this.parentElement.remove()" style="position:absolute;top:10px;right:10px">×</button>';
  document.body.appendChild(d);
  return r;
})()`
}

const generateStandaloneScript = (
  log: MinimongoMethodLog,
  options: {
    includeDDPClient: boolean
    includeLoginBoilerplate: boolean
    includeDisplayCode: boolean
  },
) => {
  const parts = []

  if (options.includeDDPClient) {
    parts.push(`// DDP Client Setup
import DDP from 'ddp.js';

const ddp = new DDP({
  endpoint: window.location.origin + '/sockjs',
  SocketConstructor: WebSocket
});

ddp.on('connected', () => {
  console.log('Connected to Meteor server');
});
`)
  }

  if (options.includeLoginBoilerplate) {
    parts.push(`// Login with stored token
const loginWithToken = async () => {
  const token = localStorage.getItem('Meteor.loginToken');
  const userId = localStorage.getItem('Meteor.userId');

  if (!token || !userId) {
    console.error('No stored login token found. Please login first.');
    return false;
  }

  return new Promise((resolve, reject) => {
    Meteor.loginWithToken(token, (error) => {
      if (error) {
        console.error('Login failed:', error);
        reject(error);
      } else {
        console.log('Logged in as user:', userId);
        resolve(true);
      }
    });
  });
};

// Wait for login before querying
await loginWithToken();
`)
  }

  parts.push(`// Collection Setup
const ${log.collectionName} = new Mongo.Collection('${log.collectionName}');

// Subscribe to data (adjust subscription name as needed)
const sub = Meteor.subscribe('${log.collectionName}.all', {
  onReady: () => console.log('Subscription ready'),
  onStop: (error) => error && console.error('Subscription stopped:', error)
});
`)

  parts.push(`// Execute Query
const selector = ${JSON.stringify(log.selector || {}, null, 2)};
const options = ${JSON.stringify(log.options || {}, null, 2)};

const results = ${log.collectionName}.${log.method}(selector${
    log.options ? ', options' : ''
  })${log.method === 'find' ? '.fetch()' : ''};

console.log('Query Results:', results);
`)

  if (options.includeDisplayCode) {
    const collName = log.collectionName
    const methodName = log.method

    parts.push(`// Display Results on Page
const displayResults = (data) => {
  const existingDisplay = document.getElementById('meteor-query-results');
  if (existingDisplay) existingDisplay.remove();

  const display = document.createElement('div');
  display.id = 'meteor-query-results';
  display.style.cssText = \`
    position: fixed;
    top: 10px;
    right: 10px;
    max-width: 400px;
    max-height: 80vh;
    overflow: auto;
    background: white;
    border: 2px solid #4299e1;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    z-index: 9999;
    font-family: monospace;
    font-size: 12px;
  \`;

  display.innerHTML = \`
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
      <h3 style="margin: 0; color: #2b6cb5;">Query Results</h3>
      <button onclick="this.parentElement.parentElement.remove()"
              style="background: #ef4444; color: white; border: none;
                     border-radius: 4px; padding: 4px 8px; cursor: pointer;">×</button>
    </div>
    <div style="margin-bottom: 8px; color: #666;">
      <strong>Collection:</strong> ${collName}<br>
      <strong>Method:</strong> ${methodName}<br>
      <strong>Count:</strong> \${Array.isArray(data) ? data.length : 1}<br>
      <strong>Time:</strong> \${new Date().toLocaleTimeString()}
    </div>
    <pre style="background: #f3f4f6; padding: 8px; border-radius: 4px;
                overflow: auto; max-height: 400px;">\${JSON.stringify(data, null, 2)}</pre>
  \`;

  document.body.appendChild(display);
};

displayResults(results);

// Auto-refresh every 2 seconds (optional)
const autoRefresh = setInterval(() => {
  const freshResults = ${log.collectionName}.${log.method}(selector${
      log.options ? ', options' : ''
    })${log.method === 'find' ? '.fetch()' : ''};
  displayResults(freshResults);
}, 2000);

// Stop auto-refresh after 30 seconds
setTimeout(() => clearInterval(autoRefresh), 30000);
`)
  }

  parts.push(`// Cleanup (run when done)
// sub.stop();  // Stop subscription
// ddp.disconnect();  // Disconnect DDP client
`)

  return parts.join('\n')
}

export const QueryLogDetail: FunctionComponent<Props> = observer(
  ({ log, onClose }) => {
    const panelStore = usePanelStore()
    const [copyFormat, setCopyFormat] = useState<'console' | 'script'>(
      'console',
    )
    const [copyOptions, setCopyOptions] = useState({
      includeDDPClient: false,
      includeLoginBoilerplate: false,
      includeDisplayCode: true,
    })

    if (!log) return null

    const correlation = minimongoCorrelator.getCorrelationForQuery(log)
    const hasCorrelation = correlation.correlationConfidence !== 'NONE'

    const handleCopy = useCallback(() => {
      let code = ''

      if (copyFormat === 'console') {
        code = generateConsoleScript(log, copyOptions.includeDisplayCode)
      } else {
        code = generateStandaloneScript(log, copyOptions)
      }

      navigator.clipboard.writeText(code)
    }, [log, copyFormat, copyOptions])

    const handleJumpToDDP = () => {
      // DISABLED - Investigating data clearing issue
      console.warn('Jump to DDP disabled - investigating data clearing issue')

      // Original code commented out:
      // const relatedDDP = panelStore.ddpStore.collection.find(ddp => {
      //   if (!ddp.parsedContent?.collection || !ddp.timestamp) return false
      //   return ddp.parsedContent.collection === log.collectionName &&
      //          Math.abs(ddp.timestamp - log.timestamp) < 100
      // })
      // if (relatedDDP) {
      //   panelStore.setSelectedTabId(PanelPage.DDP)
      // }
    }

    const handleViewCollection = () => {
      // DISABLED - This might be clearing site data
      // panelStore.setSelectedTabId(PanelPage.MINIMONGO)
      // panelStore.minimongoStore.setActiveCollection(log.collectionName)
      console.warn('View Collection disabled - potential data clearing issue')
    }

    return (
      <DetailContainer>
        <DetailHeader>
          <span className='title'>
            {log.collectionName}.{log.method}()
          </span>
          <button className='close-btn' onClick={onClose}>
            ×
          </button>
        </DetailHeader>

        <DetailContent>
          {/* Query Info */}
          <div className='section'>
            <h3>Query Details</h3>
            <div className='stats-grid'>
              <div className='stat'>
                <div className='label'>Time</div>
                <div className='value'>{formatTime(log.timestamp)}</div>
              </div>
              <div className='stat'>
                <div className='label'>Duration</div>
                <div className='value'>{log.runtime}ms</div>
              </div>
              <div className='stat'>
                <div className='label'>Collection</div>
                <div className='value'>{log.collectionName}</div>
              </div>
              <div className='stat'>
                <div className='label'>Method</div>
                <div className='value'>{log.method}</div>
              </div>
            </div>
          </div>

          {/* Selector */}
          {log.selector && (
            <div className='section'>
              <h3>Selector</h3>
              <div className='code-block'>
                {JSON.stringify(log.selector, null, 2)}
              </div>
            </div>
          )}

          {/* Options */}
          {log.options && Object.keys(log.options).length > 0 && (
            <div className='section'>
              <h3>Options</h3>
              <div className='code-block'>
                {JSON.stringify(log.options, null, 2)}
              </div>
            </div>
          )}

          {/* DDP Correlation */}
          {hasCorrelation && (
            <div className='section'>
              <h3>DDP Activity</h3>
              <Callout intent='primary' icon='data-connection'>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <Tag intent='success' minimal>
                      {correlation.addedDocuments} Added
                    </Tag>
                    <Tag intent='warning' minimal style={{ marginLeft: 4 }}>
                      {correlation.changedDocuments} Changed
                    </Tag>
                    <Tag intent='danger' minimal style={{ marginLeft: 4 }}>
                      {correlation.removedDocuments} Removed
                    </Tag>
                  </div>
                  <Button
                    small
                    intent='primary'
                    text='View in DDP'
                    onClick={handleJumpToDDP}
                  />
                </div>
              </Callout>
            </div>
          )}

          {/* Actions */}
          <div className='section'>
            <h3>Actions</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                small
                intent='primary'
                icon='database'
                text='View Collection'
                onClick={handleViewCollection}
              />
              <Button
                small
                intent='none'
                icon='duplicate'
                text='Copy Query'
                onClick={handleCopy}
              />
            </div>
          </div>

          {/* Copy Options */}
          <div className='section'>
            <h3>Copy As</h3>
            <RadioGroup
              selectedValue={copyFormat}
              onChange={e =>
                setCopyFormat(e.currentTarget.value as 'console' | 'script')
              }
            >
              <Radio label='Console (One-liner)' value='console' />
              <Radio label='Standalone Script' value='script' />
            </RadioGroup>

            {copyFormat === 'script' && (
              <div className='copy-options'>
                <Checkbox
                  checked={copyOptions.includeDDPClient}
                  onChange={e =>
                    setCopyOptions({
                      ...copyOptions,
                      includeDDPClient: e.currentTarget.checked,
                    })
                  }
                  label='Include DDP Client Setup'
                />
                <Checkbox
                  checked={copyOptions.includeLoginBoilerplate}
                  onChange={e =>
                    setCopyOptions({
                      ...copyOptions,
                      includeLoginBoilerplate: e.currentTarget.checked,
                    })
                  }
                  label='Include Login with Token (for authenticated queries)'
                />
                <Checkbox
                  checked={copyOptions.includeDisplayCode}
                  onChange={e =>
                    setCopyOptions({
                      ...copyOptions,
                      includeDisplayCode: e.currentTarget.checked,
                    })
                  }
                  label='Display Results on Page'
                />
              </div>
            )}

            <div className='copy-preview'>
              {/* Generate preview as plain text - DO NOT execute */}
              {copyFormat === 'console'
                ? generateConsoleScript(log, copyOptions.includeDisplayCode)
                : generateStandaloneScript(log, copyOptions)}
            </div>
          </div>

          {/* Stack Trace */}
          {log.stackTrace && (
            <div className='section'>
              <h3>Stack Trace</h3>
              <div className='stack-trace'>
                {log.stackTrace
                  .split('\n')
                  .slice(1)
                  .map((line, i) => (
                    <div key={i} className='stack-line'>
                      {line}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </DetailContent>
      </DetailContainer>
    )
  },
)
