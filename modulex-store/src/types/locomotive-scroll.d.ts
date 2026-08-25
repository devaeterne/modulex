declare module 'locomotive-scroll' {
  export interface ILocomotiveScrollOptions {
    el: HTMLElement;
    smooth?: boolean;
    multiplier?: number;
    class?: string;
    // Add other options as needed
    [key: string]: any;
  }

  export default class LocomotiveScroll {
    constructor(options: ILocomotiveScrollOptions);
    init(): void;
    update(): void;
    destroy(): void;
    on(event: string, callback: (args: any) => void): void;
    scrollTo(target: HTMLElement | string | number, options?: any): void;
    start(): void;
    stop(): void;
    // Add other methods as needed
  }
}
