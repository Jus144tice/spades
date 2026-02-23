function timestamp() {
  return new Date().toISOString();
}

export const log = (...args) => console.log(`[${timestamp()}]`, ...args);
export const error = (...args) => console.error(`[${timestamp()}]`, ...args);
export const warn = (...args) => console.warn(`[${timestamp()}]`, ...args);
