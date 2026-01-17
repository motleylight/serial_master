# Refine Serial Header Layout

## Goal Description
Modify the serial parameters header in `ControlPanel.tsx` so that when the window is resized to a small width, the "Connect" button remains visible while other controls (Port selection, Baud rate, etc.) are hidden/covered.

## Proposed Changes
### UI
#### [MODIFY] [ControlPanel.tsx](file:///d:/SerialMaster/src/ui/src/components/ControlPanel.tsx)
- Remove `flex-wrap` from the main header container.
- Wrap the serial parameters (Port, Baud, Extra Settings, Port Sharing, Scripting) in a new `div` container.
- Apply `flex-1`, `flex`, `items-center`, `overflow-hidden`, `min-w-0`, and `gap-1.5` to this new container.
- Ensure the "Connect" button sits outside this container with `flex-shrink-0` and `ml-1.5` (or rely on parent gap).

## Verification Plan
### Manual Verification
- Resize the application window horizontally.
- Verify that as the window shrinks:
    - The "Connect" button remains visible on the right.
    - The other controls (Scripting, Port Sharing, etc.) are clipped/hidden from right to left (or simply covered) as space runs out.
    - The layout does not break (no vertical stacking of buttons).
