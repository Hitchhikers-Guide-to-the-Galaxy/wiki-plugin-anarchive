// Shared by the client and the server, so it must stay free of node builtins —
// anything imported here ends up in the browser bundle.

// The asset metadata sidecar. Written by the plugin, never accepted from a
// client, and hidden from every file listing.
export const SIDECAR = '_anarchive.json'
