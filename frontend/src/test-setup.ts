import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// jsdom non ha queste API, che Radix usa per menu e fogli.
Element.prototype.hasPointerCapture ||= () => false;
Element.prototype.releasePointerCapture ||= () => {};
Element.prototype.scrollIntoView ||= () => {};
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
