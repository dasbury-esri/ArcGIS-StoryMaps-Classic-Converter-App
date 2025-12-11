# Grid Block Details and Setup

Supporting a grid block requires setup on a potential grid parent block and a potential grid element or child block.

## Grid Events

Before we jump into the setup, it's important to know what events in the grid process require this setup.

### Adding a grid

The grid block does not use the standard inserter pattern. The process to add a grid starts with a block configured to be a grid element (a possible grid child) that calls the [onCreateGrid](../../packages/storymaps-builder/src/block/utils/grid/index.ts) function with the inserter options for the second grid element. This function checks to see if the block's parent is setup to handle creating a grid, it has [GridContainerState](../../packages/storymaps-builder/src/block/utils/grid/types.ts) interface, and calls the `createGridChild` function (`block.states.gridContainer.createGridChild`) , passing up the block that initiated the `onCreateGrid` request and the inserter options for the second grid element.

The `addGridChild` function will dispatch the [createGridChild](../../packages/storymaps-builder/src/block/utils/grid/events.ts) event. The `createGridChild` handler will do the following:

1. Find the index of the child that initiated grid creation
2. Remove the child
3. Insert a new grid block that index
4. Append the original child as a child of the grid
5. Update the child's `parent` reference to be the grid
6. Update the child's `state.hasLayout` to be `false`
7. Update the child's layout component
8. Append the second grid element as a child of the grid

All of this is setup to handle undo/redo, but that's the general logic for inserting a grid. We need to update the `hasLayout` state and the layout component because we don't want grid children to have drag and drop handles or block layouts. We'll cover that more in the Grid Element Setup section.

### Grid Block's `blockGridConfig`

NOTE: Section and workflow still in progress and this property may change
The `blockGridConfig` builder property specifies what type of elements may be added to the grid, the max number of grid elements, and the default value for inserter options.

Right now, we only support grids for elements with the same type, but in the future, we will support more and will need to give the user options that they can select. For example, a chart that's added to a grid may allow another chart, or a map that connect to the chart.

### Adding a grid element

Once the grid has been created, it handles adding new grid elements. When a user hits the add column button, the grid will dispatch the [addColumnToGrid](../../packages/storymaps-builder/src/blocks/grid/events.ts) event to handle updating its layout data property and appending the child to the grid.

The grid block will use the [AddGridWrapper](../../packages/storymaps-builder/src/components/AddGridWrapper/index.tsx) component to handle the insertion. A grid component can be static, and receive its insert block options from its grid config, e.g. the `Button` component, or it can be dynamic and will open an editor and prompt the user for the insert options e.g. `Chart` and `LargeNumber`. If your block needs input from the user you need to configure that behavior in this component tree.

### Removing a grid element (child)

A grid element block needs to be setup to use the [removePotentialElement](../../packages/storymaps-builder/src/block/utils/grid/index.ts) function. This checks if the block's parent is a grid, and if it is, calls the `onRemoveChild` function on the grid block. If the block's parent is not a grid, the normal `block.remove` function is called.

If there are more than two elements in grid, the grid dispatches the [removeColumnFromGrid](../../packages/storymaps-builder/src/blocks/grid/events.ts) event to update its layout data property and remove the child from the grid.

If there are only two elements left in the grid, we need to remove the grid.

### Removing a grid

To remove a grid, the grid block will call `removeGridChild` on its parent's state and pass up the block that user was trying to delete. That will dispatch the [removeGridChild](../../packages/storymaps-builder/src/block/utils/grid/events.ts) event.

The handler for the event will do the following:

1. Find the index of the grid block
2. Find the remaining child in the grid
3. Remove the grid
4. Upsert the remaining child block at the grid's index
5. Re-parent the remaining grid child
6. Update the child's `hasParent` state to be `true`
7. Update the child's layout component
8. Update the child

As with adding a grid, all of this is setup to handle undo/redo.

## Setup

Now that we've covered main events that are required for Grid block, we can delve into the setup requirements for grid support.

### Grid Container (parent) Setup

Import `makeBlockGridContainer` from the [grid utils](../../packages/storymaps-builder/src/block/utils/grid.ts).

```typescript
import { makeBlockGridContainer } from '../../block/utils/grid';
```

In the constructor, add `makeBlockGridContainer(this, arrayOfSupportedBlockTypes)` to the bottom. We need to add an array of supported block types because some parents may only want certain blocks in their grid. For example, the immersive panel does not allow chart or infographic grids because of space issues. Now your block should be setup to handle the create and remove events, and that covers the setup for grid container.

### Grid Element (child) Setup

Now the setup for grid child may be a bit complicated, but it's mostly making sure props extend interfaces and common functions are called when necessary. We'll use the button block as an example.

Start by importing the following

```typescript
import {
  getIsGridElement,
  makeBlockGridElement,
  onCreateGrid,
  removePotentialElement,
  shouldShowAddGridButton,
} from '../../block/utils/grid';
import type { GridElementBuilderProps, GridElementViewerProps } from '../../block/utils/grid/types';
```

In the constructor, add the following

```typescript
constructor() {
  ...
  makeBlockGridElement(this);
}

```

We need to make sure our `BuilderProps` and `ViewerProps` extend the `GridElementBuilderProps` and `GridElementViewerProps`.

```typescript
export interface ViewerProps extends BlockViewerProps, Data, GridElementViewerProps {...}

export interface BuilderProps extends ViewerProps, BlockBuilderProps, GridElementBuilderProps {...}

```

This will cause some errors, and we'll address those now. Update the `getViewerProps` function to return the following for `isGridElement`.

```typescript
  public override async getViewerProps(): Promise<ViewerProps> {
    return {
      ...
      isGridElement: getIsGridElement(this),
    };
  }
```

You can use `isGridElement` to apply any grid specific styles the block needs.

Update your builder props with the following:

```typescript
 public override async getBuilderProps(): Promise<BuilderProps> {
    return {
      ...,
      delete: removePotentialGridElement.bind(this, this),
      shouldShowAddGridButton: shouldShowAddGridButton(this),
      onCreateGrid: this.onCreateGrid,
    };
```

A couple of notes on these props. Your block may not exactly pass down a `delete` function to the builder, but you need to replace your `this.remove()` with removePotentialGridElement(this). Since we are passing this down here, I'm binding the context of the block to the function so we can pass the correct value down for this. If you have a function that does additional work when removing the block, that may not be compatible with the grid since we need the removal to be atomic for undo/redo.

The `shouldShowAddGridButton` and determines whether your block should display UI for adding a creating a grid element, and `onCreateGrid` will handle the emitting the create grid event, that hasn't been defined yet, so let's do it.

```typescript
  private onCreateGrid = async () => {
    const insertOptions: BlockInsertOptions<Button> = {
      type: Button.type,
      data: { text: '', link: '' },
    };
    onCreateGrid(this, insertOptions);
  };
```

Here we pass along the insert options for the block that we want to add to the grid. You can update your handler to pass along user selections instead of statically defining one here. For example, infographics may require the user to make selections in a dialog. You can key off the add grid option click to show a modal and then emit the results to this handler.

We need to make some updates to the `getLayoutProps` function since we don't want to show drag handles or a lot of the additional block UI when an element is in a grid.

```typescript
  public override getLayoutProps() {
    const isGridElement = getIsGridElement(this);

    return {
      ...super.getLayoutProps(),
      ...(isCompactSpacing(this) ? LAYOUT_SPACING_COMPACT : LAYOUT_SPACING),
      postInserterProps: !isGridElement ? this.getBetweenInserterProps() : undefined,
      preInserterProps: !isGridElement ? this.getBetweenInserterProps(true) : undefined,
      hasDragHandle: !isGridElement,
      dragHandleBackgroundColor: 'transparent',
    };
  }
```

Now we need to make some updates to your block's builder.ts file. Import the `AddGridWrapper`
component

```typescript
import { AddGridWrapper } from '../../components/AddGridWrapper';
```

Wrap your builder component in the `AddGridWrapper`.

```typescript
 <AddGridWrapper
      // NOTE: You need to specify the type for dynamic grid inserts
      blockType='chart'
      shouldShowAddGridButton={props.shouldShowAddGridButton}
      onAddGridItem={props.onCreateGrid}
    >
    ...
</AddGridWrapper>
```

Placement of this wrapper may vary based on your UI. Additional styling updates may be required.

Outside of any styling specific to your block in a grid, this covers the adding support for a grid element. You should be able to add a grid at this point, but the grid block actually won't know what to do with your block, so we need to make some updates to support it.

### Adding a GridBlockConfig

Let's take a look at the [getGridConfig](../../packages/storymaps-builder/src/blocks/grid/utils.ts) function. This returns a `blockGridConfig` based on the types of blocks in a grid. We'll need to add a property to [blockGridConfigs](../../packages/storymaps-builder/src/block/utils/grid/configs.ts) e.g.

```typescript
export const blockGridConfigs: Record<string, BlockGridConfig> = {
  button: {
    supportedBlockTypes: ['button'],
    blockInsertOptions: {
      type: Button.type,
      data: { text: '', link: '' },
    },
    columnMaxByParent: {
      story: 4,
      'immersive-narrative-panel': 2,
    },
  },
  infographics: {
    ...
  }
};
```

go back to `getGridConfig` and add support of returning your block spec

```typescript
export function getGridConfig(blockTypes: string[]): GridConfig {
  const types = new Set(blockTypes);

  if (types.size === 1) {
    switch ([...types][0]) {
      case 'button':
        return blockGridConfigs.button;
      case 'infographics':
        return blockGridConfig.infographics;
      default:
        throw new Error('Unsupported block type in the grid');
    }
  } else {
    throw new Error('Mixed grids are not supported yet');
  }
}
```

This still needs to be thought through to support handling custom add workflows. TBD

## Future Thinking

- Grid that support multiple block types
- Support inserter list in create grid and add column buttons
- different grid configs based on parents
- Get inserter options based on user feedback
