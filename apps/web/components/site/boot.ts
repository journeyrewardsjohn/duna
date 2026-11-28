import { dunaThemeStorageKey } from "@duna/ui/theme";

/**
 * Where the public site keeps a visitor's audience choice ("I play" or "I run
 * a club"). Browser storage on this device only, never sent anywhere: a
 * strictly functional preference, listed in the cookie-policy findings
 * (docs/legal/README.md).
 */
export const siteAudienceStorageKey = "duna-site-audience";

/** Up to three places this visitor searched, newest first. Same storage rules. */
export const siteRecentPlacesStorageKey = "duna-site-recent-places";

/**
 * The first thing in `<body>`: before anything paints it
 * - resolves the theme from the person's choice (`duna-theme`: system, light
 *   or dark, the same key and options as the rest of Duna) and writes it on
 *   `<html>` and on the `<body class="td">` scope, because a design-system
 *   scope does not inherit a theme;
 * - writes the remembered audience on `<html data-audience>`, so the header
 *   shows the right call to action with no flash.
 * Every storage read is guarded: a private window falls back to the defaults.
 */
export const siteBootScript = `(()=>{var d=document,r=d.documentElement,b=d.body,p="system",t="light",a="play";try{var s=localStorage.getItem(${JSON.stringify(dunaThemeStorageKey)});p=s==="light"||s==="dark"?s:"system";a=localStorage.getItem(${JSON.stringify(siteAudienceStorageKey)})==="run"?"run":"play"}catch(e){}try{t=p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p}catch(e){t=p==="dark"?"dark":"light"}r.dataset.themePreference=p;r.dataset.theme=t;r.dataset.audience=a;r.style.colorScheme=t;if(b){b.dataset.theme=t}})();`;
