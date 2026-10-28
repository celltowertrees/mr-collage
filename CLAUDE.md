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

### Add Text to the Canvas
- **Requested:** 2026-07-27
- **Ask:** Add a text tool with basic typography controls (bold, italic, underline, color, size) and a font family picker, sourcing fonts from Google Fonts live in-app while keeping the HTML export fully self-contained.

```gherkin
Feature: Add Text to the Canvas
  # src/types.ts, src/utils/googleFonts.ts, src/components/CollageTextNode.tsx, src/components/TextEditOverlay.tsx, src/components/Canvas.tsx, src/components/Toolbar.tsx, src/hooks/useCollage.ts, src/App.tsx, src/store.ts — tested in src/__tests__/textObjects.test.ts, e2e/text-tool.spec.ts

  Scenario: Place a text object with the Text tool
    Given the Text tool is active
    When the user clicks a point on the canvas
    Then a new text object appears at that point, is selected, and opens for editing

  Scenario: Edit a text object's content
    Given a text object is open for editing
    When the user types content and commits it (clicking away or pressing Enter)
    Then the object's displayed text updates to match

  Scenario: Apply Bold, Italic, and Underline
    Given a text object is selected
    When the user toggles Bold, Italic, or Underline in the toolbar
    Then the text renders with that styling applied

  Scenario: Change text color and size
    Given a text object is selected
    When the user picks a color or adjusts the size control
    Then the text's color or font size updates to match

  Scenario: Pick a font family
    Given a text object is selected
    When the user picks a font family from the picker
    Then the text renders live on the canvas in that font, loaded from Google Fonts

  Scenario: Export includes text and font data
    Given a text object has font family, size, color, and style set
    When the user exports the collage as ICP JSON
    Then the text's content and all of its style settings are included in the exported data

  Scenario: Static HTML export embeds fonts self-contained
    Given the collage contains a text object using a picked Google Font
    When the user exports HTML
    Then the exported file embeds that font as a base64-encoded @font-face rule, subsetted to the characters actually used, with no external font requests

  Scenario: Static HTML export falls back gracefully when a font can't be fetched
    Given a text object's font can't be fetched at export time (e.g. offline)
    When the user exports HTML
    Then the export still completes, rendering that text in a fallback font instead of failing
```

### Effect Parity for Text Objects
- **Requested:** 2026-07-27
- **Ask:** Let text objects use the same gradient fade, drop shadow, blend mode, and flip effects that images already have. (Shape mask and vignette were initially generalized to text too, but reverted on 2026-07-28 — there's no real-world case for clipping or vignetting a text object the way there is for a photo, so both stay image-only, same as crop.)

```gherkin
Feature: Effect Parity for Text Objects
  # src/types.ts, src/utils/nodeEffects.ts, src/utils/geometry.ts, src/hooks/useGradientMaskDrawer.ts, src/components/CollageTextNode.tsx, src/components/Toolbar.tsx, src/store.ts — tested in src/__tests__/textEffects.test.ts, e2e/text-effects.spec.ts

  Scenario: Draw a gradient fade on a text object
    Given a text object is selected and the Gradient Fade tool is active
    When the user drags from one point to another on the text
    Then the text fades from opaque to transparent along that line

  Scenario: Enable drop shadow or blend mode on a text object
    Given a text object is selected
    When the user enables Drop Shadow, or picks a non-Normal blend mode
    Then the effect applies to the text exactly as it would to an image, and its controls (color, blur, offset, opacity, mode) work the same way

  Scenario: Flip a text object
    Given a text object is selected
    When the user clicks Flip Horizontal or Flip Vertical
    Then the text mirrors about its own center, same as an image

  Scenario: Shape mask, vignette, and crop remain image-only
    Given a text object is selected
    Then the Circle/Rectangle/Polygon Mask tools, the Vignette control, and the Crop tool are not offered for it

  Scenario: Export includes text effect data
    Given a text object has any combination of gradient fade, shadow, blend mode, or flip applied
    When the user exports the collage as ICP JSON or static HTML
    Then those effects are included in the exported data and reproduced in the exported HTML, the same as for images
```

### 3D Objects on the Canvas
- **Requested:** 2026-09-12
- **Ask:** Add any 3D object to the canvas, rotate it in 3 dimensions and control directional lighting — functionally like an image or sticker, except it's a 3D object. (Scoped to a built-in primitive library for this cut; the object model leaves room for imported `.glb`/`.gltf` shapes later without a data migration.)

```gherkin
Feature: 3D Objects on the Canvas
  # src/types.ts, src/utils/model3dRenderer.ts, src/components/CollageModel3DNode.tsx, src/hooks/useModel3DRotator.ts, src/components/Canvas.tsx, src/components/Toolbar.tsx, src/hooks/useCollage.ts, src/App.tsx, src/store/persistence.ts, src/store/exportICP.ts, src/store/exportHTML.ts — tested in src/__tests__/model3d.test.ts, e2e/model-3d.spec.ts

  Scenario: Place a 3D primitive on the canvas
    Given the canvas is open
    When the user picks a shape from the 3D object menu
    Then a lit 3D object of that shape appears at the viewport center, already turned off-axis so it reads as three-dimensional, and is selected

  Scenario: Orbit a 3D object in three dimensions
    Given a 3D object is selected and the 3D Rotate tool is active
    When the user drags across the canvas
    Then the object yaws with horizontal movement and pitches with vertical movement, and rolls instead of yawing while Shift is held

  Scenario: A whole orbit drag is a single undo step
    Given the user has just orbited a 3D object
    When the user presses Ctrl+Z once
    Then the object returns to the orientation it had before the drag began, not one increment at a time

  Scenario: Control the directional light and surface
    Given a 3D object is selected
    When the user adjusts the light's azimuth, elevation, intensity, color or ambient fill, or the surface's color, metalness or roughness
    Then the object's shading updates to match

  Scenario: A 3D object behaves like any other object
    Given a 3D object is on the canvas
    Then it can be dragged, resized, rotated in the canvas plane, reordered, duplicated, deleted, nudged, marquee-selected, faded with a gradient, blended, flipped, and given a drop shadow that follows its silhouette — the same as an image

  Scenario: Shape mask, vignette, and crop remain image-only
    Given a 3D object is selected
    Then the Circle/Rectangle/Polygon Mask tools, the Vignette control, and the Crop tool are not offered for it

  Scenario: A posed 3D object survives a reload
    Given a 3D object has been posed, lit, and given a surface
    When the app is reloaded
    Then the object comes back with the same shape, orientation, lighting, and material

  Scenario: Export includes 3D object data
    Given a 3D object is on the canvas
    When the user exports the collage as ICP JSON
    Then the object's shape, 3-axis rotation, lighting, and material are included

  Scenario: Static HTML export bakes the 3D object to an image
    Given a 3D object is on the canvas
    When the user exports HTML
    Then the object is rendered once and embedded as a self-contained image at its viewport-relative position, with its opacity, stacking order, shadow, and blend mode preserved

  Scenario: 3D objects degrade gracefully without WebGL
    Given the browser cannot provide a WebGL context
    When a 3D object is placed or loaded
    Then it renders as an outline placeholder that can still be selected, moved, adjusted and deleted, nothing throws, and the HTML export omits it rather than emitting a broken image
```

### Cheap Incremental Saves
- **Requested:** 2026-09-13
- **Ask:** Performance isn't great — fix it, from a DevTools trace of ordinary editing.

```gherkin
Feature: Cheap Incremental Saves
  # src/store/db.ts, src/store/persistence.ts, src/hooks/useCollage.ts, src/utils/model3dRenderer.ts, src/components/Toolbar.tsx — tested in src/__tests__/persistenceCost.test.ts

  Scenario: Adjusting an existing object doesn't rewrite its image data
    Given images are already on the canvas and saved
    When the user changes only metadata — dragging a slider, moving, rotating, restyling
    Then no image blob is written again; only the metadata is re-saved

  Scenario: A newly added image writes its blob once
    Given images are already on the canvas and saved
    When the user adds one more image
    Then exactly one blob is written, not one per image on the canvas

  Scenario: Saving reuses a single database connection
    Given the collage has been saved at least once
    When it is saved again
    Then no new database connection is opened

  Scenario: An undone deletion gets its image data back
    Given an image was deleted and its blob pruned from storage
    When the deletion is undone and the collage saved
    Then the image's blob is written again, and it reloads intact rather than being skipped as missing

  Scenario: A continuous gesture is saved once, not once per frame
    Given the user is dragging a slider or orbiting a 3D object
    When the gesture produces many intermediate states in quick succession
    Then the states collapse into a small number of saves, and the state the gesture settles on is the one persisted

  Scenario: Adding or removing an object is saved immediately
    Given the user adds, duplicates, or deletes an object
    When that change lands
    Then it is persisted right away rather than waiting behind the gesture window

  Scenario: Interacting with a 3D object doesn't allocate a canvas per frame
    Given a 3D object is on the canvas
    When the user orbits it, producing a re-render on every frame
    Then the object is redrawn into the canvas it already owns, rather than a new one being allocated and discarded each frame

  Scenario: Placing the first 3D object doesn't freeze the canvas
    Given no 3D object has been rendered yet this session
    When the user opens the 3D object menu and picks a shape
    Then the WebGL setup cost is paid while the menu is open, so the click that places the object stays responsive
```

### Bounded Undo History
- **Requested:** 2026-09-13
- **Ask:** The app is taking up a lot of memory.

```gherkin
Feature: Bounded Undo History
  # src/hooks/useHistory.ts — tested in src/__tests__/history.test.ts

  Scenario: The undo stack has a fixed depth
    Given the user has made more changes than the history limit
    When another change is made
    Then the oldest undo steps are dropped and the most recent ones are still undoable

  Scenario: Aged-out steps stop retaining their contents
    Given an image was deleted long enough ago that its undo step has aged out
    Then nothing in the history still refers to that image, so its data can be reclaimed
```

### Colour and Texture on 3D Objects
- **Requested:** 2026-09-13
- **Ask:** I want to set the color and texture of the object.

```gherkin
Feature: Colour and Texture on 3D Objects
  # src/types.ts, src/utils/texturePatterns.ts, src/utils/textureImage.ts, src/utils/model3dRenderer.ts, src/components/CollageModel3DNode.tsx, src/components/Toolbar.tsx, src/store/persistence.ts, src/App.tsx — tested in src/__tests__/model3d.test.ts, e2e/model-3d.spec.ts

  Scenario: Apply a built-in pattern
    Given a 3D object is selected
    When the user picks a texture (checker, grid, stripes, dots, noise, or brushed) from the Texture menu
    Then the pattern is wrapped onto the object's surface

  Scenario: Wrap your own image onto an object
    Given a 3D object is selected
    When the user chooses "Upload Image" from the Texture menu and picks an image
    Then that image becomes the object's surface, downscaled so a large photo doesn't become a large texture

  Scenario: Colour tints whatever is on the surface
    Given a 3D object has a texture applied
    When the user changes the colour swatch
    Then the texture is tinted by that colour rather than replaced by it

  Scenario: Adjust how often the texture repeats
    Given a 3D object has a texture applied
    When the user adjusts the Tiling slider
    Then the pattern repeats that many times across the surface

  Scenario: Clear a texture
    Given a 3D object has a texture applied
    When the user picks "None" from the Texture menu
    Then the object returns to a plain coloured surface

  Scenario: A built-in pattern costs nothing to store
    Given a 3D object uses one of the built-in patterns
    When the collage is saved
    Then the pattern is recorded by name alone, with no image data written

  Scenario: An uploaded texture is stored like any other image
    Given a 3D object uses an uploaded texture
    When the collage is saved
    Then the texture's pixels go to IndexedDB and stay out of the localStorage metadata, and reloading restores them

  Scenario: A lost texture costs the surface, not the object
    Given a 3D object's uploaded texture is missing from storage
    When the app loads
    Then the object still appears with its colour and settings, just untextured

  Scenario: Exports carry the texture
    Given a 3D object has a texture applied
    When the user exports as ICP JSON or static HTML
    Then the texture is included in the JSON, and the baked HTML image shows the textured surface
```

### Legible Toolbar Popup Menus
- **Requested:** 2026-09-13
- **Ask:** I can't see anything in the 3d shape selector dropdown.

```gherkin
Feature: Legible Toolbar Popup Menus
  # src/theme.css, src/App.css — tested in e2e/toolbar-popups.spec.ts

  Scenario: The 3D shape menu is readable against the canvas
    Given the canvas is open
    When the user opens the 3D object menu
    Then the menu is drawn on an opaque panel whose colour clearly contrasts with its option labels, rather than as invisible text floating over the canvas

  Scenario: Every toolbar popup shares that panel
    Given an object is selected
    When the user opens the Blend Mode or Texture menu
    Then those menus are drawn on the same opaque, readable panel

  Scenario: Menu options still pick their value
    Given a toolbar popup is open
    When the user clicks an option
    Then that option is applied and the menu closes
```

### On-Object 3D Rotation Gizmo
- **Requested:** 2026-09-13
- **Ask:** The rotation settings for the shape object are unwieldy — show them as standard interactive elements on the object itself that can be grabbed and rotated. (This replaces the toolbar's X/Y/Z number fields; Shift-snapping takes over from typing an exact angle.)

```gherkin
Feature: On-Object 3D Rotation Gizmo
  # src/components/Model3DRotationGizmo.tsx, src/components/Canvas.tsx, src/components/Toolbar.tsx — tested in e2e/model-3d-gizmo.spec.ts

  Scenario: Rotation rings sit on the selected 3D object
    Given a 3D object is selected
    Then three coloured rings are drawn over it — a flat horizontal one for yaw, a flat vertical one for pitch, and an outer circle for roll — each clear of the resize handles

  Scenario: Grab a ring to turn that one axis
    Given a 3D object is selected
    When the user drags the yaw, pitch, or roll ring
    Then the object turns about only that axis, and the other two angles are left alone

  Scenario: The roll ring winds the object around with the pointer
    Given a 3D object is selected
    When the user drags the outer ring a quarter turn around the object's centre
    Then the object rolls by about a quarter turn, following the pointer's angle rather than its distance

  Scenario: Hold Shift to land on an exact angle
    Given the user is dragging a rotation ring
    When Shift is held
    Then the angle snaps to 15 degree steps

  Scenario: A whole ring drag is a single undo step
    Given the user has just dragged a rotation ring
    When the user presses Ctrl+Z once
    Then the object returns to the orientation it had before the drag began

  Scenario: A ring turns the object without moving or deselecting it
    Given a 3D object is selected
    When the user drags a ring and releases over empty canvas
    Then the object's position is unchanged and it stays selected, with its rings and toolbar controls still on screen

  Scenario: The rings are only offered for 3D objects
    Given the selected object is an image or a text object
    Then no rotation rings are drawn and dragging on empty canvas marquee-selects as usual
```

### Lossless ICP JSON Export
- **Requested:** 2026-10-12
- **Ask:** The JSON export absolutely should include scale information, as well as every other field it was missing, so a file could be re-imported into an identical collage.

```gherkin
Feature: Lossless ICP JSON Export
  # src/store/exportICP.ts, src/App.tsx — tested in src/__tests__/exportICPLossless.test.ts, src/__tests__/store.test.ts

  Scenario: Scale is exported separately from size
    Given an object has been resized so its scale is not 1
    When the user exports the collage as ICP JSON
    Then each node carries its unscaled size and its X/Y scale as well as its displayed size

  Scenario: Switched-off effects keep their settings
    Given an image's drop shadow or vignette has been configured and then switched off
    When the user exports ICP JSON
    Then the shadow or vignette settings are still included, with their enabled flag off

  Scenario: Every object rebuilds identically from its node
    Given an image, a text object, and a 3D object with every property set (including an uploaded texture)
    When the user exports ICP JSON
    Then each object can be rebuilt from its exported node, field for field, with nothing lost

  Scenario: The viewport is exported
    Given the canvas has been panned and zoomed
    When the user exports ICP JSON
    Then the file includes the current pan position and zoom level
```

### Import a Collage from ICP JSON
- **Requested:** 2026-10-12
- **Ask:** Import a collage from an ICP JSON file, being prompted to either add it to or replace the current canvas.

```gherkin
Feature: Import a Collage from ICP JSON
  # src/store/importICP.ts, src/hooks/useCollage.ts, src/hooks/useHistory.ts, src/components/ImportDialog.tsx, src/components/CollageTextNode.tsx, src/components/Canvas.tsx, src/components/Toolbar.tsx, src/App.tsx, src/App.css — tested in src/__tests__/importICP.test.ts, src/__tests__/history.test.ts, e2e/import-json.spec.ts

  Scenario: Import onto an empty canvas
    Given the canvas is empty
    When the user clicks "Import" and picks an ICP JSON file
    Then the file's objects and its pan and zoom are loaded straight away, with no prompt

  Scenario: Choose to add to or replace the current canvas
    Given the canvas already has objects on it
    When the user picks an ICP JSON file to import
    Then a dialog asks whether to add the file's objects to the canvas, replace the canvas with them, or cancel

  Scenario: Add to Canvas
    Given the import dialog is open
    When the user clicks "Add to Canvas"
    Then the existing objects stay, and the imported ones are added on top of them, keeping their own stacking order, and selected

  Scenario: Replace Canvas
    Given the import dialog is open
    When the user clicks "Replace Canvas"
    Then the existing objects are swapped for the file's, and the view moves to the file's saved pan and zoom

  Scenario: Cancel an import
    Given the import dialog is open
    When the user clicks "Cancel" (or presses Escape)
    Then the canvas is unchanged

  Scenario: An import is undone in a single step
    Given the user has just imported a file
    When the user presses Ctrl+Z once
    Then the canvas returns to how it was before the import, even if an imported text object resized itself once its font loaded

  Scenario: An exported collage round-trips
    Given a collage was exported with "Export JSON"
    When that file is imported
    Then every object comes back identical, with its own new id and its image data stored, so it survives a reload

  Scenario: Older files still import
    Given an ICP JSON file from before scale was exported separately
    When it is imported
    Then each object takes its exported size at a scale of 1

  Scenario: An unreadable file is rejected
    Given a file that isn't valid JSON, isn't an ICP export, or has an object the app can't rebuild
    When the user tries to import it
    Then an error explains what's wrong, and the canvas is unchanged
```

### Temporarily Disabled Toolbar Tools
- **Requested:** 2026-10-19
- **Ask:** Temporarily disable some toolbar features that aren't as good as others, starting with the 3D object creation tool and the background generation tool.

```gherkin
Feature: Temporarily Disabled Toolbar Tools
  # src/featureFlags.ts, src/components/Toolbar.tsx — tested in e2e/feature-flags.spec.ts

  Scenario: The 3D object tool is not offered
    Given the canvas is open
    Then the toolbar has no "Add 3D Object" button

  Scenario: The background generation tool is not offered
    Given the canvas is open
    Then the toolbar has no "Generate Background" button

  Scenario: A disabled tool can be switched back on from the URL
    Given the app is opened with ?enable=model3d,backgroundGeneration
    Then the toolbar offers the 3D object and background generation tools again

  Scenario: A 3D object already on the canvas still works
    Given a 3D object was saved to the collage before its tool was disabled
    When the app loads and the user selects it
    Then it renders and its 3D controls are still offered
```

### Descriptive Sticker Generation Errors
- **Requested:** 2026-10-19
- **Ask:** A sticker generation request to OpenAI seemingly timed out — give more descriptive error messages, and double-check the generation code works.

```gherkin
Feature: Descriptive Sticker Generation Errors
  # src/utils/openaiErrors.ts, src/components/StickerGenerator.tsx, src/utils/generateBackground.ts — tested in src/__tests__/openaiErrors.test.ts, e2e/sticker-errors.spec.ts

  Scenario: A successful generation adds the sticker
    Given the user has entered a prompt and an API key
    When OpenAI returns an image
    Then the sticker is added to the canvas, selected, and the dialog closes

  Scenario: A failed request explains what went wrong and what to do
    Given the user submits a sticker request
    When OpenAI rejects it (bad key, unverified organization, out of credits, rate limited, safety-blocked, or a server error)
    Then the error names the likely cause and the fix, followed by the HTTP status, elapsed time, and OpenAI's own message

  Scenario: An unreachable server is reported as a connection problem
    Given the request can't reach api.openai.com at all
    When the user submits a sticker request
    Then the error says OpenAI couldn't be reached and suggests checking the connection, extensions, VPN, or firewall

  Scenario: A request that never answers times out with an explanation
    Given OpenAI doesn't respond
    When 180 seconds pass
    Then the request is stopped and the error says how long it waited, how long generation normally takes, and to check status.openai.com

  Scenario: The wait shows progress and can be cancelled
    Given a sticker request is in progress
    Then the dialog shows the seconds elapsed so far
    When the user clicks Cancel (or presses Escape)
    Then the request is abandoned with no error shown and the form is ready to try again
```

### Sticker Style Presets
- **Requested:** 2026-10-20
- **Ask:** Add a style dropdown to the sticker creation modal whose choice is appended to the prompt sent to the generation API (e.g. "cat smoking a cigar, real photograph").

```gherkin
Feature: Sticker Style Presets
  # src/components/StickerGenerator.tsx, src/App.css — tested in e2e/sticker-styles.spec.ts

  Scenario: The style menu offers the preset styles
    Given the Generate Sticker dialog is open
    Then a Style dropdown offers None, Real Photograph, Line Drawing, Fine Art Illustration, and Clip Art

  Scenario: A picked style is appended to the prompt
    Given the user has entered the prompt "cat smoking a cigar"
    When the user picks "Real Photograph" and generates
    Then the prompt sent to OpenAI begins "cat smoking a cigar, real photograph"

  Scenario: With no style picked the prompt is sent as typed
    Given the Style dropdown is left at None
    When the user generates a sticker
    Then the prompt is sent with nothing appended
```

### Selection Handles Clear of Text
- **Requested:** 2026-10-21
- **Ask:** Pad the selection box around text objects so its resize handles sit clear of the letters (the middle-right handle was covering the last letter, making "hello" read as "hellc").

```gherkin
Feature: Selection Handles Clear of Text
  # src/components/Canvas.tsx — tested in e2e/text-selection-padding.spec.ts

  Scenario: A selected text object's handles don't cover its letters
    Given a text object is selected
    Then every resize handle is drawn outside the text's own box, leaving its first and last letters fully visible

  Scenario: Images keep their handles on their edges
    Given an image is selected
    Then its resize handles sit on the image's edges, as before
```

### Transparent Sticker Output
- **Requested:** 2026-10-27
- **Ask:** After moving to gpt-image-2.5-sunburst, generated stickers came back with a background instead of in sticker format — keep them transparent.

```gherkin
Feature: Transparent Sticker Output
  # src/components/StickerGenerator.tsx, src/utils/openaiErrors.ts — tested in e2e/sticker-transparency.spec.ts

  Scenario: A sticker request asks for a transparent PNG
    Given the user has entered a prompt and an API key
    When the user generates a sticker
    Then the request asks OpenAI for a transparent background in PNG format

  Scenario: The prompt asks for an isolated subject with no scenery
    Given the user has entered a prompt and picked a style
    When the user generates a sticker
    Then the prompt sent begins with their text and style, and asks for an isolated subject on a transparent background with no scenery
```

### Export Selected Objects as PNGs
- **Requested:** 2026-10-27
- **Ask:** Select multiple items and export each of them as its own PNG file.

```gherkin
Feature: Export Selected Objects as PNGs
  # src/App.tsx, src/components/Toolbar.tsx, src/components/CollageImageNode.tsx — tested in e2e/export-png.spec.ts

  Scenario: Each selected object downloads as its own PNG
    Given several objects are on the canvas and some of them are selected
    When the user clicks "Export Selected as PNG"
    Then one PNG downloads per selected object, each with its own filename, and unselected objects are not exported

  Scenario: Each PNG holds just its object
    Given objects are selected
    When the user exports them as PNGs
    Then each PNG is cropped to that object alone at 2x its canvas size, on a transparent background, with no selection handles or other objects drawn in

  Scenario: A masked object keeps its shape and shadow
    Given a selected image has a shape mask and a drop shadow
    When the user exports it as a PNG
    Then the PNG is transparent outside the mask and includes the shadow that follows the mask's outline

  Scenario: The PNG export is only offered with a selection
    Given nothing is selected
    Then the toolbar has no "Export Selected as PNG" button
```
