"use client";

import {
  Button,
  errorToast,
  successToast,
  toast,
  undoToast,
} from "@duna/ui/tideline";
import styles from "./kit.module.css";

export function ToastKitDemo() {
  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <Button
          onClick={() => successToast("Booking confirmed for Sat 10:30 AM")}
          size="sm"
        >
          Success
        </Button>
        <Button
          onClick={() =>
            errorToast("Could not send the reminder.", {
              description: "Nothing was sent. Try again in a moment.",
              reference: "req_9a0c3e51b2d84f7a6e1c0b39",
            })
          }
          size="sm"
        >
          Error with reference
        </Button>
        <Button
          onClick={() =>
            undoToast("Drill archived", {
              onUndo: () => successToast("Drill restored"),
            })
          }
          size="sm"
        >
          Undo with countdown
        </Button>
        <Button
          onClick={() => {
            for (let index = 1; index <= 5; index += 1) {
              toast(`Message ${index} of 5`);
            }
          }}
          size="sm"
          variant="ghost"
        >
          Five at once
        </Button>
      </div>
      <p className={styles.meta}>
        At most three show; the rest wait their turn with their timers paused.
        Errors with a reference stay until dismissed.
      </p>
    </div>
  );
}
