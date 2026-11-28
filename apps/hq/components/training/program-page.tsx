import type { TrainingProgramsProgram } from "@duna/api";
import type { ReactNode } from "react";
import { PageHeader } from "../shell/page-header";
import { ShellPage } from "../shell/shell-context";
import {
  canRunProgram,
  loadProgram,
  type TrainingContext,
  trainingContext,
} from "./training-data";
import { deniedScreen, TrainingBlockState } from "./training-screen";

export interface ProgramPage {
  readonly context: TrainingContext;
  readonly program: TrainingProgramsProgram;
  /** Runs its practices: a manager or one of its coaches. */
  readonly canRun: boolean;
}

/** Finds the program for a page, or the state to show instead. */
export async function programPage(
  programId: string,
): Promise<
  | { readonly kind: "ok"; readonly page: ProgramPage }
  | { readonly kind: "state"; readonly node: ReactNode }
  | { readonly kind: "missing" }
> {
  const context = await trainingContext();
  if (context.session.access !== "operator")
    return { kind: "state", node: null };
  if (!context.canRead) {
    return { kind: "state", node: deniedScreen(context, "Training") };
  }
  const loaded = await loadProgram(programId);
  if (loaded.state === "not-found") return { kind: "missing" };
  if (loaded.state !== "ok") {
    return {
      kind: "state",
      node: (
        <div className="tr">
          <ShellPage askLabel="Training program" askStarters={[]} />
          <PageHeader title="Program" />
          <TrainingBlockState
            loaded={loaded}
            organization={context.organization}
            what="this program"
          />
        </div>
      ),
    };
  }
  return {
    kind: "ok",
    page: {
      context,
      program: loaded.data,
      canRun: canRunProgram(context, loaded.data),
    },
  };
}
