# Word Wrap Implementation Failure (VariableSizeList)

## Issue Description
Attempted to migrate `TerminalContainer` from `FixedSizeList` to `VariableSizeList` to support dynamic row heights for the "Word Wrap" feature.
This resulted in persistent runtime errors and white screens in the Vite development environment.

## Symptoms
1. **Missing Exports**:
   - Error: `SyntaxError: The requested module ... does not provide an export named 'VariableSizeList'`
   - Browser investigation showed `react-window` module only exported a generic `List` and `Grid`, missing specific `VariableSizeList` and `FixedSizeList` named exports.
   - Using `import * as ReactWindow` revealed that `VariableSizeList` was `undefined` on the namespace object.

2. **Runtime TypeErrors**:
   - After forcing access to `List` (via `(ReactWindow as any).List`), the app crashed with:
     `TypeError: Cannot convert undefined or null to object`
     at `Object.values` within `react-window` internals.
   - This suggests the generic `List` export might not be a drop-in replacement for `VariableSizeList`, or it requires specific props that were not satisfied.

## Attempts Validation
1. **Namespace Import**: `import * as ReactWindow` -> Failed (exports missing).
2. **Vite Optimization**: Added `react-window` to `optimizeDeps` in `vite.config.ts`. -> Failed to resolve missing exports.
3. **Manual Fallback**: `const List = ReactWindow.List`. -> Resulted in internal `TypeError`.
4. **Forced Fixed Mode**: Tried passing constant `itemSize={20}` to the generic `List`. -> Error persisted.

## Resolution
Reverted to `FixedSizeList` to restore application stability.
The "Word Wrap" feature currently truncates text or hides overflow rather than expanding row height.

## Future Recommendations
1. **Investigate Build System**: The root cause is likely specifically how Vite handles the `react-window` CommonJS build. `react-window` 2.2.5 is old and might need specific aliasing or a different build configuration.
2. **Alternative Library**: Consider `react-virtuoso` which is more modern and handles dynamic heights (auto-sizing) much better out of the box.
3. **Custom Implementation**: If `react-window` remains problematic, a simple custom virtual scroller might be easier than fighting the bundler.
