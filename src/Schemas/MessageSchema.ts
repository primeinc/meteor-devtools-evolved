import type { JSONSchema7 } from 'json-schema'

/**
 * JSON Schema for Message type
 * Following JSON Schema Draft 2020-12 (compatible with Draft 7)
 */
export const MessageSchema: JSONSchema7 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://meteor-devtools-evolved/schemas/message',
  title: 'Message',
  description: 'Message structure for meteor-devtools-evolved communication',
  type: 'object',
  required: ['eventType', 'data'],
  properties: {
    eventType: {
      type: 'string',
      enum: [
        'ddp-event',
        'minimongo-get-collections',
        'ddp-run-method',
        'console',
        'sync-subscriptions',
        'stats',
        'meteor-data-performance',
        'cache:clear',
      ],
      description: 'Type of event being communicated',
    },
    data: {
      description: 'Payload data for the message',
    },
  },
}

/**
 * JSON Schema for MessagePayload type
 */
export const MessagePayloadSchema: JSONSchema7 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://meteor-devtools-evolved/schemas/message-payload',
  title: 'MessagePayload',
  description: 'Message payload with source validation',
  type: 'object',
  required: ['source', 'eventType', 'data'],
  properties: {
    source: {
      type: 'string',
      const: 'meteor-devtools-evolved',
      description: 'Source identifier for message validation',
    },
    eventType: {
      type: 'string',
      enum: [
        'ddp-event',
        'minimongo-get-collections',
        'ddp-run-method',
        'console',
        'sync-subscriptions',
        'stats',
        'meteor-data-performance',
        'cache:clear',
      ],
      description: 'Type of event being communicated',
    },
    data: {
      description: 'Payload data for the message',
    },
  },
}

/**
 * JSON Schema for DDPLog type
 */
export const DDPLogSchema: JSONSchema7 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://meteor-devtools-evolved/schemas/ddp-log',
  title: 'DDPLog',
  description: 'DDP log entry structure',
  type: 'object',
  required: ['id', 'content'],
  properties: {
    id: {
      type: 'string',
      description: 'Unique identifier for the log entry',
    },
    content: {
      type: 'string',
      description: 'Raw content of the DDP message',
    },
    parsedContent: {
      type: 'object',
      description: 'Parsed DDP message content',
    },
    trace: {
      type: 'array',
      items: {
        type: 'object',
        required: ['url', 'callee'],
        properties: {
          url: { type: 'string' },
          callee: { type: 'string' },
        },
      },
      description: 'Stack trace information',
    },
    isInbound: {
      type: 'boolean',
      description: 'Whether the message is inbound',
    },
    isOutbound: {
      type: 'boolean',
      description: 'Whether the message is outbound',
    },
    timestamp: {
      type: 'number',
      description: 'Unix timestamp in milliseconds',
    },
    timestampPretty: {
      type: 'string',
      description: 'Human-readable timestamp',
    },
    timestampLong: {
      type: 'string',
      description: 'Full timestamp format',
    },
    size: {
      type: 'number',
      description: 'Size of the message in bytes',
    },
    sizePretty: {
      type: 'string',
      description: 'Human-readable size',
    },
    host: {
      type: 'string',
      description: 'Host where the message originated',
    },
    filterType: {
      type: ['string', 'null'],
      enum: [
        'heartbeat',
        'subscription',
        'collection',
        'method',
        'connection',
        null,
      ],
      description: 'Type of filter applied',
    },
    preview: {
      type: 'string',
      description: 'Preview text of the message',
    },
  },
}

/**
 * JSON Schema for StackTrace type
 */
export const StackTraceSchema: JSONSchema7 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://meteor-devtools-evolved/schemas/stack-trace',
  title: 'StackTrace',
  description: 'Stack trace entry',
  type: 'object',
  required: ['url', 'callee'],
  properties: {
    url: {
      type: 'string',
      description: 'URL where the function was called',
    },
    callee: {
      type: 'string',
      description: 'Name of the function called',
    },
  },
}
