/** How many local edits still wait for the server, readable from anywhere (the update banner decides with it). */

let pending = 0;

export function setPendingEdits(n: number): void {
  pending = n;
}

export function pendingEdits(): number {
  return pending;
}
