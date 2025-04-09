import { ExtensionContext } from "@foxglove/extension";

import { initOrientationPanel2D } from "./OrientationPanel2D";

export function activate(extensionContext: ExtensionContext): void {
  extensionContext.registerPanel({ name: "Orientation 2D", initPanel: initOrientationPanel2D });
}
