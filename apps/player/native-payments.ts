import {
  AddressCollectionMode,
  CollectionMode,
  LinkDisplay,
  initPaymentSheet,
  initStripe,
  presentPaymentSheet,
} from "@stripe/stripe-react-native";
import { Platform } from "react-native";

export interface NativeEventPaymentSheet {
  readonly publishableKey: string;
  readonly paymentIntentId: string;
  readonly paymentIntentClientSecret: string;
  readonly customerId: string;
  readonly customerSessionClientSecret: string;
}

export async function presentNativeEventPayment(input: {
  readonly paymentSheet: NativeEventPaymentSheet;
  readonly customerName?: string;
  readonly customerEmail?: string;
}): Promise<"completed" | "cancelled"> {
  if (Platform.OS === "web") {
    throw new Error(
      "Native event payments require the Duna iOS or Android app.",
    );
  }

  await initStripe({
    publishableKey: input.paymentSheet.publishableKey,
    urlScheme: "duna",
  });
  const initialized = await initPaymentSheet({
    merchantDisplayName: "Duna",
    paymentIntentClientSecret: input.paymentSheet.paymentIntentClientSecret,
    customerId: input.paymentSheet.customerId,
    customerSessionClientSecret: input.paymentSheet.customerSessionClientSecret,
    returnURL: "duna://stripe-redirect",
    link: { display: LinkDisplay.AUTOMATIC },
    allowsDelayedPaymentMethods: false,
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
        primary: "#235A96",
        background: "#F8F7F3",
        componentBackground: "#FFFFFF",
        componentBorder: "#D7DEE8",
        primaryText: "#101828",
        secondaryText: "#667085",
      },
      shapes: { borderRadius: 16, borderWidth: 1 },
    },
  });
  if (initialized.error) throw new Error(initialized.error.message);

  const presented = await presentPaymentSheet();
  if (presented.error) throw new Error(presented.error.message);
  return presented.didCancel ? "cancelled" : "completed";
}
