// Shared by the client and the server, so it must stay free of node builtins —
// anything imported here ends up in the browser bundle.

// The asset metadata sidecar. Written by the plugin, never accepted from a
// client, and hidden from every file listing.
export const SIDECAR = '_anarchive.json'

// What both the list route and the client hide from a file listing. The client
// copy matters most: it is what protects the view when the *remote* site is
// running stock assets and happily lists its own dotfiles.
export const listable = name => !name.startsWith('.') && name !== SIDECAR
