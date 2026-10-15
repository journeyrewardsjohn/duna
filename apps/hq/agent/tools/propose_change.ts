import { defineTool } from "eve/tools";
import { Actions, Card, CardText, LinkButton } from "chat";
import { askDunaActionInput, proposeAskDunaOperation } from "@duna/api";
import { operatorForSession } from "../runtime";

export default defineTool({
  description:
    "Validate and save an exact proposed Duna change for human review. This never executes the action. The operator must approve in Ask Duna; check change_results afterward.",
  inputSchema: askDunaActionInput,
  label: { start: () => "Preparing a change for your review" },
  async execute(input, ctx) {
    const { actor, conversationId } = await operatorForSession(ctx);
    const action = await proposeAskDunaOperation(actor, conversationId, input);
    // A Chat SDK card gives future adapters the same review handoff as HQ.
    const card = Card({
      title: "Review Duna change",
      children: [
        CardText(action.summary),
        Actions([
          LinkButton({
            label: "Review in Ask Duna",
            url: `${process.env.NEXT_PUBLIC_HQ_URL || process.env.DUNA_HQ_URL || ""}/ask/${conversationId}`,
          }),
        ]),
      ],
    });
    return {
      actionId: action.id,
      status: action.status,
      summary: action.summary,
      operation: action.operation,
      input: action.input,
      expiresAt: action.expiresAt.toISOString(),
      card,
    };
  },
});
