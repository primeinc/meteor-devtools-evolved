import React from 'react'
import { ISchema } from '../../../../Stores/Panel/MinimongoStore/schema-inference'
import { HTMLTable, NonIdealState, Tag } from '@blueprintjs/core'

interface ISchemaDisplayProps {
  schema: ISchema
}

const SchemaDisplay = ({ schema }: ISchemaDisplayProps) => {
  const fields = Object.keys(schema)

  if (fields.length === 0) {
    return (
      <NonIdealState
        icon='graph'
        title='No Schema'
        description='Schema will be inferred once the collection has documents.'
      />
    )
  }

  return (
    <HTMLTable bordered condensed striped className='w-full'>
      <thead>
        <tr>
          <th>Field Name</th>
          <th>Type</th>
          <th>Optional</th>
        </tr>
      </thead>
      <tbody>
        {fields.sort().map(fieldName => (
          <tr key={fieldName}>
            <td>
              <code>{fieldName}</code>
            </td>
            <td>
              <Tag minimal intent='primary'>
                {schema[fieldName].type}
              </Tag>
            </td>
            <td>
              {schema[fieldName].optional ? (
                <Tag minimal intent='warning'>
                  true
                </Tag>
              ) : (
                'false'
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </HTMLTable>
  )
}

export default SchemaDisplay
