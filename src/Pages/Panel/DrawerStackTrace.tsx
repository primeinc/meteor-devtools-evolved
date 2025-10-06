import { Classes, Drawer } from '@blueprintjs/core'
import classnames from 'classnames'
import React, { FunctionComponent } from 'react'

interface Props {
  activeStackTrace: StackTrace[] | null

  onClose(): void
}

export const DrawerStackTrace: FunctionComponent<Props> = ({
  activeStackTrace,
  onClose,
}) => (
  <Drawer
    icon='document'
    title='Stack Trace'
    isOpen={!!activeStackTrace}
    onClose={onClose}
    size='72%'
  >
    <div className={Classes.DRAWER_BODY}>
      <div className={classnames(Classes.DIALOG_BODY, 'mde-stack-trace')}>
        {activeStackTrace?.map((stack: StackTrace, index: number) => {
          const callee = stack?.callee?.trim() || 'Anonymous'
          const url = stack?.url?.trim()

          // Format like standard stack traces: "at functionName (file:line:col)"
          const fullLine = url ? `at ${callee} (${url})` : `at ${callee}`

          return (
            <pre key={index}>
              {url ? (
                <a href={url} target='_blank' rel='noopener noreferrer'>
                  {fullLine}
                </a>
              ) : (
                fullLine
              )}
            </pre>
          )
        })}
      </div>
    </div>
  </Drawer>
)
