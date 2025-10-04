import React, { useState } from 'react';
import { Button, Card, Classes, Collapse, Icon, NonIdealState, Tooltip } from '@blueprintjs/core';
import ObjectTreerinator from '../../../../Utils/ObjectTreerinator';

interface IMethodLog {
  method?: string;
  selector?: any;
  options?: any;
  args?: any;
  stack?: string;
  timestamp: number;
}

interface IMethodLogDisplayProps {
  logs: IMethodLog[];
  type: 'query' | 'mutation';
  collectionName: string;
}

const MethodLogItem = ({ log, type }: { log: IMethodLog, type: 'query' | 'mutation' }) => {
  const [isStackOpen, setIsStackOpen] = useState(false);

  const methodName = type === 'query' ? log.selector ? 'find' : 'findOne' : log.method;
  const data = type === 'query' ? { selector: log.selector, options: log.options } : log.args;

  return (
    <Card className="mb-2 p-2" elevation={0}>
       <div className="flex justify-between items-center">
         <div>
            <code className="font-bold">{methodName}()</code>
            <span className="bp3-text-muted text-xs ml-2">
                {new Date(log.timestamp).toLocaleTimeString()}
            </span>
         </div>
         {log.stack && (
            <Tooltip content="Show Stack Trace">
                <Button small minimal icon="code" onClick={() => setIsStackOpen(!isStackOpen)} />
            </Tooltip>
         )}
       </div>
       <div className="p-2 bg-gray-100 rounded mt-2">
         <ObjectTreerinator json={data} />
       </div>
      {log.stack && (
        <Collapse isOpen={isStackOpen}>
          <pre className="text-xs p-2 mt-2 bg-gray-800 text-white rounded overflow-auto">
            {log.stack.split('\n').slice(1).join('\n')}
          </pre>
        </Collapse>
      )}
    </Card>
  );
}


const MethodLogDisplay = ({ logs, type, collectionName }: IMethodLogDisplayProps) => {
  if (logs.length === 0) {
    return (
      <NonIdealState
        icon={type === 'query' ? 'search-template' : 'edit'}
        title={`No ${type}s recorded`}
        description={`Perform some ${type}s on the \`${collectionName}\` collection to see them here.`}
      />
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto max-h-96 pr-2">
      {logs.map((log, index) => (
        <MethodLogItem key={`${log.timestamp}-${index}`} log={log} type={type} />
      ))}
    </div>
  );
};

export default MethodLogDisplay;
