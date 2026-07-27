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

### Undo/Redo History
- **Requested:** 2026-07-24
- **Ask:** Add a history management system so changes can be undone with Ctrl+Z.

```gherkin
Feature: Undo/Redo History
  # src/hooks/useHistory.ts, src/hooks/useCollage.ts, src/App.tsx, src/components/Toolbar.tsx — tested in src/__tests__/history.test.ts, e2e/history.spec.ts

  Scenario: Undo reverts the most recent change
    Given the collage has just been changed (e.g. an image was added, moved, or deleted)
    When the user presses Ctrl+Z (or Cmd+Z)
    Then the canvas returns to its state before that change

  Scenario: Redo reapplies an undone change
    Given a change was just undone
    When the user presses Ctrl+Shift+Z (or Cmd+Shift+Z)
    Then the canvas returns to the state it was in before the undo

  Scenario: Making a new change after an undo clears the redo history
    Given a change was just undone
    When the user makes a new change instead of redoing
    Then the previously undone change can no longer be redone

  Scenario: Undo/redo is a no-op when there is nothing to undo/redo
    Given no changes have been made (or all changes have already been undone)
    When the user presses Ctrl+Z
    Then the canvas is unaffected and nothing throws

  Scenario: Rapid, continuous edits coalesce into a single undo step
    Given the user is continuously adjusting a value (like an opacity or shadow slider)
    When the user presses Ctrl+Z once after finishing the adjustment
    Then the whole adjustment is undone in one step, not one step per intermediate value
```

### Arrow Key Nudge
- **Requested:** 2026-07-25
- **Ask:** Move the selected object pixel by pixel with the arrow keys.

```gherkin
Feature: Arrow Key Nudge
  # src/App.tsx, src/hooks/useCollage.ts — tested in e2e/arrow-nudge.spec.ts

  Scenario: Nudge the selected image with arrow keys
    Given an image is selected
    When the user presses an arrow key (Up, Down, Left, or Right)
    Then the image moves 1 pixel in that direction

  Scenario: Arrow keys do nothing when no image is selected
    Given no image is selected
    When the user presses an arrow key
    Then nothing on the canvas moves and nothing throws

  Scenario: Back-to-back nudges each accumulate
    Given an image is selected
    When several arrow key presses fire in quick succession (e.g. holding the key down)
    Then each press moves the image by 1 more pixel rather than the burst collapsing into a single pixel of movement

  Scenario: Rapid, repeated nudges coalesce into a single undo step
    Given the user has just nudged the selected image several times in a row
    When the user presses Ctrl+Z once
    Then the whole burst of nudges is undone in one step, not one pixel at a time
```

### Multi-Select and Group Move
- **Requested:** 2026-07-25
- **Ask:** Select a group of objects on the canvas and move them all at the same time.

```gherkin
Feature: Multi-Select and Group Move
  # src/components/Canvas.tsx, src/components/CollageImageNode.tsx, src/hooks/useCollage.ts, src/App.tsx — tested in e2e/multi-select.spec.ts

  Scenario: Marquee-select multiple images and move them together
    Given multiple images are on the canvas
    When the user drags a selection box over them and then drags any one of the selected images
    Then all selected images move by the same amount, preserving their positions relative to each other

  Scenario: Images outside the marquee are unaffected by a group move
    Given a marquee selection box overlaps only some of the images on the canvas
    When the user drags one of the selected images
    Then only the images inside the selection box move; the others stay in place

  Scenario: Nudge a multi-selection with the arrow keys
    Given multiple images are selected via a marquee
    When the user presses an arrow key
    Then all selected images move 1 pixel in that direction together

  Scenario: Clicking empty canvas clears the selection
    Given multiple images are selected via a marquee
    When the user clicks on an empty area of the canvas
    Then the selection is cleared and dragging an image afterward moves only that image
```

### CSS Blend Mode on Selected Object
- **Requested:** 2026-07-25
- **Ask:** Let any CSS blend mode be applied to the selected object, via a separate popup menu.

```gherkin
Feature: CSS Blend Mode on Selected Object
  # src/types.ts, src/components/Toolbar.tsx, src/components/CollageImageNode.tsx, src/store.ts — tested in e2e/blend-mode.spec.ts

  Scenario: Open the blend mode popup
    Given an image is selected
    When the user clicks the Blend Mode button in the toolbar
    Then a popup menu listing the available blend modes appears

  Scenario: Apply a blend mode to the selected image
    Given an image is selected and the blend mode popup is open
    When the user picks a blend mode (e.g. "Multiply")
    Then the image is composited against the layer beneath it using that blend mode, and the popup closes

  Scenario: Reset to Normal
    Given an image has a non-normal blend mode applied
    When the user picks "Normal" from the blend mode popup
    Then the image renders with plain (non-blended) compositing again

  Scenario: Export includes blend mode data
    Given an image has a non-normal blend mode applied
    When the user exports the collage as ICP JSON
    Then the image's blend mode is included in the exported data
```

### Crop an Image
- **Requested:** 2026-07-25
- **Ask:** Let an image be cropped, trimming it down to a smaller region instead of just masking it.

```gherkin
Feature: Crop an Image
  # src/types.ts, src/utils/geometry.ts, src/hooks/useCropDrawer.ts, src/components/CollageImageNode.tsx, src/components/Canvas.tsx, src/components/Toolbar.tsx, src/App.tsx, src/store.ts — tested in e2e/crop.spec.ts

  Scenario: Draw and apply a crop
    Given an image is selected and the Crop tool is active
    When the user drags a rectangle over part of the image and clicks "Apply Crop"
    Then the image's displayed content and bounding box shrink to just that dragged region

  Scenario: Cropped image keeps its cropped region anchored in place
    Given an image is selected and the Crop tool is active
    When the user drags a crop rectangle that isn't centered on the image and applies it
    Then the cropped region stays at the same canvas position after the crop is applied

  Scenario: Cancel a crop
    Given an image is selected, the Crop tool is active, and a crop rectangle has been drawn
    When the user clicks "Cancel Crop" instead of applying
    Then the image is unchanged and the tool returns to Select

  Scenario: Export includes crop data
    Given an image has been cropped
    When the user exports the collage as ICP JSON
    Then the image's crop rectangle is included in the exported data
```

### Export Scene to Static HTML
- **Requested:** 2026-07-25
- **Ask:** Export the current viewport to a valid, static HTML file with objects positioned relative to the viewport and all their styles retained.

```gherkin
Feature: Export Scene to Static HTML
  # src/store.ts, src/components/Toolbar.tsx, src/App.tsx — tested in src/__tests__/exportToStaticHTML.test.ts

  Scenario: Export the current viewport as static HTML
    Given at least one image is on the canvas within the current viewport
    When the user clicks "Export HTML"
    Then an HTML file downloads with each image positioned and sized to match its on-screen position relative to the current pan and zoom

  Scenario: Objects entirely outside the viewport are omitted from the markup
    Given an image's position places it entirely outside the current viewport bounds
    When the user exports HTML
    Then that image is left out of the exported markup entirely, rather than included but hidden

  Scenario: Objects that partially overlap the viewport are still included
    Given an image straddles the edge of the current viewport, partly on screen and partly off
    When the user exports HTML
    Then that image is included in the exported markup at its viewport-relative position

  Scenario: Exported HTML preserves visual styling
    Given an image has a mask, shadow, blend mode, crop, opacity, and z-index set
    When the user exports HTML
    Then the exported element reproduces the mask as a clip-path, the shadow as a drop-shadow filter that follows the mask shape, the blend mode as mix-blend-mode, the crop by scaling and offsetting the image within an overflow-hidden frame, and the opacity and stacking order

  Scenario: Images are embedded self-contained
    Given the collage contains images
    When the user exports HTML
    Then each image's data URL is embedded directly in an <img> tag, with no external file references
```

### Mirror an Image (Flip Horizontal / Vertical)
- **Requested:** 2026-07-26
- **Ask:** Add the ability to mirror an image.

```gherkin
Feature: Mirror an Image (Flip Horizontal / Vertical)
  # src/types.ts, src/components/CollageImageNode.tsx, src/components/Toolbar.tsx, src/store.ts — tested in e2e/flip-image.spec.ts

  Scenario: Flip an image horizontally
    Given an image is selected
    When the user clicks "Flip Horizontal" in the toolbar
    Then the image is mirrored left-to-right about its own center, and its position and size are unchanged

  Scenario: Flip an image vertically
    Given an image is selected
    When the user clicks "Flip Vertical" in the toolbar
    Then the image is mirrored top-to-bottom about its own center, and its position and size are unchanged

  Scenario: Flipping twice restores the original orientation
    Given an image has been flipped horizontally
    When the user clicks "Flip Horizontal" again
    Then the image returns to its original, unmirrored orientation

  Scenario: Export includes flip state
    Given an image has been flipped horizontally and/or vertically
    When the user exports the collage as ICP JSON
    Then the image's flip state is included in the exported data
```

### Gradient Fade Mask on an Image
- **Requested:** 2026-07-26
- **Ask:** Add a gradient mask anywhere on an image, drawn as a line, that blends it with whatever is behind it by fading from 100% to 0% opacity.

```gherkin
Feature: Gradient Fade Mask on an Image
  # src/types.ts, src/hooks/useGradientMaskDrawer.ts, src/components/CollageImageNode.tsx, src/components/Canvas.tsx, src/components/Toolbar.tsx, src/store.ts — tested in e2e/gradient-mask.spec.ts, src/__tests__/exportToStaticHTML.test.ts

  Scenario: Draw a gradient fade by dragging a line on the image
    Given an image is selected and the Gradient Fade tool is active
    When the user drags from one point to another on the image
    Then the image fades from fully opaque at the start point to fully transparent at the end point, staying opaque before the start and transparent past the end

  Scenario: Adjust the gradient line with its endpoint handles
    Given an image has a gradient fade applied and the Gradient Fade tool is still active
    When the user drags either endpoint handle to a new position
    Then the fade direction and distance update to match the new line

  Scenario: Gradient fade combines with a shape mask
    Given an image has both a shape mask (circle, rectangle, or polygon) and a gradient fade applied
    Then the image is clipped to the shape mask's outline and fades to transparent within that shape according to the gradient

  Scenario: Clear the gradient fade
    Given an image has a gradient fade applied
    When the user clicks "Clear Gradient"
    Then the fade is removed and the image returns to its normal opacity

  Scenario: Export includes gradient fade data
    Given an image has a gradient fade applied
    When the user exports the collage as ICP JSON
    Then the image's gradient start and end points are included in the exported data
```

### Circular Vignette on an Image
- **Requested:** 2026-07-27
- **Ask:** Add the option of a circular vignette around an image so the borders fade out, with an adjustable gradient transition between the inner and outer border.

```gherkin
Feature: Circular Vignette on an Image
  # src/types.ts, src/components/CollageImageNode.tsx, src/components/Toolbar.tsx, src/store.ts — tested in e2e/vignette.spec.ts, src/__tests__/exportToStaticHTML.test.ts

  Scenario: Enable a vignette
    Given an image is selected
    When the user clicks "Enable Vignette" in the toolbar
    Then the image's borders and corners fade to transparent in an ellipse fit to the image's own aspect ratio, centered on the image

  Scenario: Adjust the vignette's inner and outer radius
    Given an image has a vignette enabled
    When the user adjusts the Inner Radius or Outer Radius slider
    Then the distance from center where the fade starts and ends updates to match

  Scenario: Vignette combines with a shape mask and gradient fade
    Given an image has a shape mask and/or a gradient fade applied as well as a vignette
    Then all effects apply together — clipped to the shape, faded by the gradient, and faded again by the vignette

  Scenario: Disable the vignette
    Given an image has a vignette enabled
    When the user clicks "Disable Vignette"
    Then the fade is removed and the image returns to its normal opacity at the edges

  Scenario: Export includes vignette data
    Given an image has a vignette enabled
    When the user exports the collage as ICP JSON
    Then the image's vignette settings (enabled, inner radius, outer radius) are included in the exported data
```
