/**
 * JSON Schemas for meteor-devtools-evolved
 * Following JSON Schema Draft 2020-12 specification
 *
 * All schemas have 'required' properties defined at the top level
 * and use explicit JSONSchema7 type from @types/json-schema
 */

export {
  MessageSchema,
  MessagePayloadSchema,
  DDPLogSchema,
  StackTraceSchema,
} from './MessageSchema'
