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

  await initStripe({
    merchantIdentifier: "merchant.com.duna.player",
    publishableKey: input.paymentSheet.publishableKey,
    urlScheme: "duna",
  });
  const initialized = await initPaymentSheet({
    applePay: { merchantCountryCode: "US" },
    merchantDisplayName: "Duna",
    paymentIntentClientSecret: input.paymentSheet.paymentIntentClientSecret,
    customerId: input.paymentSheet.customerId,
    customerSessionClientSecret: input.paymentSheet.customerSessionClientSecret,
    returnURL: "duna://stripe-redirect",
    link: { display: LinkDisplay.AUTOMATIC },
    allowsDelayedPaymentMethods: false,
    allowsRemovalOfLastSavedPaymentMethod: true,
    style: "alwaysLight",
    defaultBillingDetails: {
      name: input.customerName,
      email: input.customerEmail,
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
  if (initialized.error) throw new Error(initialized.error.message);

  const presented = await presentPaymentSheet();
  if (presented.error) throw new Error(presented.error.message);
  return presented.didCancel ? "cancelled" : "completed";
}

export const presentNativeEventPayment = presentNativePayment;
