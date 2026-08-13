import {
  AddressCollectionMode,
  CollectionMode,
  LinkDisplay,
  initPaymentSheet,
  initStripe,
  presentPaymentSheet,
} from "@stripe/stripe-react-native";
import { Platform } from "react-native";

export interface NativePaymentSheet {
  readonly publishableKey: string;
  readonly paymentIntentId: string;
  readonly paymentIntentClientSecret: string;
  readonly customerId: string;
  readonly customerSessionClientSecret: string;
}

const PAYMENT_SHEET_PREPARATION_TIMEOUT_MS = 15_000;

async function preparePaymentSheetWithTimeout(
  paymentSheet: NativePaymentSheet,
  customerName?: string,
  customerEmail?: string,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        await initStripe({
          merchantIdentifier: "merchant.com.duna.player",
          publishableKey: paymentSheet.publishableKey,
          urlScheme: "duna",
        });
        return initPaymentSheet({
          applePay: { merchantCountryCode: "US" },
          merchantDisplayName: "Duna",
          paymentIntentClientSecret: paymentSheet.paymentIntentClientSecret,
          customerId: paymentSheet.customerId,
          customerSessionClientSecret: paymentSheet.customerSessionClientSecret,
          returnURL: "duna://stripe-redirect",
          link: { display: LinkDisplay.AUTOMATIC },
          allowsDelayedPaymentMethods: false,
          allowsRemovalOfLastSavedPaymentMethod: true,
          style: "alwaysLight",
          defaultBillingDetails: {
            name: customerName,
            email: customerEmail,
          },
          billingDetailsCollectionConfiguration: {
            name: CollectionMode.AUTOMATIC,
            email: CollectionMode.AUTOMATIC,
            address: AddressCollectionMode.AUTOMATIC,
            attachDefaultsToPaymentMethod: true,
          },
          appearance: {
            colors: {
              primary: "#3D6672",
              background: "#F6F5F1",
              componentBackground: "#FFFFFF",
              componentBorder: "#D7DEE8",
              componentDivider: "#E4E7EA",
              componentText: "#1B1B19",
              primaryText: "#1b1b19",
              secondaryText: "#766f61",
              placeholderText: "#777166",
              icon: "#1B1B19",
              error: "#B42318",
            },
            shapes: { borderRadius: 16, borderWidth: 1 },
            primaryButton: {
              colors: {
                background: "#3D6672",
                border: "#3D6672",
                text: "#FFFFFF",
              },
              shapes: { borderRadius: 16, borderWidth: 0, height: 56 },
            },
          },
        });
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                "Duna could not prepare the secure payment sheet. You were not charged; please try again.",
              ),
            ),
          PAYMENT_SHEET_PREPARATION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function presentNativePayment(input: {
  readonly paymentSheet: NativePaymentSheet;
  readonly customerName?: string;
  readonly customerEmail?: string;
}): Promise<"completed" | "cancelled"> {
  if (Platform.OS === "web") {
    throw new Error(
      "Native event payments require the Duna iOS or Android app.",
    );
  }

  const initialized = await preparePaymentSheetWithTimeout(
    input.paymentSheet,
    input.customerName,
    input.customerEmail,
  );
  if (initialized.error) throw new Error(initialized.error.message);

  if (Platform.OS === "ios") {
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
  }

  const presented = await presentPaymentSheet();
  if (presented.error) throw new Error(presented.error.message);
  return presented.didCancel ? "cancelled" : "completed";
}

export const presentNativeEventPayment = presentNativePayment;
