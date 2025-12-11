# Technical Review Checklist

This checklist is intended to be used before the feature planning phase of the development process. The purpose of this checklist is to ensure designers, PEs, and developers are on the same page about the work needed to finish a new feature and ensure consistency with design. It should also help to identify specific development tasks and lead to better time estimates.

<!-- omit in toc -->
## Table of Contents

- [Design Review](#design-review)
  - [Components](#components)
  - [Internationalization](#internationalization)
  - [Accessibility](#accessibility)
  - [Edge Cases](#edge-cases)
- [Code Review](#code-review)
  - [Architecture](#architecture)
  - [Tasks identification](#tasks-identification)
  - [Accessibility checklist](#accessibility-checklist)

## Design Review

### Components

- [ ] Identify any changes to existing core components (Buttons, form elements, Modal, Cards, etc.) that need to be updated
  - Are these changes a new variant (does not effect current usage)?
  - If not, are these changes compatible with other uses within the app?
- [ ] Identify any changes to existing composite components (ItemBrowser, Map Editor, etc.) that need to be updated
  - Are these changes a new variant (does not effect current usage)?
  - If not, are these changes compatible with other uses within the app?
- [ ] Identify all new components that need to be created
- [ ] Identify any designs that will introduce tech debt to the code base
  - Not using a component that already exists
  - Requires duplicating components
  - Code that will require changes between v1 and vNext designs

### Internationalization

- [ ] Overflow for longer strings
- [ ] Dates/times, numbers, currency can be handled
- [ ] RTL support

### Accessibility

- [ ] Focus/hover states are handled
- [ ] Forms have labels (or plan for screenreader only labels)
- [ ] Long content can be skipped
- [ ] DOM Structure is valid and makes sense (e.g. No buttons/links within button, standard h1-h6 usage, etc.)
- [ ] DOM Structure can support keyboard navigation
- [ ] Supports browser zoom

### Edge Cases

- [ ] Loading and Error states are handled (especially for user input or network requests)
- [ ] Performance check for slow devices and/or slow network
  - Are fallbacks required
- [ ] Designs support odd aspect ratios or small screen sizes
- [ ] Designs works for touch, mouse, and keyboard interaction
- [ ] If using browser components (e.g. video player, etc.), design has considered difference across all supported browsers

## Code Review

### Architecture

- [ ] Inspect any existing code that you will need to refactor, use, or integrate with to make sure you understand how it works
- [ ] Plan high-level architecture for new development work and review with a senior/lead dev

### Tasks identification

- [ ] Identify existing code that needs to be refactored
- [ ] Identify any existing core components that will be used that should be added back to Figma design system for reuse in the future
- [ ] Identify code changes that should be merged to `develop` branch directly instead of going to `feature/*` branch
  - Side effect free code changes not used exclusively by feature
  - Existing component changes
  - Early code refactor to prepare for new features

### Accessibility checklist

When updating an existing component or creating a new component, pay attention to the following a11y checklist to ensure that the updated/new UI is accessible

- [ ] Handle focus/hover states
- [ ] Add Focus management (e.g. when a menu or modal is opened, focus goes inside of it; for modals it traps focus until closed then goes back to the last focused element prior to opening)
- [ ] Handle keyboard navigation for components that contain lists or groupings of interactive child elements (e.g. a radio button group) they should be keyboard navigable via the up and down or left and right keys while Tab should be reserved for moving focus on and off the group
- [ ] Ensure screen reader(s) interpret the UI correctly (consult [Accessibility Testing Resources for StoryMaps](https://mercator1.atlassian.net/wiki/spaces/~5a68c967ed79b82e1322e705/pages/2866216983/Accessibility+Testing+Resources+for+StoryMaps#What-browser-and-Screen-Reader-combination-do-I-test) guide for manual screen reader testing reference)
- [ ] Ensure DOM structure is valid and makes sense (e.g. No buttons/links within button, standard h1-h6 usage, etc.) - consult [Using semantic HTML and ARIA](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/docs/a11y-using-semantic-html-and-aria.md)
  - [ ] use semantic HTML (nav, button, ul/ol, header, etc.) / avoid making static elements like divs clickable.
  - [ ] use ARIA and role attributes only when necessary as the first rule of ARIA is `no ARIA is better than bad ARIA` (consult the [W3C A11Y Authoring Practices](https://www.w3.org/WAI/ARIA/apg/patterns/) examples and [Using ARIA](https://devtopia.esri.com/WebGIS/arcgis-storymaps/blob/develop/docs/a11y-using-semantic-html-and-aria.md#using-aria) for reference)
  - [ ] correct usage of section heading level elements (h1 - h6): do not use them to size text, make sure they occur sequentially

---
[StoryMaps Documentation (Home)](../../README.md)
