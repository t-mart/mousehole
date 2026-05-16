// Bun inlines this for the frontend as long as it is set. If you're seeing
// errors "ReferenceError: process is not defined", it's because this variable
// is has not been set. (For development, ensure you're using `bun dev`)
export const gitHash = process.env.BUN_PUBLIC_GIT_HASH;
