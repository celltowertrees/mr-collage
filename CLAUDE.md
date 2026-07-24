## Features

### Infinite Canvas Collage Platform
- **Requested:** 2026-06-01
- **Ask:** Build a digital collage platform on an infinite canvas, replacing the earlier tldraw shape-tutorial scaffold.

```gherkin
Feature: Infinite Canvas Collage Platform
  # src/components/Canvas.tsx, src/components/CollageImageNode.tsx, src/hooks/useCollage.ts, src/hooks/useImageLoader.ts, src/store.ts

  Scenario: Add an image via upload, paste, or drag-and-drop
    Given the canvas is open
    When the user uploads a file, pastes an image from the clipboard, or drags an image file onto the canvas
    Then a new image node appears on the canvas at the current viewport center

  Scenario: Pan and zoom the canvas
    Given one or more images are on the canvas
    When the user scrolls to zoom or drags with the pan tool active
    Then the canvas view scale and position update accordingly

  Scenario: Transform a selected image
    Given an image is selected
    When the user drags, resizes, or rotates it, or adjusts its opacity or z-order
    Then the image's position, size, rotation, opacity, or stacking order updates and persists

  Scenario: Use keyboard shortcuts
    Given no text input is focused
    When the user presses "V", "H", holds Space, or presses Delete/Backspace
    Then the tool switches to select or pan, or the selected image is deleted, respectively

  Scenario: Export the collage as JPEG
    Given at least one image is on the canvas
    When the user clicks "Export JPEG"
    Then a JPEG file cropped to the content's bounding box downloads at 2x pixel ratio

  Scenario: Export the collage as ICP JSON
    Given at least one image is on the canvas
    When the user clicks "Export JSON"
    Then a JSON file describing each image's position, size, rotation, opacity, z-index, mask, and shadow (if set) downloads
```

### Image Masking (Circle / Rectangle / Freeform Polygon)
- **Requested:** 2026-06-02
- **Ask:** Let images be masked into circle, rectangle, or freeform shapes.

```gherkin
Feature: Image Masking (Circle / Rectangle / Freeform Polygon)
  # src/types.ts, src/hooks/useMaskDrawer.ts, src/components/CollageImageNode.tsx, src/components/Toolbar.tsx

  Scenario: Draw a circle or rectangle mask
    Given an image is selected and a mask tool (circle or rectangle) is active
    When the user clicks and drags on the image
    Then a mask of that shape and size is applied, clipping the image to it

  Scenario: Draw a freeform polygon mask
    Given an image is selected and the polygon mask tool is active
    When the user clicks to add points and double-clicks to close the shape
    Then a polygon mask is applied, clipping the image to the traced outline

  Scenario: Clear a mask
    Given an image has a mask applied
    When the user clicks "Clear Mask"
    Then the mask is removed and the full, unclipped image is shown again
```

### IndexedDB Image Storage
- **Requested:** 2026-06-02
- **Ask:** Fix collages failing to save once image data got large — localStorage was hitting its quota (`QuotaExceededError`).

```gherkin
Feature: IndexedDB Image Storage
  # src/store.ts

  Scenario: Save a collage with large images
    Given the collage contains images whose combined data would exceed localStorage's quota
    When the app auto-saves
    Then each image's data URL is written to IndexedDB and its metadata is written to localStorage without throwing QuotaExceededError

  Scenario: Reload a saved collage
    Given a collage was previously saved
    When the app loads
    Then each image's metadata from localStorage is paired with its data URL from IndexedDB and rendered on the canvas

  Scenario: Recover from a lost image blob
    Given an image's metadata exists in localStorage but its data URL is missing from IndexedDB
    When the app loads
    Then that image is skipped rather than rendered broken or crashing the load

  Scenario: Prune orphaned image blobs
    Given an image was deleted from the collage
    When the app auto-saves
    Then that image's entry is removed from IndexedDB
```

### Theme System (CSS Custom Properties)
- **Requested:** 2026-06-02
- **Ask:** Centralize the toolbar/UI's visual styling so it can be restyled from one place instead of scattered magic values.

```gherkin
Feature: Theme System (CSS Custom Properties)
  # src/theme.css, src/App.css

  Scenario: Restyle the UI from one place
    Given theme.css defines CSS custom properties for canvas, toolbar, buttons, accent/danger, and mask-preview colors
    When a property value in theme.css is changed
    Then every component consuming that property reflects the new value with no other code changes

  Scenario: No runtime theme switching yet
    Given the theme is defined as static CSS custom properties
    When the app is used
    Then there is no user-facing control to switch themes at runtime
```

### Drop Shadow on Masked Objects
- **Requested:** 2026-07-24
- **Ask:** Add a drop shadow to any object in the collage, and have the shadow follow the mask's shape if one is applied.

```gherkin
Feature: Drop Shadow on Masked Objects
  # src/types.ts, src/components/CollageImageNode.tsx, src/components/Toolbar.tsx, src/store.ts

  Scenario: Shadow on an unmasked image
    Given an image has no mask applied
    When the user enables Drop Shadow in the toolbar
    Then a shadow is cast directly from the image, following its alpha silhouette

  Scenario: Shadow on a masked image
    Given an image has a mask applied (circle, rectangle, or polygon)
    When the user enables Drop Shadow
    Then the shadow follows the outline of the mask shape rather than the image's full bounding box

  Scenario: Adjust shadow appearance
    Given Drop Shadow is enabled on an image
    When the user changes the shadow color, blur, offset, or opacity in the toolbar
    Then the rendered shadow updates to match

  Scenario: Export includes shadow data
    Given an image has Drop Shadow enabled
    When the user exports the collage as ICP JSON
    Then the image's shadow settings are included in the exported data
```
