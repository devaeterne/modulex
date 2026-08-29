declare module "locomotive-scroll" {
  export interface ILocomotiveScrollOptions {
    el: HTMLElement;
    smooth?: boolean;
    multiplier?: number;
    class?: string;
    // Add other options as needed
    [key: string]: unknown;
  }

  export default class LocomotiveScroll {
    constructor(options: ILocomotiveScrollOptions);
    init(): void;
    update(): void;
    destroy(): void;
    on(event: string, callback: (args: unknown) => void): void;
    scrollTo(target: HTMLElement | string | number, options?: Record<string, unknown>): void;
    start(): void;
    stop(): void;
    // Add other methods as needed
  }
}
