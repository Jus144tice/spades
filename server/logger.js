function timestamp() {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
}

export const log = (...args) => console.log(`[${timestamp()}]`, ...args);
export const error = (...args) => console.error(`[${timestamp()}]`, ...args);
export const warn = (...args) => console.warn(`[${timestamp()}]`, ...args);
