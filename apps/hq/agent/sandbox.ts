import { defineSandbox } from "eve/sandbox";
import { JustBashSandbox } from "eve/sandbox/just-bash";

// Attachment staging needs a durable filesystem. No shell or file tool is
// exposed to the model; this virtual filesystem holds only that session's files.
export const environment = JustBashSandbox.environment({ autoInstall: false });
export default defineSandbox(() => environment.open());
