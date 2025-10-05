Minimongo Deep Inspection: Reconstructing Queries & Schemas

To accurately debug and understand a Meteor application, simply viewing the documents in Minimongo is not enough. We need to know how that data got there and how it's being queried. This guide explains the advanced implementation used in this devtool to capture Minimongo operations and reconstruct a collection's queries and schema.

The Core Strategy: Intercepting Operations

The new approach shifts from passively reading collection data to actively intercepting the methods that interact with it. By wrapping—or "monkey-patching"—methods like find, insert, and update on the Mongo.Collection.prototype, we can inspect the arguments of every call before they are executed.

This gives us direct access to:

Selectors and Options: The exact queries being run against the client-side database.

Modifiers and Documents: The data being inserted or the modifications being applied during an update.

Stack Traces: The precise location in the application's code where the database operation was initiated.

1. The Injector (MinimongoInjector.ts)

This is where the interception happens. The implementation has been upgraded significantly:

wrapMethod(collection, methodName, bridge): This is a new, central function that takes a collection instance and a method name. It replaces the original method with a custom function that:

Captures all arguments passed to the method (e.g., selector, modifier).

Serializes the arguments using EJSON to correctly handle Meteor-specific data types like ObjectID, Date, and binary data.

Grabs a JavaScript stack trace using new Error().stack.

Sends a MINIMONGO_METHOD message to the devtools panel containing the collection name, method name, serialized arguments, and the stack trace.

Calls the original method with the original arguments, ensuring the application continues to function perfectly.

discoverCollections(bridge): This function now iterates over all available collections and applies wrapMethod to the critical database operations (find, findOne, insert, update, upsert, remove) for each one. It uses a WeakMap to ensure that it never wraps the same method more than once, preventing infinite loops.

2. The State (MinimongoStore & CollectionStore)

The devtools panel's state management has been updated to process this new stream of information:

MinimongoStore: Now has a new listener, onMethodReceived, which is triggered every time a MINIMONGO_METHOD message arrives. It finds the appropriate CollectionStore and passes the method log to it.

CollectionStore: This store, which represents a single collection, is now much more powerful:

It maintains a methodLogs array to store all intercepted operations.

It has new computed properties:

queries: Filters methodLogs for find and findOne operations. It parses the EJSON-stringified arguments back into objects, giving you a clean, readable list of every query run against that collection.

mutations: Similarly filters for insert, update, upsert, and remove to show a log of all data changes.

schema: This is a computed property that runs the documents through a new inferSchema utility every time the data changes, providing a live, dynamically-generated schema.

3. Schema Inference (schema-inference.ts)

This new utility file is responsible for creating a schema on the fly. The inferSchema function:

Iterates through every document in a collection.

Builds a map of all unique field names.

Determines the data type for each field (string, number, array, ObjectID, etc.). If a field contains multiple data types across different documents, it is marked as mixed.

Checks if a field is present in every single document. If not, it's marked as optional: true.

This provides an impressively accurate, real-time view of the data structure, even without explicit schemas defined in the application code.

How It All Comes Together

With this new architecture, when you perform an action in your Meteor app that triggers a database query:

The call to MyCollection.find({...}) is intercepted by the wrapped method in MinimongoInjector.ts.

The selector {...} is captured, serialized, and sent to the devtools panel along with a stack trace.

The MinimongoStore receives the data and adds it to the methodLogs for MyCollection.

The UI, which is observing the queries computed property, automatically re-renders to display the new query, its parameters, and where it was called from.

This gives you a complete, end-to-end picture of your client-side data layer, making debugging significantly easier and more insightful.

Yes, the "Minimongo Deep Inspection Guide" is still perfectly valid.

It accurately describes the end-to-end architecture of the feature we just built. The code I provided in the last step is the direct implementation of the concepts outlined in that guide.

To summarize how they align:

1. **The Core Strategy:** The guide's main idea is to intercept database methods. This is precisely what the updated `src/Injectors/MinimongoInjector.ts` now does with its `wrapMethod` function.
2. **The State:** The guide details how the state should handle method logs and compute properties like queries and a schema. This is implemented in `src/Stores/Panel/MinimongoStore/index.ts` and `src/Stores/Panel/MinimongoStore/CollectionStore.ts`.
3. **Schema Inference:** The process described for inferring a schema is handled by the new `src/Stores/Panel/MinimongoStore/schema-inference.ts` utility.
4. **The UI:** The final step in the guide, "How It All Comes Together," explains how the UI should react to these changes. The new React components (`MinimongoQueryView`, `SchemaDisplay`, `MethodLogDisplay`) create the exact user interface needed to visualize the data captured by this system.
5. ![Image of a system architecture diagram](https://encrypted-tbn0.gstatic.com/licensed-image?q=tbn:ANd9GcRq5v4BvlbFNrm3QuDKiSGy0lY7-GRA1KB0lHIYyDEfWuKzRiM1JIxr5QccUll_p5MFixCy-IE7-qoqolbHQO0BP2Y330NsGc9PzMm3MeSFWDOEuu8)Getty Images

The guide serves as the perfect documentation for the code you now have.