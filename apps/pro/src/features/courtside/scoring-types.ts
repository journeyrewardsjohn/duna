import { type ScoreEvent } from "@duna/league-engine";
import { type OperatorMatches } from "../../../runtime";

export interface PendingScoreEvent {
  readonly sequence: number;
  readonly monotonicCounter: number;
  readonly event: ScoreEvent;
}

export type OperatorMatch = OperatorMatches[number];
