"use client";

import { DunaMark, openDunaAi } from "@duna/ui";
import { ArrowUp } from "lucide-react";
import { useState } from "react";

export function HqPagePrompt({ label }: { readonly label: string }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="hq-page-prompt"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim()) return;
        openDunaAi(value);
        setValue("");
      }}
    >
      <DunaMark decorative size={20} />
      <input
        aria-label={`Ask Duna about ${label.toLowerCase()}`}
        placeholder={`Ask Duna about ${label.toLowerCase()}, or describe a task…`}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button aria-label="Ask Duna" disabled={!value.trim()} type="submit">
        <ArrowUp size={18} aria-hidden />
      </button>
    </form>
  );
}
