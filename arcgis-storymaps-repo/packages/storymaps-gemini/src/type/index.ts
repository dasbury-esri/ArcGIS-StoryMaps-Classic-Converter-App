import { EventEmitter } from 'events';
import { UserEvent } from '../event';
import Node, { NodeData, NodeDependents, NodeStates } from '../node';
import Resource, {
  ResourceData,
  ResourceJSONData as IItemResourceData,
  type ResourceJSONData,
} from '../resource';

export type GlobalStates = {
  custom: Record<string, unknown>;
};

export type NodeConfig = Record<string, unknown>;

export interface EventEmitterWithProps<T> extends EventEmitter {
  componentProps?: T;
}

export interface ResourceInsertOptions<T> {
  id?: string;
  type: string;
  data: ResourceData;
  root?: T;
  context?: Record<string, unknown>;
  /** JSON Data to validate before insertion */
  jsonDataToValidate?: ResourceJSONData;
  /** If a resource is inserted before the root node is inserted, we need to add a pending error that will be called once root node is inserted */
  addPendingInvalidJsonError?: (params: Parameters<InvalidJsonErrorEventHandler>) => void;
}

/** Type indicating if the node/block is inserted in gemini's builder or viewer mode */
export type GeminiRenderMode = 'builder' | 'viewer';

export interface NodeInsertOptions<T extends Node> {
  /** Unique ID to identify the node. If this is undefined, then it is automatically generated using Gemini's `generateNodeId` util */
  id?: T['id'];
  /** Type of node this represents */
  type: T['type'];
  /** Parent node of this node */
  parent?: Node;
  /** Node configurations */
  config?: T['config'];
  /** Gemini mode (if parent, get mode from parent) */
  mode?: T['mode'];
  /** Index where the node should be inserted. Could also use the `getIndex()` public method from Gemini's Node class to get the index value. */
  index?: number;
  /** List of node ids of this node's children */
  childrenIds?: string[];
  dependents?: NodeDependents;
  /** Data specific to the node */
  data?: T['data'];
  /** Node states used as additional insert options */
  states?: Partial<T['states']>;
  /**
   * Global states passed to root node during node tree initialization.
   * NOTE: only works for root node; for other child nodes this will be ignored
   */
  context?: {};
  /** ID of the resource associated with the node. Use when the node has ONLY ONE resource associated with it. */
  resourceId?: string;
  /** IDs of the resources associated with the node. Use when the node has MORE THAN ONE resource associated with it */
  resourceIds?: string[];
  /** Mapping of resource id to the resource
   *  Eg:
   *
   *  ```js
   *    {
   *      {"r-J5nYMv" => ImageResource},
   *      {"r-gpoE0Q" => VideoResource},
   *      {"r-3lxkLp" => ImageResource},
   *      {"r-rB9lsJ" => StoryThemeResource},
   *    }
      ```
   */
  resourceMap?: Map<string, Resource>;
  /** JSON Data to validate before insertion */
  jsonDataToValidate?: ItemNodeData;
  /** If a node is inserted before the root node is inserted, we need to add a pending error that will be called once root node is inserted */
  addPendingInvalidJsonError?: (params: Parameters<InvalidJsonErrorEventHandler>) => void;
}

export interface NodeRegisterOptions<T extends Node> {
  node: T;
  parent?: T;
  index?: number;
  resourceIds?: string[];
}

export interface NodeRemoveOptions {
  id?: string;
  /** force parent to not update */
  noUpdate?: boolean;
  /**
   * when `true`, do not remove resources.
   * @default false
   */
  keepResources?: boolean;
}

export type NodeUpdateOptions = Partial<{
  data: Partial<NodeData>;
  states: Partial<NodeStates>;
  config: Partial<NodeConfig>;
  dependents: Partial<NodeDependents>;
}>;

export interface NodeJSONOptions {
  includeStates?: boolean;
  replaceNodeID?: {
    idMap: Map<string, string>;
  };
}

export interface ItemData {
  root: string;
  nodes: Record<string, ItemNodeData>;
  resources: Record<string, ItemResourceData>;
  actions?: UserEvent[];
}

export type BlockStates = Record<string, unknown>;
export type ItemResourceData = IItemResourceData;

export interface ItemNodeData {
  /** Type of block that the node represents */
  type: string;
  /** Data pertaining to the node */
  data?: Record<string, unknown> & {
    /** @deprecated String IDs representing the nodes that form the children of this node
     *  NOTE: This is the old data structure */
    children?: string[];
  };
  /** String IDs representing the nodes that form the children of this node
   *  NOTE: This is the current data structure */
  children?: string[];
  /** Object representing the various configurations of the node */
  config?: NodeConfig;
  /** Object representing the node states. NOTE: this property is not persisted in the data model and is mainly used for controlling UI (for example, 'isExtra' state is used when the block acts like a placeholder UI which isn't added to the story until user interacts with it ) */
  states?: NodeStates;
  dependents?: NodeDependents;
}

export interface Registry {
  [key: string]: {
    [key: string]: { load: () => Promise<unknown> };
  };
}

export interface RegistryResourceItem {
  default: typeof Resource;
}

export interface RegistryNodeItem {
  default: typeof Node;
}

export type InvalidJsonErrorEventHandler = (options: {
  type: 'node' | 'resource';
  id: string;
  data: ItemNodeData | ItemResourceData;
}) => void | Promise<void>;
