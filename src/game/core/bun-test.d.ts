// Minimal typings for the bun test runner used by sim.test.ts.
declare module "bun:test" {
  type Fn = () => void | Promise<void>;
  export function describe(name: string, fn: Fn): void;
  export function test(name: string, fn: Fn): void;
  export function beforeEach(fn: Fn): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function expect(value: unknown): any;
}
