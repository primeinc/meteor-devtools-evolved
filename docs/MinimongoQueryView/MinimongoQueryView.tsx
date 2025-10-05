import React from 'react';
import { observer } from 'mobx-react-lite';
import { Card, H4, Divider } from '@blueprintjs/core';
import CollectionStore from '../../../Stores/Panel/MinimongoStore/CollectionStore';
import SchemaDisplay from './components/SchemaDisplay';
import MethodLogDisplay from './components/MethodLogDisplay';

interface IMinimongoQueryViewProps {
  collectionStore: CollectionStore;
}

const MinimongoQueryView = observer(({ collectionStore }: IMinimongoQueryViewProps) => {
  return (
    <div className="p-1 space-y-4">
      <Card elevation={1}>
        <H4>Inferred Schema</H4>
        <p className="bp3-text-muted mb-2">
          This schema is automatically generated based on the documents currently in the collection.
        </p>
        <SchemaDisplay schema={collectionStore.schema} />
      </Card>

      <Divider />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card elevation={1}>
          <H4>Recent Queries</H4>
           <p className="bp3-text-muted mb-2">
             Live view of `find()` and `findOne()` calls.
           </p>
          <MethodLogDisplay
            logs={collectionStore.queries}
            type="query"
            collectionName={collectionStore.name}
          />
        </Card>
        <Card elevation={1}>
          <H4>Recent Mutations</H4>
           <p className="bp3-text-muted mb-2">
             Live view of inserts, updates, and removes.
           </p>
          <MethodLogDisplay
            logs={collectionStore.mutations}
            type="mutation"
            collectionName={collectionStore.name}
          />
        </Card>
      </div>
    </div>
  );
});

export default MinimongoQueryView;
