import type Ajv from 'ajv';
import { Assembler } from '../assembler';
import Node from '../node';
import { ResourceInsertOptions } from '../type';
import { deepCopy, generateResourceId, Obzvable } from '../util';

export const getResourceInitPropsHelper = <T extends Record<string, unknown>>(
  options: ResourceInsertOptions<Node>
) => {
  const id = options.id || generateResourceId();
  return {
    id,
    type: options.type,
    data: options.data as T,
    context: options.context,
  };
};

export interface ResourceInitProps {
  id: Readonly<string>;
  type: Readonly<string>;
  data: ResourceData;
  context?: Record<string, unknown>;
}

export interface ResourceData {
  [key: string]: unknown;
}

export interface ResourceJSONData {
  type: string;
  data: ResourceData;
}

export abstract class Resource {
  public static type = 'resource';

  public static globalStates: Obzvable;

  public static setGlobalState = (obzvable: Obzvable) => {
    Resource.globalStates = obzvable;
  };

  public static isDataValid = (data: ResourceData) => {
    return true;
  };

  public static isJSONValid = (json: ResourceJSONData) => {
    return true;
  };

  public static validateJSON?: ReturnType<typeof Ajv.prototype.compile>;

  public static getFallbackJSONData: (originalData: ResourceJSONData) => ResourceJSONData;

  public static getInstance = async (
    options: ResourceInsertOptions<Node>
  ): Promise<Resource | undefined> => {
    return;
  };

  public static fromJSON = async (
    json: ResourceJSONData,
    id: string,
    context?: Record<string, unknown>
  ): Promise<Resource | undefined> => {
    return;
  };

  public id: string;
  public type: string;
  public data: ResourceData;
  // user defined event handlers
  private eventHandlers: Record<string, (data?: unknown) => unknown> = {};

  constructor(initProps: ResourceInitProps) {
    if (!Resource.isDataValid(initProps.data)) {
      throw new Error();
    }
    this.id = initProps.id;
    this.type = initProps.type;
    this.data = initProps.data;

    const context = initProps.context;
    const hasContext = typeof context === 'object' && Object.keys(context).length > 0;

    if (
      hasContext &&
      (typeof Resource.globalStates === 'undefined' || context.shouldResetGlobalStates)
    ) {
      Resource.globalStates = new Obzvable();
      Object.keys(context).forEach((key) => {
        if (typeof Resource.globalStates === 'undefined') {
          throw new Error();
        }
        Resource.globalStates.set(key, context[key]);
      });
    }
  }

  public setGlobalState(key: string, value?: unknown) {
    if (!Resource.globalStates) {
      Resource.globalStates = new Obzvable();
    }
    Resource.globalStates.set(key, value);
  }

  public getGlobalStates() {
    if (!Resource.globalStates) {
      return;
    }
    return Resource.globalStates.get();
  }

  public subscribeGlobalState(options: {
    key: string;
    id: string;
    handler: (data: unknown) => void;
    isCustom?: boolean;
  }) {
    if (!Resource.globalStates) {
      Resource.globalStates = new Obzvable();
    }
    return Resource.globalStates.subscribe(options);
  }

  public unsubscribeGlobalState(options: { key: string; id: string; isCustom?: boolean }) {
    if (!Resource.globalStates) {
      return;
    }
    Resource.globalStates.unsubscribe(options);
  }

  public abstract toJSON(): unknown;

  public getData() {
    return deepCopy(this.data);
  }

  public do(event: string, data?: unknown) {
    const handler = this.eventHandlers[event];
    if (typeof handler === 'undefined') {
      return false;
    }
    return handler(data);
  }

  public addEventListener(event: string, handler: (data?: unknown) => unknown) {
    if (!this.eventHandlers) {
      this.eventHandlers = {};
    }
    this.eventHandlers[event] = handler;
  }

  public removeEventListener(event: string) {
    delete this.eventHandlers[event];
  }

  /**
   * Clone current resource
   *
   * @param {Map<Resource, Resource>} resourceMap
   * Mapping of original to copied resources, in cases where multiple resources are being copied (e.g. node.paste).
   * Passing this map allows us to handle cases where a relationship needs to be maintained between resources and a shallow
   * string replace on the data model is not sufficient. For example, for expressmaps the image resource IDs referenced
   * in the expressmap JSON need to match up with the newly cloned image resources.
   * */
  public async clone(resourceMap?: Map<Resource, Resource>) {
    const resourceItem = await Assembler.getRegistryResourceItem(this.type);
    const resource = resourceItem.default.fromJSON(
      { type: this.type, data: this.data },
      generateResourceId()
    );
    return resource;
  }

  // TODO: move setData to node
  // public setData<T>(data: T, isPropsValid: (props: Props) => boolean) {
  //   const newData = { ...this.props, data };
  //   if (!isPropsValid(newData)) {
  //     throw new Error();
  //   } else {
  //     this.props = newData;
  //   }
  // }
}

export default Resource;
