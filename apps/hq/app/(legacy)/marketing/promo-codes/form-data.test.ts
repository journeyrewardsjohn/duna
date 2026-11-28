import { describe, expect, it } from "vitest";
import { readPromoCodeFormData } from "./form-data";

function promoDraft() {
  const formData = new FormData();
  formData.set("name", "Dalhauser offer");
  formData.set("code", "DALHAUSSER20");
  formData.set("discountType", "percent");
  formData.set("discountValue", "20");
  formData.set("currency", "USD");
  formData.set("appliesToAllPlans", "on");
  return formData;
}

describe("promo code form data", () => {
  it("keeps a percentage discount when the review step submits the draft", () => {
    const payload = readPromoCodeFormData(promoDraft());

    expect(payload.promotion.discountType).toBe("percent");
    expect(payload.promotion.discountValue).toBe(2_000);
    expect(payload.promotion.code).toBe("DALHAUSSER20");
  });

  it("identifies a submitted successor without changing its discount rules", () => {
    const formData = promoDraft();
    formData.set("sourcePromoCodeId", "ee4a2d5e-11c4-48c2-a0d8-a1d6577b1a47");

    const payload = readPromoCodeFormData(formData);

    expect(payload.sourcePromoCodeId).toBe(
      "ee4a2d5e-11c4-48c2-a0d8-a1d6577b1a47",
    );
    expect(payload.promotion.discountValue).toBe(2_000);
  });
});
